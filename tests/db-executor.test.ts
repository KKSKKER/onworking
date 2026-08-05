import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { executeMulti, lastReaderRows, aggregateRun } from '../src/main/db/executor';

// better-sqlite3 是原生模块,当前为 Electron(ABI 125)编译,vitest 跑在系统 Node(ABI 137)
// 无法加载。这里用假 Database 测 executor 的控制流;真实的 db.iterate 拆分/SQLite 语义
// 由 better-sqlite3 保证,在应用运行时验证。

interface FakeStmt {
  reader: boolean;
  all(): unknown[];
  run(): { changes: number; lastInsertRowid: number };
}

function fakeDb(statements: FakeStmt[]): Database.Database {
  return {
    iterate(): IterableIterator<FakeStmt> {
      return statements[Symbol.iterator]();
    },
  } as unknown as Database.Database;
}

const runStmt: FakeStmt = { reader: false, run: () => ({ changes: 1, lastInsertRowid: 5 }) };

describe('executeMulti', () => {
  it('executes a single reader statement and returns rows', () => {
    const db = fakeDb([{ reader: true, all: () => [{ a: 'x', b: 1 }] }]);
    const { results, error } = executeMulti(db, 'SELECT ...');
    expect(error).toBeUndefined();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'rows', columns: ['a', 'b'] });
    expect((results[0] as { rows: unknown[] }).rows).toEqual([{ a: 'x', b: 1 }]);
  });

  it('executes multiple statements in order', () => {
    const db = fakeDb([
      runStmt,
      { reader: false, run: () => ({ changes: 2, lastInsertRowid: 7 }) },
      { reader: true, all: () => [{ a: 'x' }, { a: 'y' }] },
    ]);
    const { results, error } = executeMulti(db, '...;...;...');
    expect(error).toBeUndefined();
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ kind: 'run', changes: 1, lastInsertRowid: 5 });
    expect(results[1]).toMatchObject({ kind: 'run', changes: 2, lastInsertRowid: 7 });
    expect(results[2]).toMatchObject({ kind: 'rows', columns: ['a'] });
    expect((results[2] as { rows: unknown[] }).rows).toEqual([{ a: 'x' }, { a: 'y' }]);
  });

  it('returns error with statement number and keeps partial results', () => {
    const db = fakeDb([
      runStmt,
      { reader: true, all: () => { throw new Error('boom'); } },
      runStmt,
    ]);
    const { results, error } = executeMulti(db, '...;...;...');
    expect(error).toContain('第 2 条语句失败');
    expect(error).toContain('boom');
    expect(results).toHaveLength(1);
  });

  it('returns empty results for empty/whitespace input', () => {
    const db = fakeDb([]);
    expect(executeMulti(db, '  ').results).toEqual([]);
    expect(executeMulti(db, '').results).toEqual([]);
  });
});

describe('lastReaderRows', () => {
  it('returns rows of the last rows result', () => {
    const r1 = { kind: 'rows' as const, columns: ['a'], rows: [{ a: 1 }] };
    const r2 = { kind: 'run' as const, changes: 1, lastInsertRowid: 1 };
    const r3 = { kind: 'rows' as const, columns: ['b'], rows: [{ b: 2 }] };
    expect(lastReaderRows([r1, r2, r3])).toEqual([{ b: 2 }]);
  });

  it('returns [] when there is no rows result', () => {
    expect(lastReaderRows([{ kind: 'run', changes: 1, lastInsertRowid: 1 }])).toEqual([]);
    expect(lastReaderRows([])).toEqual([]);
  });
});

describe('aggregateRun', () => {
  it('sums changes and takes the last rowid', () => {
    const results = [
      { kind: 'run' as const, changes: 2, lastInsertRowid: 10 },
      { kind: 'rows' as const, columns: ['a'], rows: [] },
      { kind: 'run' as const, changes: 3, lastInsertRowid: 20 },
    ];
    expect(aggregateRun(results)).toEqual({ changes: 5, lastInsertRowid: 20 });
  });
});
