// ============================================================
// src/main/db/worker.ts
// SQLite worker 线程入口 — 接收消息，执行 DB 操作，返回结果
// ============================================================

import { parentPort } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { executeMulti, lastReaderRows, aggregateRun } from './executor';

let db: Database.Database | null = null;

interface WorkerMessage {
  id: number;
  type: 'open' | 'exec' | 'run' | 'close' | 'all' | 'batch';
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
        db = new Database(msg.dbPath!, { /* WAL enabled below */ });
        // Enable WAL mode for better concurrent read performance
        db.pragma('journal_mode = WAL');
        send(msg.id, { ok: true });
        break;
      }

      case 'exec': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        db.exec(msg.sql!);
        send(msg.id, { ok: true });
        break;
      }

      case 'batch': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        // 多语句逐条结果;不抛错,error 字段保留部分结果供前端展示
        send(msg.id, executeMulti(db, msg.sql!));
        break;
      }

      case 'run': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        // 带参 → 单语句 + 参数绑定(ETL 管道在用,路径保持原样)
        if (msg.params && msg.params.length > 0) {
          const stmt = db.prepare(msg.sql!);
          const info = stmt.run(...msg.params);
          send(msg.id, { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
          break;
        }
        // 无参 → 支持多语句,聚合写结果
        const { results, error } = executeMulti(db, msg.sql!);
        if (error) throw new Error(error);
        send(msg.id, aggregateRun(results));
        break;
      }

      case 'all': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        // 带参 → 单语句 + 参数绑定
        if (msg.params && msg.params.length > 0) {
          const stmt = db.prepare(msg.sql!);
          const rows = stmt.all(...msg.params);
          send(msg.id, rows);
          break;
        }
        // 无参 → 支持多语句,返回最后一条返回行的结果
        const { results, error } = executeMulti(db, msg.sql!);
        if (error) throw new Error(error);
        send(msg.id, lastReaderRows(results));
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
