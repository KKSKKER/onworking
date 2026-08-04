// tests/i18n.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { setCatalog, t } from '../src/common/i18n';

const zh = {
  common: { save: '保存', loading: '加载中...', affectedRows: '影响 {changes} 行' },
  view4: { queryFailed: '查询失败' },
};

beforeEach(() => setCatalog(zh));

describe('t()', () => {
  it('按点分路径取词', () => {
    expect(t('common.save')).toBe('保存');
    expect(t('view4.queryFailed')).toBe('查询失败');
  });

  it('插值替换 {var}', () => {
    expect(t('common.affectedRows', { changes: 3 })).toBe('影响 3 行');
  });

  it('缺少插值变量时保留原占位符', () => {
    expect(t('common.affectedRows', {})).toBe('影响 {changes} 行');
  });

  it('缺 key 时返回 key 本身', () => {
    expect(t('common.notExist')).toBe('common.notExist');
  });

  it('误引用非字符串(命名空间)时返回 key', () => {
    expect(t('common')).toBe('common');
  });

  it('无变量时原样返回(不执行 replace)', () => {
    expect(t('common.loading')).toBe('加载中...');
  });
});
