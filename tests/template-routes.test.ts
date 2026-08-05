import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APIRouter } from '../src/main/api/router';
import { registerTemplateRoutes } from '../src/main/template/routes';

const dirs: string[] = [];
function tmpTemplateDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onw-rt-'));
  dirs.push(d);
  return path.join(d, 'template');
}
afterEach(() => {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }
  dirs.length = 0;
});

describe('template routes', () => {
  const router = new APIRouter();
  registerTemplateRoutes(router);

  it('saves and lists templates', async () => {
    const dir = tmpTemplateDir();
    const save = await router.call('template.save', {
      dir, name: '发票模板', mappings: [{ source: '金额', target: '金额' }],
    });
    expect(save).toEqual({ ok: true });
    const list = await router.call('template.list', { dir }) as { name: string; mappings: { source: string; target: string }[] }[];
    expect(list).toEqual([{ name: '发票模板', mappings: [{ source: '金额', target: '金额' }] }]);
  });

  it('deletes a template', async () => {
    const dir = tmpTemplateDir();
    await router.call('template.save', { dir, name: 't', mappings: [] });
    await router.call('template.delete', { dir, name: 't' });
    expect(await router.call('template.list', { dir })).toEqual([]);
  });

  it('lists empty when dir does not exist yet', async () => {
    expect(await router.call('template.list', { dir: path.join(os.tmpdir(), 'onw-rt-missing-xxx') })).toEqual([]);
  });
});
