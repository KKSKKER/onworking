// ============================================================
// src/main/db/connection.ts
// SQLite worker 封装 — 异步 API over worker_threads
// ============================================================

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { BatchResult } from './executor';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export class DBConnection {
  private worker: Worker;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private _dbPath: string;

  get dbPath(): string { return this._dbPath; }

  constructor(dbPath: string) {
    this._dbPath = dbPath;
    // worker.ts is in the same directory as connection.ts
    this.worker = new Worker(path.join(__dirname, 'worker.js'));

    this.worker.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    });

    this.worker.on('error', (err) => {
      for (const [, p] of this.pending) {
        p.reject(err instanceof Error ? err : new Error(String(err)));
      }
      this.pending.clear();
    });

    // Open the database
    this.send({ type: 'open', dbPath });
  }

  private send(msg: Omit<{ id: number; type: string; dbPath?: string; sql?: string; params?: unknown[] }, 'id'>): Promise<unknown> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...msg });
    });
  }

  async execute(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    return this.send({ type: 'all', sql, params }) as Promise<Record<string, unknown>[]>;
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
    return this.send({ type: 'run', sql, params }) as Promise<{ changes: number; lastInsertRowid: number }>;
  }

  /** 执行多条 SQL 语句,返回逐条结果;失败时 error 字段含语句序号与已执行部分。 */
  async batch(sql: string): Promise<{ results: BatchResult[]; error?: string }> {
    return this.send({ type: 'batch', sql }) as Promise<{ results: BatchResult[]; error?: string }>;
  }

  async exec(sql: string): Promise<void> {
    await this.send({ type: 'exec', sql });
  }

  async getTables(): Promise<string[]> {
    const rows = await this.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    return rows.map(r => String(r.name));
  }

  async getSchema(table: string): Promise<ColumnInfo[]> {
    return this.execute(`PRAGMA table_info('${table}')`) as unknown as Promise<ColumnInfo[]>;
  }

  async close(): Promise<void> {
    await this.send({ type: 'close' });
    this.worker.terminate();
  }
}
