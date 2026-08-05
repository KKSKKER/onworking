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
