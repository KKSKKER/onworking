// ============================================================
// src/main/plugins/onw-excel/index.ts
// onw-excel 插件注册入口 — Spike 2.4
// ============================================================

import type { ParseConfig } from '../../../common/types/parse-config';
import type { ParsedChunk } from '../../../common/types/etl-types';

export interface SourceStructure {
  file: string;
  parser: string;
  sheets: { index: number; name: string; rowCount: number; colCount: number }[];
}

export interface SourceParserDefinition {
  name: string;
  extensions: string[];
  scan(file: string): SourceStructure;
  parse(file: string, config: ParseConfig): ParsedChunk[];
}

export { ExcelParser } from './parser';
