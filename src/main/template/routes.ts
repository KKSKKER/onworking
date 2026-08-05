// onworking/src/main/template/routes.ts
import * as fs from 'node:fs';
import type { APIRouter } from '../api/router';
import { TemplateStore, TemplateMapping } from './template-store';

export function registerTemplateRoutes(router: APIRouter): void {
  function getStore(dir: string): TemplateStore {
    fs.mkdirSync(dir, { recursive: true });
    return new TemplateStore(dir);
  }

  router.register('template.list', async (params) => {
    const { dir } = (params || {}) as { dir?: string };
    if (!dir) return [];
    return getStore(dir).list();
  }, { description: 'List templates (with mappings) in a big table' });

  router.register('template.save', async (params) => {
    const { dir, name, mappings } = params as { dir: string; name: string; mappings: TemplateMapping[] };
    getStore(dir).save(name, mappings ?? []);
    return { ok: true };
  }, { description: 'Save a template to a big table (overwrite allowed)' });

  router.register('template.delete', async (params) => {
    const { dir, name } = params as { dir: string; name: string };
    getStore(dir).delete(name);
    return { ok: true };
  }, { description: 'Delete a template from a big table' });
}
