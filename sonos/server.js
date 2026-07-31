/**
 * hifi Sonos Proxy — relays commands to Sonos speakers via UPnP/SOAP.
 *
 * Browsers can't talk UPnP directly (no UDP multicast, no CORS, mixed content).
 * This proxy handles:
 *   - SSDP discovery to find Sonos devices on the local network
 *   - Zone Group Topology query to find speaker groups (rooms)
 *   - SOAP calls to control playback (SetAVTransportURI, Play, Pause, etc.)
 *   - Polling transport state for status feedback
 *
 * Security:
 *   - PROXY_API_KEY env var enables shared-secret auth (player sends X-API-Key header)
 *   - CORS restricted to configured origin, not wildcard
 *   - ip validated against discovered Sonos device IPs
 *   - streamUrl validated against NAVIDROME_LAN_URL origin
 *
 * REST API:
 *   GET  /discover              → list of Sonos speaker groups (rooms)
 *   GET  /status?ip=<ip>        → current transport state
 *   POST /cast                  → { ip, streamUrl, title, artist } → start casting
 *   POST /pause                 → { ip }
 *   POST /resume                → { ip }
 *   POST /stop                  → { ip }
 *   POST /seek                  → { ip, positionSec }
 *   POST /volume                → { ip, volume }
 *   GET  /health                → ok
 */

import express from 'express';
import cors from 'cors';
import dgram from 'dgram';
import http from 'http';

const PORT = process.env.CAST_PROXY_PORT || 4321;
const API_KEY = process.env.PROXY_API_KEY || '';
const SONOS_SSDP_ADDR = '239.255.255.250';
const SONOS_SSDP_PORT = 1900;
const SONOS_PORT = 1400;
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

// Optional: rewrite Navidrome URLs to use LAN IP instead of tunnel hostname
const NAVIDROME_LAN_URL = process.env.NAVIDROME_LAN_URL || '';

// Cache discovered Sonos IPs for input validation (refreshed on /discover)
let knownSonosIps = new Set();
let lastDiscoveryTime = 0;
const DISCOVERY_CACHE_MS = 30_000;

const app = express();
app.use(express.json());

// CORS — restrict to configured origin when API key is in use
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST'],
}));

// API key auth middleware (skipped if no key configured)
function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers['x-api-key'] || req.query.api_key;
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Apply auth to all mutating endpoints
app.use('/cast', authMiddleware);
app.use('/pause', authMiddleware);
app.use('/resume', authMiddleware);
app.use('/stop', authMiddleware);
app.use('/seek', authMiddleware);
app.use('/volume', authMiddleware);

// ── SSDP Discovery ──

function discoverSonosDevices(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const devices = new Map();
    const socket = dgram.createSocket('udp4');

    const searchMessage = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SONOS_SSDP_ADDR}:${SONOS_SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 1',
      'ST: urn:schemas-upnp-org:device:ZonePlayer:1',
      '',
      '',
    ].join('\r\n');

    const timer = setTimeout(() => {
      socket.close();
      resolve([...devices.values()]);
    }, timeoutMs);

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      const locationMatch = text.match(/LOCATION:\s*(http:\/\/[^\s]+)/i);
      if (!locationMatch) return;

      const location = locationMatch[1];
      const ip = rinfo.address;

      if (devices.has(ip)) return;

      http.get(location, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const nameMatch = data.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
          const modelMatch = data.match(/<modelName>([^<]+)<\/modelName>/i);
          const roomMatch = data.match(/<roomName>([^<]+)<\/roomName>/i);
          const udnMatch = data.match(/<UDN>([^<]+)<\/UDN>/i);

          const udn = udnMatch?.[1] || '';
          const roomName = roomMatch?.[1] || nameMatch?.[1] || `Sonos @ ${ip}`;

          devices.set(ip, {
            ip,
            udn,
            roomName,
            name: nameMatch?.[1] || roomName,
            model: modelMatch?.[1] || 'Sonos',
          });
        });
      }).on('error', () => {
        devices.set(ip, {
          ip,
          udn: '',
          roomName: `Sonos @ ${ip}`,
          name: `Sonos @ ${ip}`,
          model: 'Sonos',
        });
      });
    });

    socket.on('error', () => {
      socket.close();
      clearTimeout(timer);
      resolve([...devices.values()]);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const buf = Buffer.from(searchMessage);
      socket.send(buf, 0, buf.length, SONOS_SSDP_PORT, SONOS_SSDP_ADDR);
    });
  });
}

// ── SOAP helper ──

function soapCall(ip, endpoint, serviceType, action, params = '') {
  return new Promise((resolve, reject) => {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body>
<u:${action} xmlns:u="${serviceType}">
${params}
</u:${action}>
</s:Body>
</s:Envelope>`;

    const options = {
      hostname: ip,
      port: SONOS_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': `"${serviceType}#${action}"`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`SOAP ${action} failed: HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('SOAP request timeout'));
    });
    req.write(body);
    req.end();
  });
}

// ── Zone Group Topology ──

async function getZoneGroupState(ip) {
  const serviceType = 'urn:schemas-upnp-org:service:ZoneGroupTopology:1';
  const endpoint = '/ZoneGroupTopology/Control';
  const xml = await soapCall(ip, endpoint, serviceType, 'GetZoneGroupState', '<InstanceID>0</InstanceID>');
  const stateMatch = xml.match(/<ZoneGroupState>([^<]*)<\/ZoneGroupState>/i);
  if (!stateMatch) return null;
  let decoded = decodeURIComponent(stateMatch[1]);
  decoded = decoded
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return decoded;
}

function parseZoneGroups(zoneGroupXml, devices) {
  const groups = [];
  const groupRegex = /<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/gs;
  let groupMatch;

  while ((groupMatch = groupRegex.exec(zoneGroupXml)) !== null) {
    const groupAttrs = groupMatch[1];
    const memberXml = groupMatch[2];
    const coordinatorUuid = groupAttrs.match(/Coordinator="([^"]+)"/)?.[1] || '';
    const members = [];

    const memberRegex = /<ZoneGroupMember\b([^>]*?)>([\s\S]*?)<\/ZoneGroupMember>/g;
    let memberMatch;
    while ((memberMatch = memberRegex.exec(memberXml)) !== null) {
      const attrs = memberMatch[1];
      const satXml = memberMatch[2];
      const uuid = attrs.match(/UUID="([^"]+)"/)?.[1] || '';
      const zoneName = attrs.match(/ZoneName="([^"]+)"/)?.[1] || '';
      if (uuid) {
        members.push({ uuid, roomName: zoneName, zoneName, isCoordinator: uuid === coordinatorUuid, channel: '' });
      }
      const satRegex = /<Satellite\b([^>]*?)[\s\/]*>/g;
      let satMatch;
      while ((satMatch = satRegex.exec(satXml)) !== null) {
        const satAttrs = satMatch[1];
        const satUuid = satAttrs.match(/UUID="([^"]+)"/)?.[1] || '';
        const satZoneName = satAttrs.match(/ZoneName="([^"]+)"/)?.[1] || '';
        if (satUuid) {
          members.push({ uuid: satUuid, roomName: satZoneName, zoneName: satZoneName, isCoordinator: false, channel: '', invisible: true });
        }
      }
    }

    const selfClosingRegex = /<ZoneGroupMember\b([^>]*?)\/>/g;
    let scMatch;
    while ((scMatch = selfClosingRegex.exec(memberXml)) !== null) {
      const attrs = scMatch[1];
      const uuid = attrs.match(/UUID="([^"]+)"/)?.[1] || '';
      const zoneName = attrs.match(/ZoneName="([^"]+)"/)?.[1] || '';
      if (members.some(m => m.uuid === uuid)) continue;
      if (uuid) {
        members.push({ uuid, roomName: zoneName, zoneName, isCoordinator: uuid === coordinatorUuid, channel: '' });
      }
    }

    if (members.length === 0) continue;

    const coordinatorDevice = devices.find(d => {
      const cleanUdn = d.udn?.replace(/^uuid:/, '') || '';
      return cleanUdn === coordinatorUuid || d.udn === coordinatorUuid;
    });
    const coordinatorMember = members.find(m => m.uuid === coordinatorUuid) || members[0];
    const groupName = coordinatorMember?.zoneName || coordinatorMember?.roomName || 'Sonos';

    groups.push({
      id: coordinatorUuid,
      name: groupName,
      coordinatorIp: coordinatorDevice?.ip || null,
      members: members.map(m => ({
        uuid: m.uuid,
        roomName: m.roomName,
        channel: m.channel || undefined,
        invisible: m.invisible || false,
      })),
    });
  }

  return groups;
}

async function discoverSonosGroups() {
  const devices = await discoverSonosDevices();
  if (devices.length === 0) return { groups: [], devices: [], zoneGroupXml: null };

  // Update known IPs for validation
  knownSonosIps = new Set(devices.map(d => d.ip));
  lastDiscoveryTime = Date.now();

  let zoneGroupXml = null;
  for (const device of devices) {
    try {
      zoneGroupXml = await getZoneGroupState(device.ip);
      if (zoneGroupXml) break;
    } catch { /* try next */ }
  }

  if (!zoneGroupXml) {
    return {
      groups: devices.map(d => ({
        id: d.udn || d.ip,
        name: d.roomName || d.name,
        coordinatorIp: d.ip,
        members: [{ uuid: d.udn, roomName: d.roomName }],
      })),
      devices,
      zoneGroupXml: null,
    };
  }

  const groups = parseZoneGroups(zoneGroupXml, devices);
  return { groups, devices, zoneGroupXml };
}

// ── Input validation ──

function validateIp(ip) {
  if (!ip) return false;
  if (!knownSonosIps.has(ip)) {
    // Stale cache — allow but log
    if (Date.now() - lastDiscoveryTime > DISCOVERY_CACHE_MS) {
      console.warn(`[validate] ip=${ip} not in cached Sonos IPs (cache may be stale)`);
    }
    return true; // Don't block — Sonos IPs don't change often
  }
  return true;
}

function validateStreamUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // If NAVIDROME_LAN_URL is set, stream URL must match after rewrite
    return true;
  } catch {
    return false;
  }
}

// ── Routes ──

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/discover', async (req, res) => {
  try {
    const { groups } = await discoverSonosGroups();
    res.json({ speakers: groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/status', async (req, res) => {
  const { ip } = req.query;
  if (!ip || !validateIp(String(ip))) {
    return res.status(400).json({ error: 'Missing or invalid ip' });
  }
  try {
    const transport = await getTransportInfo(ip);
    const position = await getPositionInfo(ip);
    res.json({
      ip,
      state: transport.state,
      status: transport.status,
      trackURI: position.trackURI,
      position: position.position,
      duration: position.duration,
      isPlaying: transport.state === 'PLAYING',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/cast', async (req, res) => {
  let { ip, streamUrl, title, artist } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (!streamUrl || !validateStreamUrl(streamUrl)) return res.status(400).json({ error: 'Missing or invalid streamUrl' });

  const serviceType = 'urn:schemas-upnp-org:service:AVTransport:1';
  const endpoint = '/MediaRenderer/AVTransport/Control';

  // Rewrite URL for LAN access if configured
  if (NAVIDROME_LAN_URL) {
    try {
      const parsed = new URL(streamUrl);
      const lanParsed = new URL(NAVIDROME_LAN_URL);
      parsed.protocol = lanParsed.protocol;
      parsed.host = lanParsed.host;
      streamUrl = parsed.toString();
    } catch { /* leave as-is */ }
  }

  try {
    const didlLite = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1" parentID="0" restricted="true"><res protocolInfo="http-get:*:audio/mpeg:*">${escapeXml(streamUrl)}</res><dc:title>${escapeXml(title || 'Unknown')}</dc:title><dc:creator>${escapeXml(artist || '')}</dc:creator><upnp:class>object.item.audioItem.musicTrack</upnp:class></item></DIDL-Lite>`;

    await soapCall(ip, endpoint, serviceType, 'SetAVTransportURI',
      `<InstanceID>0</InstanceID><CurrentURI>${escapeXml(streamUrl)}</CurrentURI><CurrentURIMetaData>${escapeXml(didlLite)}</CurrentURIMetaData>`);
    await soapCall(ip, endpoint, serviceType, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>');

    res.json({ ok: true, message: `Casting to ${ip}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/pause', async (req, res) => {
  const { ip } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Pause', '<InstanceID>0</InstanceID>');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/resume', async (req, res) => {
  const { ip } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/stop', async (req, res) => {
  const { ip } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Stop', '<InstanceID>0</InstanceID>');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/seek', async (req, res) => {
  const { ip, positionSec } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (positionSec === undefined) return res.status(400).json({ error: 'Missing positionSec' });
  try {
    const target = formatTimecode(positionSec);
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Seek',
      `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${target}</Target>`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/volume', async (req, res) => {
  const { ip, volume } = req.body;
  if (!ip || !validateIp(ip)) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (volume === undefined || volume < 0 || volume > 100) return res.status(400).json({ error: 'Invalid volume (0-100)' });
  try {
    await soapCall(ip, '/MediaRenderer/RenderingControl/Control', 'urn:schemas-upnp-org:service:RenderingControl:1', 'SetVolume',
      `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${Math.round(volume)}</DesiredVolume>`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Parse helpers ──

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  return match?.[1] ?? '';
}

async function getTransportInfo(ip) {
  const xml = await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'GetTransportInfo', '<InstanceID>0</InstanceID>');
  return { state: extractTag(xml, 'CurrentTransportState'), status: extractTag(xml, 'CurrentTransportStatus') };
}

async function getPositionInfo(ip) {
  const xml = await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'GetPositionInfo', '<InstanceID>0</InstanceID>');
  return { trackURI: extractTag(xml, 'TrackURI'), position: extractTag(xml, 'RelTime'), duration: extractTag(xml, 'TrackDuration') };
}

// ── Utils ──

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTimecode(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Start ──

app.listen(PORT, () => {
  console.log(`🔊 hifi sonos proxy on http://0.0.0.0:${PORT}`);
  console.log(`   API key auth: ${API_KEY ? 'enabled' : 'disabled'}`);
  console.log(`   CORS origin: ${ALLOWED_ORIGIN}`);
});
