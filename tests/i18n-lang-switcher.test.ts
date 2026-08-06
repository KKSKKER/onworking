import { describe, expect, it } from 'vitest';
import { t, setCatalog } from '../src/common/i18n';
import zh from '../i18n/zh.json';
import en from '../i18n/en.json';

describe('语言切换 key', () => {
  it('lang.zhName / lang.enName 双目录下均母语自指', () => {
    setCatalog(zh);
    expect(t('lang.zhName')).toBe('中文');
    expect(t('lang.enName')).toBe('English');
    setCatalog(en);
    expect(t('lang.zhName')).toBe('中文');
    expect(t('lang.enName')).toBe('English');
  });
  it('topBar.language 在 zh / en 下分别解析', () => {
    setCatalog(zh);
    expect(t('topBar.language')).toBe('语言');
    setCatalog(en);
    expect(t('topBar.language')).toBe('Language');
  });
});
