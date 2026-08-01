// ============================================================
// src/main/mcp/tools/source-tools.ts
// 10 个 MCP 工具定义 — SOURCE_LAYER_SPEC.md §3
// ============================================================

import type { RuleDefinition } from '../../../common/types/etl-types';
import type { FieldTransform } from '../../../common/types/transforms';

// ============================================================
// Tool 1: source_scan
// ============================================================

export interface SourceScanParams {
  directory?: string;
  include?: string[];
  maxDepth?: number;
}

export interface SourceScanFileInfo {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  modifiedAt: string;
  parsers: string[];
  summary?: {
    parser: string;
    sheets: string[];
    estimatedRows?: number;
    estimatedColumns?: number;
  };
}

export interface SourceScanResult {
  files: SourceScanFileInfo[];
  totalFiles: number;
  uniqueExtensions: string[];
}

// ============================================================
// Tool 2: source_list_sheets
// ============================================================

export interface SourceListSheetsParams {
  file: string;
  parser?: string;
}

export interface SheetInfo {
  index: number;
  name: string;
  dimensions: { firstRow: number; lastRow: number; firstCol: number; lastCol: number };
  isEmpty: boolean;
}

export interface SourceListSheetsResult {
  file: string;
  parser: string;
  sheets: SheetInfo[];
}

// ============================================================
// Tool 3: source_sample
// ============================================================

export interface SourceSampleParams {
  file: string;
  sheetIndex?: number;
  sheetName?: string;
  parser?: string;
  rowsBeforeHeader?: number;
  headerRow?: number;
  sampleSize?: number;
  tailRows?: number;
}

export interface AutoDetectResult {
  suggestedHeaderRow: number;
  confidence: number;
  reasoning: string;
}

export interface SourceSampleResult {
  file: string;
  sheetName: string;
  totalRows: number;
  totalColumns: number;
  preHeaderRows: string[][];
  headerRow: { rowIndex: number; columns: { colLetter: string; colIndex: number; headerText: string }[] };
  dataSample: Record<string, string>[];
  tailSample: Record<string, string>[];
  autoDetect: AutoDetectResult;
}

// ============================================================
// Tool 4: source_profile
// ============================================================

export interface SourceProfileParams {
  file: string;
  sheetIndex?: number;
  sheetName?: string;
  headerRow: number;
  maxUniqueValues?: number;
}

export interface ColumnProfile {
  colLetter: string;
  headerText: string;
  nonNullCount: number;
  nullCount: number;
  nullRate: number;
  suggestsMergedCells: boolean;
  typeGuess: { primary: string; confidence: number; evidence: string };
  detectedPatterns: {
    dateFormats?: string[];
    hasThousandsSeparator?: boolean;
    thousandsSeparator?: string;
    hasParenthesesNegatives?: boolean;
    hasTrailingDashNegatives?: boolean;
    codePattern?: string;
    commonPrefixes?: string[];
  };
  sampleValues: string[];
  stats?: { min?: number; max?: number; mean?: number };
}

export interface SourceProfileResult {
  file: string;
  sheetName: string;
  totalDataRows: number;
  columns: ColumnProfile[];
}

// ============================================================
// Tool 5: rule_propose
// ============================================================

export interface RuleProposeParams {
  rule: RuleDefinition;
  summary: string;
}

export interface RuleProposeResult {
  proposalId: string;
  status: 'pending';
  ruleName: string;
  summary: string;
  reviewItems: { field: string; transformCount: number; hasRationale: boolean; aiRationale: string }[];
}

// ============================================================
// Tool 6: rule_propose_field
// ============================================================

export interface RuleProposeFieldParams {
  ruleName: string;
  sourceHeader: string;
  profileData: ColumnProfile;
  previousFeedback?: string;
}

export interface RuleProposeFieldResult {
  sourceHeader: string;
  suggestedTransforms: FieldTransform[];
  explanation: string;
  alternatives: { description: string; transforms: FieldTransform[]; reasonRejected: string }[];
}

// ============================================================
// Tool 7: rule_validate
// ============================================================

export interface RuleValidateParams {
  rule: RuleDefinition;
  testFiles?: string[];
  maxRowsPerFile?: number;
}

export interface RuleValidateResult {
  ruleName: string;
  filesProcessed: number;
  totalRowsRead: number;
  totalRowsOutput: number;
  rowsDropped: number;
  fieldStats: { outputName: string; nonNullCount: number; nullCount: number; coercionErrors: number; errorSamples: string[] }[];
  status: 'ok' | 'warnings' | 'errors';
  issues: { severity: string; field?: string; message: string; affectedRows: number; sampleValues: string[] }[];
  outputPreview: Record<string, unknown>[];
}

// ============================================================
// Tool 8: etl_preview
// ============================================================

export interface ETLPreviewParams {
  ruleName: string;
  file: string;
  maxRows?: number;
}

export interface ETLPreviewResult {
  ruleName: string;
  file: string;
  columns: string[];
  rows: Record<string, unknown>[];
  sourceRowCount: number;
  outputRowCount: number;
  filteredCount: number;
}

// ============================================================
// Tool 9: etl_execute
// ============================================================

export interface ETLExecuteParams {
  ruleName: string;
  files?: string[];
}

export interface ETLExecuteResult {
  taskId: string;
  status: 'running' | 'queued';
  ruleName: string;
  estimatedFiles: number;
}

// ============================================================
// Tool 10: etl_status
// ============================================================

export interface ETLStatusParams {
  taskId: string;
}

export interface ETLStatusResult {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: { filesProcessed: number; totalFiles: number; rowsProcessed: number; rowsOutput: number; percentComplete: number };
  errors?: { file: string; message: string; row?: number }[];
  finishedAt?: string;
}

// ============================================================
// 工具注册表
// ============================================================

export interface MCPToolDefinition<Params, Result> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Params) => Promise<Result>;
}

export function createSourceToolStubs(): MCPToolDefinition<unknown, unknown>[] {
  const tools: MCPToolDefinition<unknown, unknown>[] = [
    {
      name: 'source_scan',
      description: 'Scan source directory structure',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string' },
          include: { type: 'array', items: { type: 'string' } },
          maxDepth: { type: 'number' },
        },
      },
      handler: async (_params) => ({ files: [], totalFiles: 0, uniqueExtensions: [] } as SourceScanResult),
    },
    {
      name: 'source_list_sheets',
      description: 'List sheets in a file',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          parser: { type: 'string' },
        },
        required: ['file'],
      },
      handler: async (_params) => ({ file: '', parser: 'onw-excel', sheets: [] } as SourceListSheetsResult),
    },
    {
      name: 'source_sample',
      description: 'Get a sample of data rows',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          sheetIndex: { type: 'number' },
          sheetName: { type: 'string' },
          parser: { type: 'string' },
          rowsBeforeHeader: { type: 'number' },
          headerRow: { type: 'number' },
          sampleSize: { type: 'number' },
          tailRows: { type: 'number' },
        },
        required: ['file'],
      },
      handler: async (_params) => ({
        file: '', sheetName: '', totalRows: 0, totalColumns: 0,
        preHeaderRows: [], headerRow: { rowIndex: 0, columns: [] },
        dataSample: [], tailSample: [],
        autoDetect: { suggestedHeaderRow: 1, confidence: 0, reasoning: '' },
      } as SourceSampleResult),
    },
    {
      name: 'source_profile',
      description: 'Column-level statistics',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          sheetIndex: { type: 'number' },
          sheetName: { type: 'string' },
          headerRow: { type: 'number' },
          maxUniqueValues: { type: 'number' },
        },
        required: ['file', 'headerRow'],
      },
      handler: async (_params) => ({ file: '', sheetName: '', totalDataRows: 0, columns: [] } as SourceProfileResult),
    },
    {
      name: 'rule_propose',
      description: 'Submit a proposed rule (gate: human)',
      inputSchema: {
        type: 'object',
        properties: {
          rule: { type: 'object' },
          summary: { type: 'string' },
        },
        required: ['rule', 'summary'],
      },
      handler: async (_params) => ({
        proposalId: 'p-001', status: 'pending', ruleName: '', summary: '', reviewItems: [],
      } as RuleProposeResult),
    },
    {
      name: 'rule_propose_field',
      description: 'Propose transforms for one field (no gate)',
      inputSchema: {
        type: 'object',
        properties: {
          ruleName: { type: 'string' },
          sourceHeader: { type: 'string' },
          profileData: { type: 'object' },
          previousFeedback: { type: 'string' },
        },
        required: ['ruleName', 'sourceHeader', 'profileData'],
      },
      handler: async (_params) => ({
        sourceHeader: '', suggestedTransforms: [], explanation: '', alternatives: [],
      } as RuleProposeFieldResult),
    },
    {
      name: 'rule_validate',
      description: 'Dry-run a rule against source data (no gate)',
      inputSchema: {
        type: 'object',
        properties: {
          rule: { type: 'object' },
          testFiles: { type: 'array', items: { type: 'string' } },
          maxRowsPerFile: { type: 'number' },
        },
        required: ['rule'],
      },
      handler: async (_params) => ({
        ruleName: '', filesProcessed: 0, totalRowsRead: 0, totalRowsOutput: 0, rowsDropped: 0,
        fieldStats: [], status: 'ok', issues: [], outputPreview: [],
      } as RuleValidateResult),
    },
    {
      name: 'etl_preview',
      description: 'Preview extraction output',
      inputSchema: {
        type: 'object',
        properties: {
          ruleName: { type: 'string' },
          file: { type: 'string' },
          maxRows: { type: 'number' },
        },
        required: ['ruleName', 'file'],
      },
      handler: async (_params) => ({
        ruleName: '', file: '', columns: [], rows: [],
        sourceRowCount: 0, outputRowCount: 0, filteredCount: 0,
      } as ETLPreviewResult),
    },
    {
      name: 'etl_execute',
      description: 'Execute extraction (first-time gate: human)',
      inputSchema: {
        type: 'object',
        properties: {
          ruleName: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
        required: ['ruleName'],
      },
      handler: async (_params) => ({
        taskId: 'task-001', status: 'queued', ruleName: '', estimatedFiles: 0,
      } as ETLExecuteResult),
    },
    {
      name: 'etl_status',
      description: 'Check extraction progress',
      inputSchema: {
        type: 'object',
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
      },
      handler: async (_params) => ({
        taskId: '', status: 'completed',
        progress: { filesProcessed: 0, totalFiles: 0, rowsProcessed: 0, rowsOutput: 0, percentComplete: 100 },
      } as ETLStatusResult),
    },
  ];

  return tools;
}
