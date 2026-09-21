/**
 * hifi Sonos Proxy — library-based rewrite (2026-09).
 *
 * All Sonos communication (SSDP discovery, zone group topology, SOAP/UPnP,
 * queue handling) is delegated to @svrooij/sonos. This file is now a thin
 * REST adapter that keeps the exact same API surface the frontend
 * (player/src/core/sonosProvider.ts) expects:
 *
 *   GET  /health
 *   GET  /discover              → { speakers: [{id, name, coordinatorIp, members}] }
 *   GET  /status?ip=<ip>
 *   POST /cast                  → { ip, streamUrl, title, artist }
 *   POST /pause /resume /stop   → { ip }
 *   POST /seek                  → { ip, positionSec }
 *   POST /volume                → { ip, volume }
 *   POST /queue                 → { ip, tracks[], startIndex, playMode }
 *   POST /enqueue               → { ip, streamUrl, title, artist }
 *   POST /next /prev            → { ip }
 *
 * Env:
 *   CAST_PROXY_PORT     default 4321
 *   PROXY_API_KEY       shared secret for mutating endpoints (X-API-Key)
 *   CORS_ORIGIN         default *
 *   NAVIDROME_LAN_URL   rewrite stream URLs so speakers can reach Navidrome on LAN
 *   SONOS_DISCOVERY_HOST  optional static speaker IP — skips SSDP entirely
 *                       (useful in Docker/network setups where multicast fails)
 */

import express from 'express';
import cors from 'cors';
import { SonosManager, SonosDevice, MetaDataHelper } from '@svrooij/sonos';

const PORT = process.env.CAST_PROXY_PORT || 4321;
const API_KEY = process.env.PROXY_API_KEY || '';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const NAVIDROME_LAN_URL = process.env.NAVIDROME_LAN_URL || '';
const DISCOVERY_HOST = process.env.SONOS_DISCOVERY_HOST || '';

// Transcoding for cast receivers: S1-era Sonos hardware (Play:1 etc.) cannot
// play FLAC — Sonos probes the stream URL and rejects with UPnPError 714
// (Illegal MIME-Type). Request mp3 from Navidrome's on-the-fly transcoder for
// ALL cast URLs (metadata already declares audio/mpeg). Set
// SONOS_TRANSCODE_FORMAT='' to stream original formats instead.
const TRANSCODE_FORMAT = process.env.SONOS_TRANSCODE_FORMAT ?? 'mp3';
const TRANSCODE_BITRATE = process.env.SONOS_TRANSCODE_BITRATE ?? '320';

const VALID_PLAY_MODES = ['NORMAL', 'REPEAT_ALL', 'REPEAT_ONE', 'SHUFFLE', 'SHUFFLE_NOREPEAT'];

// ── SonosManager lifecycle ──

const manager = new SonosManager();
let managerReady = false;
let managerInitAt = 0;
let managerInitPromise = null;

async function ensureManager() {
  if (managerReady) return manager;
  if (managerInitPromise) return managerInitPromise;
  managerInitPromise = (async () => {
    if (DISCOVERY_HOST) {
      console.log(`[sonos] initializing from static host ${DISCOVERY_HOST}`);
      await manager.InitializeFromDevice(DISCOVERY_HOST);
    } else {
      console.log('[sonos] initializing via SSDP discovery (10s)');
      await manager.InitializeWithDiscovery(10);
    }
    managerReady = true;
    managerInitAt = Date.now();
    console.log(`[sonos] manager ready, ${manager.Devices.length} device(s)`);
    return manager;
  })();
  try {
    await managerInitPromise;
  } finally {
    managerInitPromise = null;
  }
  return manager;
}

// Re-init at most once per 30s when a lookup fails (new speaker joined, etc.)
let lastRetryInit = 0;
async function refreshManagerIfStale() {
  if (!managerReady || DISCOVERY_HOST) return false;
  if (Date.now() - lastRetryInit < 30_000) return false;
  lastRetryInit = Date.now();
  try {
    const fresh = new SonosManager();
    if (await fresh.InitializeWithDiscovery(5)) {
      Object.assign(manager, fresh); // best effort swap
      managerInitAt = Date.now();
      console.log(`[sonos] manager refreshed, ${manager.Devices.length} device(s)`);
      return true;
    }
  } catch (err) {
    console.warn(`[sonos] manager refresh failed: ${err.message}`);
  }
  return false;
}

// Resolve a device by IP. Falls back to a standalone SonosDevice so commands
// to known-but-undiscovered IPs still work (matches old permissive behavior).
async function getDevice(ip) {
  if (!ip) throw new Error('Missing ip');
  await ensureManager();
  let device = manager.Devices.find(d => d.Host === ip);
  if (!device) {
    await refreshManagerIfStale();
    device = manager.Devices.find(d => d.Host === ip);
  }
  if (!device) {
    console.warn(`[sonos] ip=${ip} not in manager devices — using standalone device`);
    device = new SonosDevice(ip);
    try { await device.LoadDeviceData(); } catch { /* commands will surface the error */ }
  }
  return device;
}

// AVTransport commands must go to the group coordinator.
function coordinatorOf(device) {
  try {
    const coord = device.Coordinator;
    if (coord && coord.Uuid) return coord;
  } catch { /* standalone device */ }
  return device;
}

// ── URL rewriting + validation ──

function rewriteStreamUrl(streamUrl) {
  if (!NAVIDROME_LAN_URL) return streamUrl;
  try {
    const parsed = new URL(streamUrl);
    const lanParsed = new URL(NAVIDROME_LAN_URL);
    parsed.protocol = lanParsed.protocol;
    parsed.host = lanParsed.host;
    // Force Navidrome's on-the-fly transcoder so every speaker model gets a
    // format it can decode (see TRANSCODE_FORMAT note above).
    if (TRANSCODE_FORMAT) {
      parsed.searchParams.set('format', TRANSCODE_FORMAT);
      parsed.searchParams.set('maxBitRate', TRANSCODE_BITRATE);
    }
    return parsed.toString();
  } catch { return streamUrl; }
}

function validateStreamUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch { return false; }
}

// ── Track metadata ──

function buildTrack(streamUrl, title, artist) {
  return {
    TrackUri: streamUrl,
    Title: title || 'Unknown',
    Artist: artist || '',
    UpnpClass: 'object.item.audioItem.musicTrack',
    ProtocolInfo: 'http-get:*:audio/mpeg:*',
    // TrackToMetaData(includeResource=true) always emits duration="<Duration>"
    // — undefined here produced duration="undefined" → Sonos UPnPError 402
    // (Invalid args) on AddMultipleURIsToQueue.
    Duration: '0:00:00',
  };
}

// XML-escape for values we pass as raw strings (the library passes string
// MetaData/URIs through untouched — same contract the old hand-rolled code had).
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function formatTimecode(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Queue helpers ──

// Add tracks to the Sonos queue; returns the 1-based number of the first
// track enqueued. Fast path: AddMultipleURIsToQueue in one call; fallback:
// sequential AddURIToQueue with typed Track metadata (library-encoded).
async function enqueueTracks(av, tracks) {
  if (tracks.length === 0) return 0;
  const urls = tracks.map(t => rewriteStreamUrl(t.streamUrl));
  // TrackToMetaData embeds values WITHOUT XML-escaping — escape here or any
  // '&' in URLs/titles makes the DIDL itself invalid XML (Sonos rejects
  // with UPnPError 804).
  const esc = (s) => (s === undefined || s === null ? s : xmlEscape(s));
  try {
    // Raw-string fast path: Sonos expects CSVs of URIs and DIDL XML.
    const didls = tracks.map((t, i) => MetaDataHelper.TrackToMetaData(buildTrack(xmlEscape(urls[i]), esc(t.title), esc(t.artist)), true) || '');
    const resp = await av.AddMultipleURIsToQueue({
      InstanceID: 0,
      UpdateID: 0,
      NumberOfURIs: tracks.length,
      EnqueuedURIs: xmlEscape(urls.join(',')),
      EnqueuedURIsMetaData: xmlEscape(didls.join(',')),
      ContainerURI: '',
      ContainerMetaData: '',
      DesiredFirstTrackNumberEnqueued: 0,
      EnqueueAsNext: false,
    });
    return resp.FirstTrackNumberEnqueued || 1;
  } catch (err) {
    console.warn(`[sonos] AddMultipleURIsToQueue failed (${err.message}) — falling back to per-track add`);
    let first = 0;
    for (let i = 0; i < tracks.length; i++) {
      const resp = await av.AddURIToQueue({
        InstanceID: 0,
        // Library EncodeTrackUri() only encodeURI()s http URLs — it does NOT
        // XML-escape, so raw '&' in query params produces invalid SOAP XML.
        EnqueuedURI: xmlEscape(urls[i]),
        EnqueuedURIMetaData: buildTrack(urls[i], tracks[i].title, tracks[i].artist),
        DesiredFirstTrackNumberEnqueued: 0,
        EnqueueAsNext: false,
      });
      if (i === 0) first = resp.FirstTrackNumberEnqueued || 1;
    }
    return first;
  }
}

// Make the Sonos queue the active playback source. Filling the queue alone
// does NOT switch sources — without this, Play resumes whatever source was
// last selected on the speaker (e.g. TuneIn radio).
async function setQueueSource(av, coordinator) {
  await av.SetAVTransportURI({
    InstanceID: 0,
    CurrentURI: `x-rincon-queue:${coordinator.Uuid}#0`,
    CurrentURIMetaData: '',
  });
}

// ── Express app ──

const app = express();
// 2mb: /queue pushes up to 500 tracks, each with full auth params in the
// streamUrl — exceeds the 100kb default (PayloadTooLargeError).
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] }));

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers['x-api-key'] || req.query.api_key;
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

for (const route of ['/cast', '/pause', '/resume', '/stop', '/seek', '/volume', '/queue', '/enqueue', '/next', '/prev']) {
  app.use(route, authMiddleware);
}

app.get('/health', (req, res) => {
  res.json({ ok: true, discovery: DISCOVERY_HOST ? `static:${DISCOVERY_HOST}` : 'ssdp', initialized: managerReady });
});

app.get('/discover', async (req, res) => {
  try {
    await ensureManager();
    const groups = new Map();
    for (const d of manager.Devices) {
      const groupName = d.GroupName || d.Name || d.Host;
      if (!groups.has(groupName)) groups.set(groupName, { coordinator: coordinatorOf(d), members: [] });
      groups.get(groupName).members.push({ uuid: d.Uuid, roomName: d.Name, channel: d.ChannelMap || undefined });
    }
    const speakers = [...groups.values()].map(g => ({
      id: g.coordinator.Uuid,
      name: g.coordinator.Name,
      coordinatorIp: g.coordinator.Host,
      members: g.members,
    }));
    res.json({ speakers });
  } catch (err) {
    // No speakers found is not a server error — mirror old empty-result behavior
    console.warn(`[discover] ${err.message}`);
    res.json({ speakers: [] });
  }
});

app.get('/status', async (req, res) => {
  const ip = req.query.ip;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    const device = await getDevice(String(ip));
    const av = coordinatorOf(device).AVTransportService;
    const transport = await av.GetTransportInfo({ InstanceID: 0 });
    const position = await av.GetPositionInfo({ InstanceID: 0 });
    res.json({
      ip,
      state: transport.CurrentTransportState,
      status: transport.CurrentTransportStatus,
      trackURI: position.TrackURI,
      position: position.RelTime,
      duration: position.TrackDuration,
      isPlaying: transport.CurrentTransportState === 'PLAYING',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/cast', async (req, res) => {
  const { ip, streamUrl, title, artist } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (!streamUrl || !validateStreamUrl(streamUrl)) return res.status(400).json({ error: 'Missing or invalid streamUrl' });
  const url = rewriteStreamUrl(streamUrl);
  try {
    const device = await getDevice(ip);
    const coordinator = coordinatorOf(device);
    const av = coordinator.AVTransportService;
    await av.SetAVTransportURI({
      InstanceID: 0,
      // encodeURI() in the library leaves '&' raw → invalid XML
      CurrentURI: xmlEscape(url),
      CurrentURIMetaData: buildTrack(url, title, artist),
    });
    await av.Play({ InstanceID: 0, Speed: '1' });
    res.json({ ok: true, message: `Casting to ${coordinator.Host}` });
  } catch (err) {
    // Log the exact URI the speaker rejected — needed to diagnose 714
    // (Illegal MIME-Type) / 804. Contains credentials; redact before sharing.
    console.error(`[cast] failed: ${err.message} — streamUrl: ${url}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/pause', async (req, res) => {
  try {
    const device = await getDevice(req.body.ip);
    await coordinatorOf(device).AVTransportService.Pause({ InstanceID: 0 });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/resume', async (req, res) => {
  try {
    const device = await getDevice(req.body.ip);
    await coordinatorOf(device).AVTransportService.Play({ InstanceID: 0, Speed: '1' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/stop', async (req, res) => {
  try {
    const device = await getDevice(req.body.ip);
    await coordinatorOf(device).AVTransportService.Stop({ InstanceID: 0 });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/seek', async (req, res) => {
  const { ip, positionSec } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (positionSec === undefined) return res.status(400).json({ error: 'Missing positionSec' });
  try {
    const device = await getDevice(ip);
    await coordinatorOf(device).AVTransportService.Seek({
      InstanceID: 0, Unit: 'REL_TIME', Target: formatTimecode(positionSec),
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/volume', async (req, res) => {
  const { ip, volume } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (volume === undefined || volume < 0 || volume > 100) return res.status(400).json({ error: 'Invalid volume (0-100)' });
  try {
    const device = await getDevice(ip);
    await coordinatorOf(device).RenderingControlService.SetVolume({
      InstanceID: 0, Channel: 'Master', DesiredVolume: Math.round(volume),
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Replace Sonos queue with the client's queue and start at startIndex.
app.post('/queue', async (req, res) => {
  const { ip, tracks, startIndex, playMode } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (!Array.isArray(tracks) || tracks.length === 0 || tracks.length > 500) {
    return res.status(400).json({ error: 'Missing or invalid tracks (max 500)' });
  }
  if (!tracks.every(t => t.streamUrl && validateStreamUrl(t.streamUrl))) {
    return res.status(400).json({ error: 'Invalid track streamUrl' });
  }
  const start = Math.max(0, Math.min(startIndex ?? 0, tracks.length - 1));
  try {
    const device = await getDevice(ip);
    const coordinator = coordinatorOf(device);
    const av = coordinator.AVTransportService;

    await av.Stop({ InstanceID: 0 });
    await av.RemoveAllTracksFromQueue({ InstanceID: 0 });
    const firstTrack = await enqueueTracks(av, tracks);
    await setQueueSource(av, coordinator);
    if (playMode && VALID_PLAY_MODES.includes(playMode)) {
      await av.SetPlayMode({ InstanceID: 0, NewPlayMode: playMode });
    }
    // Jump to the requested start track. Sonos TRACK_NR is 1-based; some
    // firmwares report FirstTrackNumberEnqueued=0 on empty queues.
    const target = firstTrack > 0 ? firstTrack + start : start + 1;
    try {
      await av.Seek({ InstanceID: 0, Unit: 'TRACK_NR', Target: String(target) });
    } catch {
      if (target !== 1) {
        await av.Seek({ InstanceID: 0, Unit: 'TRACK_NR', Target: '1' });
      }
    }
    await av.Play({ InstanceID: 0, Speed: '1' });
    res.json({ ok: true, firstTrack, start });
  } catch (err) {
    // Log the first rewritten URI — diagnosing 714/804 needs the exact URL
    // the speaker rejected. Contains credentials; redact before sharing.
    const debugUrl = tracks.length > 0 ? rewriteStreamUrl(tracks[0].streamUrl) : '(none)';
    console.error(`[queue] failed: ${err.message} — first track URL: ${debugUrl}`);
    res.status(500).json({ error: err.message });
  }
});

// Append a single track to the Sonos queue (Keep Playing / queue additions).
app.post('/enqueue', async (req, res) => {
  const { ip, streamUrl, title, artist } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (!streamUrl || !validateStreamUrl(streamUrl)) return res.status(400).json({ error: 'Missing or invalid streamUrl' });
  try {
    const device = await getDevice(ip);
    const coordinator = coordinatorOf(device);
    const av = coordinator.AVTransportService;

    const firstTrack = await enqueueTracks(av, [{ streamUrl, title, artist }]);
    const transport = await av.GetTransportInfo({ InstanceID: 0 });
    if (transport.CurrentTransportState === 'STOPPED') {
      try {
        await setQueueSource(av, coordinator);
        await av.Seek({ InstanceID: 0, Unit: 'TRACK_NR', Target: String(firstTrack > 0 ? firstTrack : 1) });
      } catch { /* fall through to plain Play */ }
      await av.Play({ InstanceID: 0, Speed: '1' });
    }
    res.json({ ok: true, firstTrack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/next', async (req, res) => {
  try {
    const device = await getDevice(req.body.ip);
    await coordinatorOf(device).AVTransportService.Next({ InstanceID: 0 });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/prev', async (req, res) => {
  try {
    const device = await getDevice(req.body.ip);
    await coordinatorOf(device).AVTransportService.Previous({ InstanceID: 0 });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`🔊 hifi sonos proxy [esc-fix-2026-09-19] on http://0.0.0.0:${PORT}`);
  console.log(`   API key auth: ${API_KEY ? 'enabled' : 'disabled'}`);
  console.log(`   CORS origin: ${ALLOWED_ORIGIN}`);
  console.log(`   Navidrome LAN URL: ${NAVIDROME_LAN_URL || '(not set)'}`);
  console.log(`   Discovery: ${DISCOVERY_HOST ? `static host ${DISCOVERY_HOST}` : 'SSDP multicast'}`);
});
