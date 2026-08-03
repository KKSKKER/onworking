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
