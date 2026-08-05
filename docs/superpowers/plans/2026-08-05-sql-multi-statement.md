# SQL 工作台接口支持多语句实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主进程 SQL 接口接受多语句(`;` 分隔)输入,逐条执行并收集结果;保持现有单语句/带参行为不变;新增 `db.batch` 路由供以后脚本执行使用。前端 UI 一律不动。

**Architecture:** 核心逻辑抽到 `src/main/db/executor.ts` 纯函数 `executeMulti`(用 better-sqlite3 `db.iterate(sql)` 拆分,`stmt.reader` 区分返回行/写语句,失败返回 `error` + 已执行部分)。worker 的 `all`/`run` 在**无参**时改走 `executeMulti`(有参仍走原 `prepare` 单语句路径),并新增 `batch` 消息直接返回逐条结果。

**Tech Stack:** Electron + better-sqlite3 + worker_threads + TypeScript + Vitest

## Global Constraints

- **有参路径必须保持不变**:`db.run(sql, params)` / `db.execute(sql, params)`(ETL 管道在用)继续走 `prepare` 单语句 + 参数绑定。只有**无参**调用才启用多语句拆分。
- 拆分用 `db.iterate(sql)`(正确处理引号内分号、注释,跳过空语句),禁止 `;` 手动 split。
- 任一条失败即停;错误信息格式 `第 N 条语句失败: <message>`;之前的语句已生效(自动提交)。
- `db.batch` 不抛错,返回 `{ results, error? }` 保留部分结果;`db.query`/`db.run` 无参失败时抛错(前端走现有错误显示)。
- 前端 `src/renderer/**` 不改。
- 文案禁止硬编码中文进代码;本功能错误信息出现在 worker 错误消息里,可用中文字面量(与 worker 现有 `'DB not open'` 一致,非界面文案)。
- **测试不用真实 better-sqlite3**:原生模块当前为 Electron(ABI 125)编译,vitest 跑在系统 Node(ABI 137)无法加载;重建会弄坏 Electron 应用。因此 `executeMulti` 用**假 Database 对象**测控制流,`lastReaderRows`/`aggregateRun` 为纯函数直接测;真实的 `db.iterate` 拆分/SQLite 语义由 better-sqlite3 保证、应用运行时验证。

---

### Task 1: `executeMulti` 核心逻辑 + 单元测试

**Files:**
- Create: `src/main/db/executor.ts`
- Test: `tests/db-executor.test.ts`

**Interfaces:**
- Consumes: 无(仅 better-sqlite3 类型)
- Produces: 供 Task 2 使用
  - `export type BatchResult = { kind: 'rows'; columns: string[]; rows: Record<string, unknown>[] } | { kind: 'run'; changes: number; lastInsertRowid: number }`
  - `export function executeMulti(db: Database.Database, sql: string): { results: BatchResult[]; error?: string }`
  - `export function lastReaderRows(results: BatchResult[]): Record<string, unknown>[]`
  - `export function aggregateRun(results: BatchResult[]): { changes: number; lastInsertRowid: number }`

- [ ] **Step 1: 写失败测试** `tests/db-executor.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { executeMulti, lastReaderRows, aggregateRun } from '../src/main/db/executor';

function openDb(): Database.Database {
  return new Database(':memory:');
}

describe('executeMulti', () => {
  it('executes a single SELECT and returns rows', () => {
    const db = openDb();
    db.exec('CREATE TABLE t (a TEXT, b INTEGER); INSERT INTO t VALUES (\'x\', 1)');
    const { results, error } = executeMulti(db, 'SELECT * FROM t');
    expect(error).toBeUndefined();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'rows', columns: ['a', 'b'] });
    expect((results[0] as { rows: unknown[] }).rows).toEqual([{ a: 'x', b: 1 }]);
  });

  it('executes multiple statements in order', () => {
    const db = openDb();
    const { results, error } = executeMulti(
      db,
      'CREATE TABLE t (a TEXT); INSERT INTO t VALUES (\'x\'); INSERT INTO t VALUES (\'y\'); SELECT * FROM t',
    );
    expect(error).toBeUndefined();
    expect(results).toHaveLength(4);
    expect(results[0]).toMatchObject({ kind: 'run' }); // CREATE
    expect(results[1]).toMatchObject({ kind: 'run' }); // INSERT
    expect(results[2]).toMatchObject({ kind: 'run' }); // INSERT
    expect(results[3]).toMatchObject({ kind: 'rows', columns: ['a'] });
    expect((results[3] as { rows: unknown[] }).rows).toEqual([{ a: 'x' }, { a: 'y' }]);
  });

  it('does not split on semicolons inside string literals', () => {
    const db = openDb();
    db.exec('CREATE TABLE t (a TEXT)');
    const { results, error } = executeMulti(db, "INSERT INTO t VALUES ('a;b;c'); SELECT COUNT(*) AS cnt FROM t");
    expect(error).toBeUndefined();
    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ kind: 'rows' });
    expect((results[1] as { rows: unknown[] }).rows).toEqual([{ cnt: 1 }]);
    expect(db.prepare('SELECT a FROM t').get()).toEqual({ a: 'a;b;c' });
  });

  it('returns error with statement number and commits earlier statements', () => {
    const db = openDb();
    db.exec('CREATE TABLE t (a TEXT)');
    const { results, error } = executeMulti(db, 'INSERT INTO t VALUES (\'ok\'); SELECT * FROM nope; INSERT INTO t VALUES (\'after\')');
    expect(error).toContain('第 2 条语句失败');
    expect(results).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS cnt FROM t').get()).toEqual({ cnt: 1 });
  });

  it('returns empty results for empty/whitespace input', () => {
    const db = openDb();
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/db-executor.test.ts`
Expected: FAIL — 找不到 `../src/main/db/executor`。

- [ ] **Step 3: 实现 `src/main/db/executor.ts`**

```ts
// onworking/src/main/db/executor.ts
// 多语句执行核心:用 better-sqlite3 db.iterate 安全拆分语句,逐条执行并收集结果。
import Database from 'better-sqlite3';

export type BatchResult =
  | { kind: 'rows'; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'run'; changes: number; lastInsertRowid: number };

/**
 * 拆分多语句逐条执行。任一条失败即停,返回 error(带语句序号)与已执行部分结果;
 * 之前的语句已生效(自动提交)。空/纯空白输入返回空 results。
 */
export function executeMulti(db: Database.Database, sql: string): { results: BatchResult[]; error?: string } {
  const results: BatchResult[] = [];
  let n = 0;
  try {
    for (const stmt of db.iterate(sql)) {
      n++;
      if (stmt.reader) {
        const rows = stmt.all() as Record<string, unknown>[];
        results.push({ kind: 'rows', columns: rows.length ? Object.keys(rows[0]) : [], rows });
      } else {
        const info = stmt.run();
        results.push({ kind: 'run', changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
      }
    }
    return { results };
  } catch (err) {
    return { results, error: `第 ${n} 条语句失败: ${(err as Error).message}` };
  }
}

/** 取最后一条返回行的结果;没有则返回空数组(供 db.query)。 */
export function lastReaderRows(results: BatchResult[]): Record<string, unknown>[] {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].kind === 'rows') return results[i].rows;
  }
  return [];
}

/** 写语句 changes 求和,lastInsertRowid 取最后一条的(供 db.run)。 */
export function aggregateRun(results: BatchResult[]): { changes: number; lastInsertRowid: number } {
  let changes = 0;
  let lastInsertRowid = 0;
  for (const r of results) {
    if (r.kind === 'run') {
      changes += r.changes;
      lastInsertRowid = r.lastInsertRowid;
    }
  }
  return { changes, lastInsertRowid };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/db-executor.test.ts`
Expected: PASS — 全部用例绿。

- [ ] **Step 5: 提交**

```bash
git add src/main/db/executor.ts tests/db-executor.test.ts
git commit -m "feat(db): executeMulti — 多语句拆分逐条执行(含 lastReaderRows/aggregateRun)"
```

---

### Task 2: worker / connection / routes 接线

**Files:**
- Modify: `src/main/db/worker.ts:34-55`(`all`/`run` 两 case,新增 `batch` case)
- Modify: `src/main/db/connection.ts`(import `BatchResult` + 新增 `batch` 方法)
- Modify: `src/main/db/routes.ts`(新增 `db.batch` 路由)

**Interfaces:**
- Consumes: `executeMulti` / `lastReaderRows` / `aggregateRun` / `BatchResult`(Task 1)
- Produces: 供 renderer(未来)使用 — 路由 `db.batch`(`{ sql }` → `{ results: BatchResult[]; error?: string }`)

- [ ] **Step 1: 修改 `src/main/db/worker.ts`**

顶部 import 加一行(在 `import Database from 'better-sqlite3';` 之后):

```ts
import { executeMulti, lastReaderRows, aggregateRun } from './executor';
```

把 `case 'all'` 替换为(保留带参单语句路径,无参走多语句):

```ts
      case 'all': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        if (msg.params && msg.params.length > 0) {
          const stmt = db.prepare(msg.sql!);
          const rows = stmt.all(...msg.params);
          send(msg.id, rows);
          break;
        }
        const { results, error } = executeMulti(db, msg.sql!);
        if (error) throw new Error(error);
        send(msg.id, lastReaderRows(results));
        break;
      }
```

把 `case 'run'` 替换为:

```ts
      case 'run': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        if (msg.params && msg.params.length > 0) {
          const stmt = db.prepare(msg.sql!);
          const info = stmt.run(...msg.params);
          send(msg.id, { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
          break;
        }
        const { results, error } = executeMulti(db, msg.sql!);
        if (error) throw new Error(error);
        send(msg.id, aggregateRun(results));
        break;
      }
```

在 `case 'all'` 之前(或 `case 'run'` 之后)新增:

```ts
      case 'batch': {
        if (!db) { send(msg.id, undefined, 'DB not open'); break; }
        send(msg.id, executeMulti(db, msg.sql!));
        break;
      }
```

同时把消息类型联合 `type: 'open' | 'exec' | 'run' | 'close' | 'all'` 改为加上 `'batch'`:

```ts
  type: 'open' | 'exec' | 'run' | 'close' | 'all' | 'batch';
```

- [ ] **Step 2: 修改 `src/main/db/connection.ts`**

顶部 import 加一行:

```ts
import type { BatchResult } from './executor';
```

在 `async run(...)` 方法之后、`async exec(...)` 之前新增:

```ts
  async batch(sql: string): Promise<{ results: BatchResult[]; error?: string }> {
    return this.send({ type: 'batch', sql }) as Promise<{ results: BatchResult[]; error?: string }>;
  }
```

- [ ] **Step 3: 修改 `src/main/db/routes.ts`**

在 `db.run` 路由注册之后新增:

```ts
  router.register('db.batch', async (params) => {
    const { sql } = params as { sql: string };
    return db.batch(sql);
  }, { description: 'Execute multiple SQL statements, return per-statement results' });
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run typecheck`
Expected: 无错误。

Run: `npm run build`
Expected: 构建成功(main tsc + renderer vite)。

- [ ] **Step 5: 提交**

```bash
git add src/main/db/worker.ts src/main/db/connection.ts src/main/db/routes.ts
git commit -m "feat(db): all/run 无参时支持多语句 + 新增 db.batch 逐条结果路由"
```

---

## 全量验证(收尾)

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部通过(既有 53 例 + 新增 executor 用例)。

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: 行为核对(可选,不起 GUI)**

用 vitest 已覆盖核心;带参路径(ETL)由既有测试间接覆盖(它们不走本改动路径)。如需手工验证多语句效果,可启动应用在 SQL 工作台粘贴多语句试跑。
