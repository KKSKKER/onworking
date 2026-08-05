// onworking/src/main/db/executor.ts
// 多语句执行核心:SQL 感知拆分语句,逐条 prepare 执行并收集结果。
// 说明:better-sqlite3 的 Database 没有逐语句迭代 API(db.exec 只能整段执行且不返回结果),
// 因此这里自行做 SQL 感知拆分(正确处理引号/标识符/注释,不误拆字符串内的分号)。
import Database from 'better-sqlite3';

export type BatchResult =
  | { kind: 'rows'; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'run'; changes: number; lastInsertRowid: number };

/** SQL 感知拆分:把多语句按顶层分号切分为单条语句;跳过空段与纯注释段。 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let cur = '';
  let hasCode = false;
  let i = 0;
  const n = sql.length;
  const isWs = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

  while (i < n) {
    const ch = sql[i];
    const nxt = sql[i + 1];

    if (ch === '-' && nxt === '-') {          // 行注释 -- …行尾
      while (i < n && sql[i] !== '\n') { cur += sql[i]; i++; }
      continue;
    }
    if (ch === '/' && nxt === '*') {          // 块注释 /* … */
      cur += '/*'; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { cur += sql[i]; i++; }
      if (i < n) { cur += '*/'; i += 2; }
      continue;
    }
    if (ch === "'") {                         // 字符串字面量 '' 转义
      hasCode = true;
      cur += ch; i++;
      while (i < n) {
        cur += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { cur += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') { // 标识符引号;""/`` 用双写转义,[] 到下一个 ]
      hasCode = true;
      cur += ch; i++;
      const close = ch === '[' ? ']' : ch;
      while (i < n) {
        cur += sql[i];
        if (sql[i] === close) {
          if (sql[i + 1] === close) { cur += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (ch === ';') {                         // 顶层分号 = 语句分隔
      const stmt = cur.trim();
      if (stmt && hasCode) statements.push(stmt);
      cur = '';
      hasCode = false;
      i++;
      continue;
    }
    if (!isWs(ch)) hasCode = true;
    cur += ch;
    i++;
  }
  const tail = cur.trim();
  if (tail && hasCode) statements.push(tail);
  return statements;
}

/**
 * 拆分多语句逐条执行。任一条失败即停,返回 error(带语句序号)与已执行部分结果;
 * 之前的语句已生效(自动提交)。空/纯注释输入返回空 results。
 */
export function executeMulti(db: Database.Database, sql: string): { results: BatchResult[]; error?: string } {
  const results: BatchResult[] = [];
  let n = 0;
  try {
    for (const text of splitStatements(sql)) {
      n++;
      const stmt = db.prepare(text);
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
    const r = results[i];
    if (r.kind === 'rows') return r.rows;
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
