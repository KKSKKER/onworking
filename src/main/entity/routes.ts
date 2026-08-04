// ============================================================
// src/main/entity/routes.ts
// Entity 模块 API 路由 — 查询 / 列表 / 获取 / 注册
// ============================================================

import type { APIRouter } from '../api/router';
import type { DBConnection } from '../db/connection';
import { EntityQueryEngine } from './query-engine';
import { getEntity, listEntities, registerEntity } from './entity-registry';
import { t } from '../../common/i18n';

export function registerEntityRoutes(router: APIRouter, db: DBConnection): void {
  const queryEngine = new EntityQueryEngine(db);

  router.register('entity.query', async (params) => {
    const { name, filters } = params as { name: string; filters?: Record<string, string> };
    const entity = getEntity(name);
    if (!entity) throw new Error(t('error.entityNotFound', { name }));
    return queryEngine.execute(entity, filters);
  }, { description: 'Query entity data' });

  router.register('entity.list', async () => listEntities(),
    { description: 'List all defined entities' });

  router.register('entity.get', async (params) => {
    const { name } = params as { name: string };
    return getEntity(name) ?? null;
  }, { description: 'Get entity definition' });

  router.register('entity.register', async (params) => {
    const def = params as unknown as Parameters<typeof registerEntity>[0];
    registerEntity(def);
    return { registered: def.name };
  }, { description: 'Register an entity definition' });
}

export { loadEntitiesFromDir } from './entity-registry';
