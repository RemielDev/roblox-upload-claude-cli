import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR = join(homedir(), '.roblox-upload');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_at TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    asset_type TEXT NOT NULL,
    asset_id TEXT,
    operation_id TEXT,
    status TEXT NOT NULL,
    error TEXT,
    display_name TEXT,
    description TEXT,
    creator_type TEXT,
    creator_id TEXT,
    duration_ms INTEGER,
    session_label TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_at TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    context TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_logged_at ON logs(logged_at DESC);
`);

const insertUpload = db.prepare(`
  INSERT INTO uploads (
    uploaded_at, filename, file_path, file_size, asset_type, asset_id,
    operation_id, status, error, display_name, description,
    creator_type, creator_id, duration_ms, session_label
  ) VALUES (
    @uploaded_at, @filename, @file_path, @file_size, @asset_type, @asset_id,
    @operation_id, @status, @error, @display_name, @description,
    @creator_type, @creator_id, @duration_ms, @session_label
  )
`);

const insertLog = db.prepare(`
  INSERT INTO logs (logged_at, level, message, context)
  VALUES (@logged_at, @level, @message, @context)
`);

export function recordUpload(row) {
  insertUpload.run({
    uploaded_at: new Date().toISOString(),
    filename: row.filename,
    file_path: row.file_path,
    file_size: row.file_size ?? null,
    asset_type: row.asset_type,
    asset_id: row.asset_id ?? null,
    operation_id: row.operation_id ?? null,
    status: row.status,
    error: row.error ?? null,
    display_name: row.display_name ?? null,
    description: row.description ?? null,
    creator_type: row.creator_type ?? null,
    creator_id: row.creator_id ?? null,
    duration_ms: row.duration_ms ?? null,
    session_label: row.session_label ?? null,
  });
}

export function log(level, message, context) {
  insertLog.run({
    logged_at: new Date().toISOString(),
    level,
    message,
    context: context ? JSON.stringify(context) : null,
  });
}

export function listUploads({ limit = 200, status, search } = {}) {
  let sql = 'SELECT * FROM uploads';
  const where = [];
  const params = {};
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (search) {
    where.push('(filename LIKE @search OR asset_id LIKE @search OR display_name LIKE @search)');
    params.search = `%${search}%`;
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY uploaded_at DESC LIMIT @limit';
  params.limit = limit;
  return db.prepare(sql).all(params);
}

export function listLogs({ limit = 200, level } = {}) {
  let sql = 'SELECT * FROM logs';
  const params = { limit };
  if (level) {
    sql += ' WHERE level = @level';
    params.level = level;
  }
  sql += ' ORDER BY logged_at DESC LIMIT @limit';
  return db.prepare(sql).all(params);
}

export function stats() {
  const total = db.prepare('SELECT COUNT(*) as n FROM uploads').get().n;
  const successful = db.prepare("SELECT COUNT(*) as n FROM uploads WHERE status = 'success'").get().n;
  const failed = db.prepare("SELECT COUNT(*) as n FROM uploads WHERE status = 'failed'").get().n;
  const last7 = db.prepare(
    "SELECT COUNT(*) as n FROM uploads WHERE uploaded_at >= datetime('now', '-7 days')"
  ).get().n;
  return { total, successful, failed, last7 };
}

export default db;
