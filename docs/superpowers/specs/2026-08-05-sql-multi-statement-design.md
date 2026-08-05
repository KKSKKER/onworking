# SQL 工作台接口支持多语句 — 设计文档

- 日期: 2026-08-05
- 状态: 方案已确认,待实现
- 范围: 仅主进程 SQL 接口;前端 UI 不动;为以后 SQL 脚本功能留余地

## 背景与目标

当前 SQL 工作台只能执行单条语句:renderer 按首关键字把 SQL 路由到 `db.query`(worker `all` → `prepare().all()`)或 `db.run`(worker `run` → `prepare().run()`),两者都是单语句——better-sqlite3 的 `prepare` 遇多语句直接抛错。

目标:让 SQL 接口接受**多语句**输入(以 `;` 分隔),逐条执行并收集结果;保持现有前端行为不变;新增 `db.batch` 作为未来脚本执行/结果分栏的接口。

## 已确认的决策

1. 只改主进程,不动 renderer(`View4Sql.tsx` 等)。
2. 拆分用**自研 SQL 感知拆分器** `splitStatements`(better-sqlite3 的 Database 没有逐语句迭代 API,`db.exec` 只能整段执行且无结果):正确处理引号/标识符/注释,不误拆字符串内的分号,跳过空段与纯注释段。
3. 每条语句用 `db.prepare(text)` 后 `stmt.reader` 区分"返回行"与"写语句"。
4. 任一条失败即停;之前的语句已执行生效(标准自动提交语义),返回 `error = "第 N 条语句失败: …"`。
5. 同时新增 `db.batch` 路由,返回完整逐条结果,给以后用。

## 实现

### 新文件 `src/main/db/executor.ts`(核心逻辑,纯函数,可单测)

```ts
export type BatchResult =
  | { kind: 'rows'; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'run'; changes: number; lastInsertRowid: number };

/** SQL 感知拆分多语句(顶层分号切分;跳过空段与纯注释段)。 */
export function splitStatements(sql: string): string[];

/** 拆分多语句逐条执行;失败返回 error(前面语句已生效),成功 error 为空。 */
export function executeMulti(db: Database.Database, sql: string):
  { results: BatchResult[]; error?: string }
```

- `splitStatements` 逐字符扫描,维护"行注释/块注释/字符串/标识符引号"状态;在普通状态下遇 `;` 即切分。
- `executeMulti` 对每条语句 `db.prepare(text)`;`stmt.reader` 为真 → `stmt.all()` 收集 `{kind:'rows', columns, rows}`;否则 `stmt.run()` 收集 `{kind:'run', changes, lastInsertRowid}`。
- `catch` 时返回 `{ results, error: \`第 ${已执行条数+1} 条语句失败: ${err.message}\` }`。

辅助函数:

```ts
export function lastReaderRows(results: BatchResult[]): Record<string, unknown>[];
// 从后往前找第一个 kind==='rows',取其 rows;没有则返回 [](供 db.query)

export function aggregateRun(results: BatchResult[]): { changes: number; lastInsertRowid: number };
// 所有 kind==='run' 的 changes 求和,lastInsertRowid 取最后一条的(供 db.run)
```

### 修改 `src/main/db/worker.ts`

- `case 'all'`:调 `executeMulti(db, sql)`;`error` 则抛错;否则返回 `lastReaderRows(results)`。
- `case 'run'`:调 `executeMulti(db, sql)`;`error` 则抛错;否则返回 `aggregateRun(results)`。
- 新增 `case 'batch'`:返回 `executeMulti(db, sql)`(即 `{ results, error }`,不抛错,保留部分结果)。
- `case 'exec'` 不变(已支持多语句,仅用于内部)。

### 修改 `src/main/db/connection.ts`

- 新增方法:
  ```ts
  async batch(sql: string): Promise<{ results: BatchResult[]; error?: string }> {
    return this.send({ type: 'batch', sql }) as Promise<...>;
  }
  ```
- `execute` / `run` 签名不变。

### 修改 `src/main/db/routes.ts`

- 新增路由:
  ```ts
  router.register('db.batch', async (params) => {
    const { sql } = params as { sql: string };
    return db.batch(sql);
  }, { description: 'Execute multiple SQL statements, return per-statement results' });
  ```

### 前端

不动。

## 边界情况 / 错误处理

- 空字符串 / 纯注释 / 只有末尾分号 → `splitStatements` 产出 0 条 → `results: []`。
- 引号/标识符/注释内含 `;` → `splitStatements` 正确识别,不误拆。
- 中途语句失败 → `error` 含语句序号;`db.query`/`db.run` 抛错给前端显示;`db.batch` 返回 error + 已执行部分结果。
- 单语句行为与改前完全一致(1 条语句 → prepare 一次)。

## 测试

`tests/db-executor.test.ts`:
- `splitStatements` 是纯函数,直接真测:多语句切分、字符串/标识符内分号不拆、注释处理、转义引号、空/纯注释输入。
- `executeMulti` 用**假 Database**(`prepare` 返回预设语句,真实走 `splitStatements`)测控制流 —— better-sqlite3 是原生模块、当前为 Electron(ABI 125)编译,vitest 跑系统 Node(ABI 137)无法加载,重建会弄坏 Electron 应用,故不直接用真实库。
- `lastReaderRows` / `aggregateRun`:纯函数直接测。
- 真实的 `prepare` 执行/SQLite 语义由应用运行时验证。

## 不做(非目标)

- 不改前端 UI(编辑器/结果网格/脚本保存加载都不做,留给以后)。
- 不做语句级事务包裹(保持每语句自动提交)。
- 不改 `db.exec`(内部已支持多语句)。
