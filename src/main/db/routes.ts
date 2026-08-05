// ============================================================
// src/main/db/routes.ts
// DB 相关 API 路由注册 — 从 index.ts 抽取为独立模块
// ============================================================

import { dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import type { APIRouter } from '../api/router';
import type { DBConnection } from './connection';
import { t } from '../../common/i18n';

export function registerDBRoutes(router: APIRouter, db: DBConnection): void {
  router.register('db.query', async (params) => {
    const { sql, args } = params as { sql: string; args?: unknown[] };
    return db.execute(sql, args);
  }, { description: 'Execute a SQL query' });

  router.register('db.run', async (params) => {
    const { sql, args } = params as { sql: string; args?: unknown[] };
    return db.run(sql, args);
  }, { description: 'Execute a write statement (INSERT/UPDATE/DELETE etc.)' });

  router.register('db.batch', async (params) => {
    const { sql } = params as { sql: string };
    return db.batch(sql);
  }, { description: 'Execute multiple SQL statements, return per-statement results' });

  // 导出查询结果为 CSV。在主进程直接全量执行+写文件,不经过渲染层的显示行数限制,
  // 也不经 IPC 搬大结果集。未给 filePath 时弹系统保存对话框。
  router.register('db.exportCsv', async (params) => {
    const { sql, filePath } = params as { sql?: string; filePath?: string };
    if (!sql || !sql.trim()) throw new Error(t('error.exportCsvNeedsSql'));

    let outPath = filePath;
    if (!outPath) {
      const win = BrowserWindow.getAllWindows()[0];
      const opts = {
        title: t('dialog.exportCsvTitle'),
        defaultPath: '查询结果.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { canceled: true };
      outPath = r.filePath;
    }

    const rows = await db.execute(sql);
    const csv = rowsToCsv(rows);
    fs.writeFileSync(outPath, '﻿' + csv, 'utf-8'); // UTF-8 BOM 让 Excel 正确识别中文
    return { ok: true, rowCount: rows.length, filePath: outPath };
  }, { description: 'Export query result to CSV file (no row limit)' });

  router.register('db.getTables', async () => db.getTables(),
    { description: 'List all database tables' });

  router.register('db.getSchema', async (params) => {
    const { table } = params as { table: string };
    return db.getSchema(table);
  }, { description: 'Get column schema for a table' });

  // 导出整个数据库的结构(仅表名 + 列头),供 AI 辅助 / 文档使用。
  // 排除 SQLite 系统表(sqlite_%)和应用内部下划线表(如 _lineage)。
  router.register('db.getStructure', async () => {
    const tables = (await db.getTables()).filter(t => !t.startsWith('sqlite_') && !t.startsWith('_'));
    const structure = [];
    for (const table of tables) {
      const cols = await db.getSchema(table);
      structure.push({
        table,
        columns: cols.map(c => ({ name: c.name, type: c.type, pk: c.pk > 0 })),
      });
    }
    return { tables: structure };
  }, { description: 'Export full database structure (table names + columns)' });

  router.register('db.getRowCount', async (params) => {
    const { table } = params as { table: string };
    const rows = await db.execute(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return (rows[0] as Record<string, number>).cnt;
  }, { description: 'Get row count for a table' });
}

/** 行数组 → CSV 字符串(标准 RFC 4180 引号转义;表头取首行列名) */
function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) lines.push(headers.map(h => esc(row[h])).join(','));
  return lines.join('\r\n');
}
