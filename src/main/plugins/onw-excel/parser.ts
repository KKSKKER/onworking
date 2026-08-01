// ============================================================
// src/main/plugins/onw-excel/parser.ts
// SheetJS → ParsedChunk 解析器 — Spike 2.4
// ============================================================

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import type { ParseConfig } from '../../../common/types/parse-config';
import type { ParsedChunk, CellData, ChunkLocator } from '../../../common/types/etl-types';
import type { SourceStructure, SourceParserDefinition } from './index';

export class ExcelParser implements SourceParserDefinition {
  name = 'onw-excel';
  extensions = ['.xlsx', '.xls', '.csv'];

  scan(file: string): SourceStructure {
    const buf = fs.readFileSync(file);
    const wb = XLSX.read(buf, { type: 'buffer' });

    return {
      file,
      parser: this.name,
      sheets: wb.SheetNames.map((name, index) => {
        const ws = wb.Sheets[name];
        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
        return {
          index,
          name,
          rowCount: range.e.r - range.s.r + 1,
          colCount: range.e.c - range.s.c + 1,
        };
      }),
    };
  }

  parse(file: string, config: ParseConfig): ParsedChunk[] {
    const buf = fs.readFileSync(file);
    const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Select sheet
    const sheetName = config.sheetName ?? wb.SheetNames[config.sheetIndex ?? 0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      throw new Error(`Sheet "${sheetName}" not found in ${file}`);
    }

    // Convert to array of arrays (raw values, no header parsing)
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,   // get formatted strings, not raw numbers
      blankrows: false,
    });

    // Determine data range
    const headerRowIdx = config.headerRow - 1; // 1-based → 0-based
    const dataStartIdx = (config.dataStartRow ?? config.headerRow + 1) - 1;
    const dataEndIdx = config.dataEndRow ? config.dataEndRow - 1 : aoa.length;

    // Extract headers
    const headerRow = aoa[headerRowIdx] ?? [];
    const headers = headerRow.map((h: unknown) => String(h ?? '').trim());

    // Build column index map (for columns filter)
    const dataStartColIdx = config.dataStartCol
      ? XLSX.utils.decode_col(config.dataStartCol)
      : 0;
    const dataEndColIdx = config.dataEndCol
      ? XLSX.utils.decode_col(config.dataEndCol)
      : headers.length - 1;

    // Create locator
    const locator: ChunkLocator = {
      parser: this.name,
      file,
      contentHash,
      detail: { sheetName, sheetIndex: config.sheetIndex ?? 0 },
    };

    // Chunk the data rows
    const chunks: ParsedChunk[] = [];
    const chunkSize = config.chunkSize ?? 1000;

    for (let start = dataStartIdx; start < dataEndIdx; start += chunkSize) {
      const end = Math.min(start + chunkSize, dataEndIdx);
      const rows: Record<string, CellData>[] = [];

      for (let r = start; r < end; r++) {
        const rawRow = aoa[r];
        if (!rawRow) continue;

        // Check for empty row
        const allEmpty = rawRow.every(
          (cell: unknown) => cell === '' || cell === null || cell === undefined,
        );
        if (config.emptyRowStrategy === 'skip' && allEmpty) continue;
        if (config.emptyRowStrategy === 'stop' && allEmpty) break;

        const row: Record<string, CellData> = {};
        for (let c = dataStartColIdx; c <= dataEndColIdx; c++) {
          const header = headers[c] || XLSX.utils.encode_col(c);
          const rawVal = String(rawRow[c] ?? '').trim();
          row[header] = {
            raw: rawVal,
            typed: null,
            type: 'string',
          };
        }
        rows.push(row);
      }

      chunks.push({
        rows,
        locator: { ...locator, detail: { ...locator.detail, chunkStart: start, chunkEnd: end } },
      });
    }

    return chunks;
  }
}
