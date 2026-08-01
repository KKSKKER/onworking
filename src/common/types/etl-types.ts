// ============================================================
// src/common/types/etl-types.ts
// ETL 管线类型 — SOURCE_LAYER_SPEC.md §4 + §3
// ============================================================

import type { FieldTransform } from './transforms';
import type { ParseConfig } from './parse-config';

// --- Source Parser 输出 (§4.2) ---

export interface CellData {
  raw: string;
  typed: string | bigint | null;
  type: 'string' | 'cents' | 'number' | 'date';
}

export interface ChunkLocator {
  parser: string;
  file: string;
  contentHash: string;
  detail: Record<string, string | number>;
}

export interface ParsedChunk {
  rows: Record<string, CellData>[];
  locator: ChunkLocator;
}

// --- Transform 引擎输出 (§4.3) ---

export interface TypedCell {
  value: string | bigint | number | null;
  type: 'string' | 'cents' | 'number' | 'date' | 'boolean' | 'null';
  derived: boolean;
  derivedBy?: string;
}

export interface TransformedChunk {
  rows: Record<string, TypedCell>[];
  locator: ChunkLocator;
  droppedRows: {
    locator: ChunkLocator;
    reason: string;
    rawData: Record<string, CellData>;
  }[];
}

// --- Validator 输出 (§4.4) ---

export interface FileValidationResult {
  file: string;
  contentHash: string;
  sourceRows: number;
  outputRows: number;
  droppedRows: number;
  fieldErrors: Record<string, {
    coercionErrors: number;
    nullCount: number;
    nullRate: number;
  }>;
  dirty: boolean;
  dirtyReasons: string[];
}

export interface ValidationReport {
  ruleName: string;
  files: FileValidationResult[];
  aggregate: {
    sourceRows: number;
    outputRows: number;
    droppedRows: number;
    dirty: boolean;
    dirtyReasons: string[];
  };
}

// --- Inserter 输出 (§4.5) ---

export interface RowLineage {
  sourceLocator: ChunkLocator;
  extractedAt: string;
  ruleName: string;
  ruleVersion: string;
}

export interface InsertResult {
  tableName: string;
  rowsInserted: number;
  lineageEntries: number;
  validation: ValidationReport;
  finishedAt: string;
}

// --- Rule Definition (§2.4) ---

export interface RuleSource {
  pattern: string;
  sheetIndex?: number;
  sheetName?: string;
  headerRow: number;
  headerRows?: number[];
  headerJoinSeparator?: string;
  dataRange?: string;
}

export interface FieldDefinition {
  sourceHeader: string | null;
  outputName: string;
  included: boolean;
  order: number;
  transforms: FieldTransform[];
  generatedBy?: string;
  aiLocked?: boolean;
}

export interface RuleDefinition {
  name: string;
  display: string;
  version: number;
  proposalId?: string;
  sources: RuleSource[];
  fields: FieldDefinition[];
  mergeStrategy: {
    mode: 'append' | 'upsert';
    primaryKey?: string[];
    conflictStrategy?: 'keep_newest' | 'keep_oldest' | 'skip';
    sourceTagColumn?: string;
    sourceTagPattern?: string;
  };
}

// --- Resolved File (§4.1 Scan 输出) ---

export interface ResolvedFile {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  modifiedAt: string;
  matchedRule: string;
  matchedSource: RuleSource;
}
