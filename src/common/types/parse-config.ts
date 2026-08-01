// ============================================================
// src/common/types/parse-config.ts
// ParseConfig 接口 — SOURCE_LAYER_SPEC.md §6.1
// ============================================================

export interface ParseConfig {
  filePath: string;
  expectedContentHash?: string;
  sheetIndex: number;
  sheetName?: string;
  headerRow: number;
  dataStartRow?: number;
  dataEndRow?: number;
  dataStartCol?: string;
  dataEndCol?: string;
  columns?: string[];
  useHeaderRow: boolean;
  headerRows?: number[];
  headerJoinSeparator?: string;
  chunkSize: number;
  emptyRowStrategy: 'skip' | 'emit' | 'stop';
  computeHash: boolean;
}

export function defaultParseConfig(filePath: string, sheetIndex: number, headerRow: number): ParseConfig {
  return {
    filePath,
    sheetIndex,
    headerRow,
    useHeaderRow: true,
    chunkSize: 1000,
    emptyRowStrategy: 'skip',
    computeHash: true,
  };
}
