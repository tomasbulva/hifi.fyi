/**
 * SQLite-backed IP ban list — persists across server restarts.
 */

import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

export interface BanEntry {
  ip: string;
  attempts: number;
  banned_until: number | null; // epoch ms, null = permanent
  last_attempt: number;
  manual: number; // 1 = manually banned (permanent, not from failed attempts)
}

const BAN_THRESHOLDS: Record<number, number> = {
  5: 30_000,        // 30 seconds
  10: 60_000,        // 60 seconds
  15: 86_400_000,   // 24 hours
};

const PERMA_BAN_THRESHOLD = 20;

let db: BetterSqlite3.Database;

export function initBanDb(dbPath: string) {
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS bans (
      ip TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      banned_until INTEGER,       -- epoch ms, NULL = permanent
      last_attempt INTEGER DEFAULT 0,
      manual INTEGER DEFAULT 0   -- 1 = manually added permanent ban
    );
  `);
}

export function recordFailedAttempt(ip: string): { banned: boolean; duration: number | null; permanent: boolean } {
  const row = db.prepare('SELECT * FROM bans WHERE ip = ?').get(ip) as BanEntry | undefined;
  const entry: BanEntry = row ?? { ip, attempts: 0, banned_until: null, last_attempt: 0, manual: 0 };

  // Don't increment if already permanently banned
  if (entry.manual === 1 || (entry.banned_until === null && entry.attempts >= PERMA_BAN_THRESHOLD)) {
    return { banned: true, duration: null, permanent: true };
  }

  entry.attempts++;
  entry.last_attempt = Date.now();

  if (entry.attempts >= PERMA_BAN_THRESHOLD) {
    entry.banned_until = null; // permanent
    db.prepare(`INSERT INTO bans (ip, attempts, banned_until, last_attempt, manual)
                VALUES (@ip, @attempts, @banned_until, @last_attempt, @manual)
                ON CONFLICT(ip) DO UPDATE SET
                  attempts=@attempts, banned_until=@banned_until, last_attempt=@last_attempt, manual=@manual`)
      .run(entry);
    return { banned: true, duration: null, permanent: true };
  }

  const banDuration = BAN_THRESHOLDS[entry.attempts];
  if (banDuration) {
    entry.banned_until = Date.now() + banDuration;
    db.prepare(`INSERT INTO bans (ip, attempts, banned_until, last_attempt, manual)
                VALUES (@ip, @attempts, @banned_until, @last_attempt, @manual)
                ON CONFLICT(ip) DO UPDATE SET
                  attempts=@attempts, banned_until=@banned_until, last_attempt=@last_attempt, manual=@manual`)
      .run(entry);
    return { banned: true, duration: banDuration, permanent: false };
  }

  // Not banned yet, just recording the attempt
  db.prepare(`INSERT INTO bans (ip, attempts, banned_until, last_attempt, manual)
              VALUES (@ip, @attempts, @banned_until, @last_attempt, @manual)
              ON CONFLICT(ip) DO UPDATE SET
                attempts=@attempts, last_attempt=@last_attempt`)
    .run(entry);
  return { banned: false, duration: 0, permanent: false };
}

export function recordSuccessfulLogin(ip: string): void {
  // Only clear auto-generated attempt counters, not manual bans
  db.prepare('DELETE FROM bans WHERE ip = ? AND manual = 0').run(ip);
}

export function isBanned(ip: string): { banned: boolean; remaining: number | null; permanent: boolean } {
  const entry = db.prepare('SELECT * FROM bans WHERE ip = ?').get(ip) as BanEntry | undefined;
  if (!entry) return { banned: false, remaining: 0, permanent: false };

  // Manual ban = always permanent
  if (entry.manual === 1) {
    return { banned: true, remaining: null, permanent: true };
  }

  // Auto permanent ban
  if (entry.banned_until === null && entry.attempts >= PERMA_BAN_THRESHOLD) {
    return { banned: true, remaining: null, permanent: true };
  }

  // Temporary ban still active
  if (entry.banned_until && entry.banned_until > Date.now()) {
    return { banned: true, remaining: Math.ceil((entry.banned_until - Date.now()) / 1000), permanent: false };
  }

  return { banned: false, remaining: 0, permanent: false };
}

export function getBanList(): BanEntry[] {
  return db.prepare('SELECT * FROM bans ORDER BY last_attempt DESC').all() as BanEntry[];
}

export function unbanIp(ip: string): boolean {
  const result = db.prepare('DELETE FROM bans WHERE ip = ?').run(ip);
  return result.changes > 0;
}

export function clearAllBans(): void {
  db.prepare('DELETE FROM bans WHERE manual = 0').run();
}

export function addManualBan(ip: string): boolean {
  const result = db.prepare(`
    INSERT INTO bans (ip, attempts, banned_until, last_attempt, manual)
    VALUES (@ip, 0, NULL, @now, 1)
    ON CONFLICT(ip) DO UPDATE SET manual = 1, banned_until = NULL
  `).run({ ip, now: Date.now() });
  return result.changes > 0;
}
