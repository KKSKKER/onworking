import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertInsideRoot } from '../src/main/fs/guard';
import { normalizeTableName } from '../src/main/etl/table-name';
import { rewriteRulePatterns } from '../src/main/rules/pattern-rewrite';
import { deleteFileWithinRoot, copyFileWithinRoot, renameSourceFileWithinRoot, collectRulesDirs } from '../src/main/fs/file-ops';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

describe('assertInsideRoot', () => {
  it('accepts a target inside root', () => {
    expect(assertInsideRoot('C:/ws', 'C:/ws/folder/x.xlsx')).toBe('C:\\ws\\folder\\x.xlsx');
  });
  it('rejects a target outside root', () => {
    expect(() => assertInsideRoot('C:/ws', 'C:/other/x.xlsx')).toThrow();
  });
});

describe('normalizeTableName', () => {
  it('sanitizes and lowercases', () => {
    expect(normalizeTableName('全量发票 A')).toBe('全量发票_a');
  });
  it('falls back to bigtable when empty', () => {
    expect(normalizeTableName('!!!')).toBe('bigtable');
  });
});

describe('rewriteRulePatterns', () => {
  const rule = (pattern: string): any => ({ name: 'r', sources: [{ pattern }] });
  it('rewrites pattern referencing old basename', () => {
    const [next] = rewriteRulePatterns([rule('**/全量发票查询导出结果 (2024).xlsx')], '全量发票查询导出结果 (2024).xlsx', '发票2024.xlsx');
    expect(next.sources[0].pattern).toBe('**/发票2024.xlsx');
  });
  it('returns same reference when no pattern changed', () => {
    const r = rule('**/*.xlsx');
    const next = rewriteRulePatterns([r], 'a.xlsx', 'b.xlsx');
    expect(next[0]).toBe(r);
  });
  it('leaves unrelated pattern untouched', () => {
    const [next] = rewriteRulePatterns([rule('**/other.xlsx')], 'a.xlsx', 'b.xlsx');
    expect(next.sources[0].pattern).toBe('**/other.xlsx');
  });
});

describe('deleteFileWithinRoot', () => {
  it('deletes file inside root', () => {
    const d = tmp();
    const f = path.join(d, 'a.xlsx');
    fs.writeFileSync(f, 'x');
    deleteFileWithinRoot(d, f);
    expect(fs.existsSync(f)).toBe(false);
  });
  it('throws for file outside root', () => {
    const d = tmp();
    const f = path.join(d, 'a.xlsx');
    fs.writeFileSync(f, 'x');
    expect(() => deleteFileWithinRoot(d, f)).not.toThrow();
    expect(() => deleteFileWithinRoot(path.join(d, 'sub'), f)).toThrow();
  });
});

describe('copyFileWithinRoot', () => {
  it('copies into dest dir', () => {
    const d = tmp();
    const src = path.join(d, 'src.xlsx'); fs.writeFileSync(src, 'x');
    const dest = path.join(d, 'dest'); fs.mkdirSync(dest);
    const r = copyFileWithinRoot(d, src, dest, false);
    expect(r.copied).toBe(true);
    expect(fs.existsSync(path.join(dest, 'src.xlsx'))).toBe(true);
  });
  it('reports conflict without overwriting', () => {
    const d = tmp();
    const src = path.join(d, 'src.xlsx'); fs.writeFileSync(src, 'x');
    const dest = path.join(d, 'dest'); fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'src.xlsx'), 'old');
    const r = copyFileWithinRoot(d, src, dest, false);
    expect(r.conflict).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'src.xlsx'), 'utf-8')).toBe('old');
  });
  it('overwrites when asked', () => {
    const d = tmp();
    const src = path.join(d, 'src.xlsx'); fs.writeFileSync(src, 'new');
    const dest = path.join(d, 'dest'); fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'src.xlsx'), 'old');
    const r = copyFileWithinRoot(d, src, dest, true);
    expect(r.copied).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'src.xlsx'), 'utf-8')).toBe('new');
  });
});

describe('renameSourceFileWithinRoot', () => {
  it('renames file and rewrites matching rule pattern', () => {
    const d = tmp();
    const rulesDir = path.join(d, '.onworking', 'rules'); fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'rule_a.yaml'), 'name: rule_a\nsources:\n  - pattern: "**/旧名.xlsx"\nfields: []\n');
    const f = path.join(d, 'source'); fs.mkdirSync(f);
    const old = path.join(f, '旧名.xlsx'); fs.writeFileSync(old, 'x');
    const r = renameSourceFileWithinRoot(d, old, '新名.xlsx', [rulesDir]);
    expect(r.newPath).toBe(path.join(f, '新名.xlsx'));
    expect(fs.existsSync(path.join(f, '新名.xlsx'))).toBe(true);
    expect(fs.readFileSync(path.join(rulesDir, 'rule_a.yaml'), 'utf-8')).toContain('**/新名.xlsx');
    expect(r.rulesUpdated).toBe(1);
  });
  it('rejects path traversal in newName', () => {
    const d = tmp();
    const old = path.join(d, 'a.xlsx'); fs.writeFileSync(old, 'x');
    expect(() => renameSourceFileWithinRoot(d, old, '../evil.xlsx', [])).toThrow();
  });
});

describe('collectRulesDirs', () => {
  it('includes workspace rulesDir and each folder rulesDir', () => {
    const d = tmp();
    const wsRules = path.join(d, '.onworking', 'rules'); fs.mkdirSync(wsRules, { recursive: true });
    const folder = path.join(d, '大表1', 'source'); fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(path.join(d, '大表1', '.onworking', 'rules'), { recursive: true });
    const dirs_ = collectRulesDirs(d, wsRules);
    expect(dirs_).toContain(wsRules);
    expect(dirs_).toContain(path.join(d, '大表1', '.onworking', 'rules'));
  });
});
