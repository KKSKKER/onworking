// ============================================================
// src/main/db/routes.ts
// DB 相关 API 路由注册 — 从 index.ts 抽取为独立模块
// ============================================================

import type { APIRouter } from '../api/router';
import type { DBConnection } from './connection';

export function registerDBRoutes(router: APIRouter, db: DBConnection): void {
  router.register('db.query', async (params) => {
    const { sql, args } = params as { sql: string; args?: unknown[] };
    return db.execute(sql, args);
  }, { description: 'Execute a SQL query' });

  router.register('db.getTables', async () => db.getTables(),
    { description: 'List all database tables' });

  router.register('db.getSchema', async (params) => {
    const { table } = params as { table: string };
    return db.getSchema(table);
  }, { description: 'Get column schema for a table' });

  router.register('db.getRowCount', async (params) => {
    const { table } = params as { table: string };
    const rows = await db.execute(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return (rows[0] as Record<string, number>).cnt;
  }, { description: 'Get row count for a table' });
}
