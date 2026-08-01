// ============================================================
// src/main/etl/pipeline.ts
// Stage 1-5 ETL 编排器 — SOURCE_LAYER_SPEC.md §4 全流程
// ============================================================

import type { RuleDefinition, InsertResult, ParsedChunk } from '../../common/types/etl-types';
import type { SourceParserDefinition } from '../plugins/onw-excel/index';
import type { DBConnection } from '../db/connection';
import { scanWorkspace } from './scanner';
import { ruleToParseConfigs } from '../rules/rule-compiler';
import { TransformEngine } from './transform-engine';
import { validate } from './validator';
import { insert } from './inserter';

export interface ETLProgress {
  stage: 'scan' | 'parse' | 'transform' | 'validate' | 'insert';
  ruleName: string;
  filesProcessed: number;
  totalFiles: number;
  percentComplete: number;
}

export type ProgressCallback = (progress: ETLProgress) => void;

/**
 * SourceParser 注册表 — 插件通过 registerParser 贡献解析器。
 * Core 不内置任何文件格式解析。
 */
const parserRegistry = new Map<string, SourceParserDefinition>();

export function registerParser(parser: SourceParserDefinition): void {
  for (const ext of parser.extensions) {
    parserRegistry.set(ext.toLowerCase(), parser);
  }
}

function resolveParser(filePath: string): SourceParserDefinition | undefined {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return parserRegistry.get(ext);
}

export class ETLPipeline {
  private transformEngine = new TransformEngine();

  constructor(
    private sourceDir: string,
    private db?: DBConnection,
  ) {}

  async execute(
    rule: RuleDefinition,
    options?: { onProgress?: ProgressCallback },
  ): Promise<InsertResult> {
    const onProgress = options?.onProgress;

    // Stage 1: Scan
    onProgress?.({ stage: 'scan', ruleName: rule.name, filesProcessed: 0, totalFiles: 0, percentComplete: 0 });
    const resolvedFiles = scanWorkspace(this.sourceDir, [rule]);

    if (resolvedFiles.length === 0) {
      throw new Error(`No files matched rule "${rule.name}" in ${this.sourceDir}`);
    }

    // Stage 2: Parse — use registered parsers
    onProgress?.({ stage: 'parse', ruleName: rule.name, filesProcessed: 0, totalFiles: resolvedFiles.length, percentComplete: 10 });
    const parseConfigs = ruleToParseConfigs(rule, resolvedFiles);
    const parsedChunks: ParsedChunk[] = [];

    for (let i = 0; i < parseConfigs.length; i++) {
      const cfg = parseConfigs[i];
      const parser = resolveParser(cfg.filePath);
      if (!parser) {
        throw new Error(`No parser registered for file extension: ${cfg.filePath}`);
      }
      const chunks = parser.parse(cfg.filePath, cfg);
      parsedChunks.push(...chunks);
      onProgress?.({ stage: 'parse', ruleName: rule.name, filesProcessed: i + 1, totalFiles: parseConfigs.length, percentComplete: 10 + Math.round((i + 1) / parseConfigs.length * 20) });
    }

    // Stage 3: Transform
    onProgress?.({ stage: 'transform', ruleName: rule.name, filesProcessed: 0, totalFiles: parsedChunks.length, percentComplete: 30 });
    const transformedChunks = parsedChunks.map(chunk =>
      this.transformEngine.apply(chunk, rule),
    );

    // Stage 4: Validate
    onProgress?.({ stage: 'validate', ruleName: rule.name, filesProcessed: transformedChunks.length, totalFiles: transformedChunks.length, percentComplete: 60 });
    const validationReport = validate(transformedChunks, rule);

    // Stage 5: Insert
    onProgress?.({ stage: 'insert', ruleName: rule.name, filesProcessed: transformedChunks.length, totalFiles: transformedChunks.length, percentComplete: 80 });
    const db = this.db;
    if (!db) {
      throw new Error('ETLPipeline: no DBConnection provided');
    }
    const result = await insert(transformedChunks, rule, validationReport, db);

    onProgress?.({ stage: 'insert', ruleName: rule.name, filesProcessed: transformedChunks.length, totalFiles: transformedChunks.length, percentComplete: 100 });

    return result;
  }
}
