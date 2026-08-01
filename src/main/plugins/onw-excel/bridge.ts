// ============================================================
// src/main/plugins/onw-excel/bridge.ts
// ParsedChunk → Univer snapshot 转换 — Spike 2.3
// ============================================================

import type { ParsedChunk } from '../../../common/types/etl-types';

/**
 * Univer-compatible cell value format.
 * Univer cells accept: string | number | boolean | null | undefined
 */
export interface UniverCellData {
  v: string | number | boolean | null;
  t?: 's' | 'n' | 'b';  // string | number | boolean
}

export interface UniverSheetSnapshot {
  sheetName: string;
  headers: string[];
  rows: UniverCellData[][];
  totalRows: number;
  totalColumns: number;
}

/**
 * Convert ParsedChunk[] into a flat Univer snapshot.
 * Merges all chunks into a single table structure.
 */
export function excelToUniverSnapshot(chunks: ParsedChunk[], sheetName?: string): UniverSheetSnapshot {
  if (chunks.length === 0) {
    return { sheetName: sheetName ?? 'Sheet1', headers: [], rows: [], totalRows: 0, totalColumns: 0 };
  }

  // Collect all unique headers across chunks (preserve first-chunk order)
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const row of chunk.rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      }
    }
  }

  // Build rows
  const allRows: UniverCellData[][] = [];

  for (const chunk of chunks) {
    for (const row of chunk.rows) {
      const cells: UniverCellData[] = headers.map(h => {
        const cell = row[h];
        if (!cell || cell.raw === '' || cell.raw === undefined) {
          return { v: null };
        }
        // Pass raw string — formatting handled by Univer
        // Attempt to detect numbers
        const num = Number(cell.raw);
        if (!isNaN(num) && cell.raw.trim() !== '') {
          return { v: num, t: 'n' };
        }
        return { v: cell.raw, t: 's' };
      });
      allRows.push(cells);
    }
  }

  return {
    sheetName: sheetName ?? 'Sheet1',
    headers,
    rows: allRows,
    totalRows: allRows.length,
    totalColumns: headers.length,
  };
}
