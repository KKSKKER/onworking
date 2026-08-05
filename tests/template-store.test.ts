import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateStore } from '../src/main/template/template-store';

const dirs: string[] = [];
function makeStore(): TemplateStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onw-tpl-'));
  dirs.push(dir);
  return new TemplateStore(path.join(dir, 'template'));
}
afterEach(() => {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }
  dirs.length = 0;
});

describe('TemplateStore', () => {
  it('lists empty when the dir has no templates', () => {
    expect(makeStore().list()).toEqual([]);
  });

  it('saves and lists a template', () => {
    const s = makeStore();
    s.save('发票模板', [{ source: '数电发票号码', target: '发票代码' }, { source: '金额', target: '金额' }]);
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: '发票模板',
      mappings: [{ source: '数电发票号码', target: '发票代码' }, { source: '金额', target: '金额' }],
    });
  });

  it('overwrites a template with the same name', () => {
    const s = makeStore();
    s.save('t', [{ source: 'a', target: 'b' }]);
    s.save('t', [{ source: 'c', target: 'd' }]);
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].mappings).toEqual([{ source: 'c', target: 'd' }]);
  });

  it('deletes a template', () => {
    const s = makeStore();
    s.save('t', []);
    expect(s.list()).toHaveLength(1);
    s.delete('t');
    expect(s.list()).toEqual([]);
  });

  it('sanitizes illegal filename characters and rejects empty names', () => {
    const s = makeStore();
    s.save('a/b\\c:d', []);
    expect(s.list().map(d => d.name)).toEqual(['a_b_c_d']);
    expect(() => s.save('   ', [])).toThrow();
  });
});
