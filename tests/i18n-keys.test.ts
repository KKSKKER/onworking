// tests/i18n-keys.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');
const zh = JSON.parse(readFileSync(path.join(root, 'i18n/zh.json'), 'utf8'));

function walk(d: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p).forEach((f) => out.push(f));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

function lookupKey(catalog: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), catalog);
}

describe('i18n key 完整性', () => {
  it('zh.json 是合法嵌套字符串映射', () => {
    const check = (o: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(o)) {
        const full = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'object' && v !== null) check(v as Record<string, unknown>, full);
        else expect(typeof v, `key ${full} 应为字符串`).toBe('string');
      }
    };
    check(zh, '');
  });

  it('源码中所有 t(\'字面量key\') 都能在 zh.json 解析', () => {
    const missing: string[] = [];
    for (const f of walk(path.join(root, 'src'))) {
      const txt = readFileSync(f, 'utf8');
      const re = /\bt(?:r)?\((['"`])([^'"`]+)\1/g; // t('key' / t("key" / t(`key`) / tr('key'),g 标志靠 lastIndex 推进
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const key = m[2];
        if (lookupKey(zh, key) == null) missing.push(`${path.relative(root, f)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
