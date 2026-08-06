import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pickLanguage, writeLanguageFile } from '../src/main/lang';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

describe('pickLanguage', () => {
  it('只认 en,其余一律 zh', () => {
    expect(pickLanguage('en')).toBe('en');
    expect(pickLanguage('zh')).toBe('zh');
    expect(pickLanguage(undefined)).toBe('zh');
    expect(pickLanguage('de')).toBe('zh');
  });
});

describe('writeLanguageFile', () => {
  it('写入 {language} JSON 可回读', () => {
    const file = path.join(tmp(), 'language.json');
    writeLanguageFile(file, 'en');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ language: 'en' });
  });
  it('覆盖已有文件', () => {
    const file = path.join(tmp(), 'language.json');
    writeLanguageFile(file, 'zh');
    writeLanguageFile(file, 'en');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ language: 'en' });
  });
});
