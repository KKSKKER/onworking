import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TableConfig } from '../src/renderer/state/TableConfig';

const call = vi.fn();

beforeEach(() => {
  call.mockReset();
  (globalThis as unknown as { window: unknown }).window = {
    onworking: { api: { call } },
  };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeConfig(): TableConfig {
  return new TableConfig({ filePath: '/ws/source/a.xlsx', sheetIndex: 0, sheetName: 'sheet1', onChange: () => {} });
}

describe('TableConfig.setHeaderRow', () => {
  it('re-detects fields (debounced) after header row change', async () => {
    const cfg = makeConfig();
    cfg.fields = [{ sourceHeader: '旧列', outputName: '', included: true, mappedField: '', typeGuess: 'string' }];
    call.mockResolvedValue({
      success: true,
      data: {
        rule: {
          sources: [{ headerRow: 2 }],
          fields: [{ sourceHeader: '新列1', outputName: '新列1', included: true, transforms: [] }],
        },
      },
    });

    cfg.setHeaderRow(2);
    expect(cfg.headerRow).toBe(2);
    // Debounce: fields must NOT change before the 400ms window elapses
    expect(cfg.fields.map(f => f.sourceHeader)).toEqual(['旧列']);
    expect(call).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(call).toHaveBeenCalledWith('rule.autoGenerate', expect.objectContaining({ headerRow: 2 }));
    expect(cfg.fields.map(f => f.sourceHeader)).toEqual(['新列1']);
  });

  it('rapid header row changes only run the last detection', async () => {
    const cfg = makeConfig();
    call.mockResolvedValue({
      success: true,
      data: {
        rule: {
          sources: [{ headerRow: 3 }],
          fields: [{ sourceHeader: '列C', outputName: '列C', included: true, transforms: [] }],
        },
      },
    });

    cfg.setHeaderRow(1);
    cfg.setHeaderRow(2);
    cfg.setHeaderRow(3);
    await vi.advanceTimersByTimeAsync(400);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('rule.autoGenerate', expect.objectContaining({ headerRow: 3 }));
  });
});

describe('TableConfig.templateMappings', () => {
  function withFields(): TableConfig {
    const cfg = makeConfig();
    cfg.fields = [
      { sourceHeader: '发票号码', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
      { sourceHeader: '数电发票号码', outputName: '', included: true, mappedField: '发票代码', typeGuess: 'string' },
      { sourceHeader: '金额', outputName: '', included: true, mappedField: '金额', typeGuess: 'cents' },
      { sourceHeader: '税额', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
    ];
    return cfg;
  }

  it('only includes checked fields with a mapping', () => {
    expect(withFields().templateMappings()).toEqual([['数电发票号码', '发票代码'], ['金额', '金额']]);
  });
});

describe('TableConfig.applyTemplate', () => {
  function withFields(): TableConfig {
    const cfg = makeConfig();
    cfg.fields = [
      { sourceHeader: '发票号码', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
      { sourceHeader: '数电发票号码', outputName: '', included: true, mappedField: '发票代码', typeGuess: 'string' },
      { sourceHeader: '金额', outputName: '', included: true, mappedField: '金额', typeGuess: 'cents' },
    ];
    return cfg;
  }

  it('unchecks all fields first', () => {
    const cfg = withFields();
    cfg.applyTemplate([], ['发票代码', '金额']);
    expect(cfg.fields.map(f => f.included)).toEqual([false, false, false]);
  });

  it('matches source fields and links to target', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['数电发票号码', '发票代码'], ['金额', '金额']], ['发票代码', '金额']);
    expect(result).toEqual({ matched: 2, skipped: 0 });
    expect(cfg.fields[1]).toMatchObject({ included: true, mappedField: '发票代码' });
    expect(cfg.fields[2]).toMatchObject({ included: true, mappedField: '金额' });
  });

  it('skips tuples whose target is not in the big table', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['金额', '不存在的字段']], ['发票代码']);
    expect(result).toEqual({ matched: 0, skipped: 1 });
    expect(cfg.fields[2].included).toBe(false);
  });

  it('skips tuples whose source field does not exist', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['不存在的源字段', '金额']], ['金额']);
    expect(result).toEqual({ matched: 0, skipped: 1 });
  });

  it('matches the first field only when a source repeats', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate(
      [['数电发票号码', '发票代码'], ['数电发票号码', '销方识别号']],
      ['发票代码', '销方识别号'],
    );
    expect(result).toEqual({ matched: 1, skipped: 1 });
    expect(cfg.fields[1].mappedField).toBe('发票代码');
  });
});
