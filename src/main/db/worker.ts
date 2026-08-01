// ============================================================
// src/main/db/worker.ts
// SQLite worker 线程入口 — 接收消息，执行 DB 操作，返回结果
// ============================================================

import { parentPort } from 'node:worker_threads';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

interface WorkerMessage {
  id: number;
  type: 'open' | 'exec' | 'run' | 'close' | 'all';
  dbPath?: string;
  sql?: string;
  params?: unknown[];
}

function send(id: number, result?: unknown, error?: string): void {
  parentPort!.postMessage({ id, result, error });
}

parentPort!.on('message', (msg: WorkerMessage) => {
  try {
    switch (msg.type) {
      case 'open': {
        db = new Database(msg.dbPath!, { /* no WAL for worker */ });
        // Enable WAL mode for better concurrent read performance
        db.pragma('journal_mode = WAL');
        send(msg.id, { ok: true });
        break;
      }

      case 'exec': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        const stmt = db.prepare(msg.sql!);
        const result = msg.params ? stmt.all(...msg.params) : stmt.all();
        send(msg.id, result);
        break;
      }

      case 'run': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        const stmt = db.prepare(msg.sql!);
        const info = msg.params ? stmt.run(...msg.params) : stmt.run();
        send(msg.id, { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
        break;
      }

      case 'all': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        const stmt = db.prepare(msg.sql!);
        const rows = msg.params ? stmt.all(...msg.params) : stmt.all();
        send(msg.id, rows);
        break;
      }

      case 'close': {
        if (db) { db.close(); db = null; }
        send(msg.id, { ok: true });
        break;
      }
    }
  } catch (err) {
    send(msg.id, undefined, (err as Error).message);
  }
});
