// ============================================================
// src/main/etl/pipeline.ts
// Stage 1-5 ETL 编排器 — SOURCE_LAYER_SPEC.md §4 全流程
// ============================================================

import type { RuleDefinition, InsertResult, ParsedChunk } from '../../common/types/etl-types';
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

export class ETLPipeline {
  private transformEngine = new TransformEngine();

  constructor(private sourceDir: string) {}

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

    // Stage 2: Parse (Phase 1: mock)
    onProgress?.({ stage: 'parse', ruleName: rule.name, filesProcessed: 0, totalFiles: resolvedFiles.length, percentComplete: 10 });
    const parseConfigs = ruleToParseConfigs(rule, resolvedFiles);
    const parsedChunks: ParsedChunk[] = parseConfigs.map(cfg => ({
      rows: [],
      locator: {
        parser: 'mock',
        file: cfg.filePath,
        contentHash: cfg.expectedContentHash ?? '',
        detail: { sheetIndex: cfg.sheetIndex },
      },
    }));

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
    const result = insert(transformedChunks, rule, validationReport);

    onProgress?.({ stage: 'insert', ruleName: rule.name, filesProcessed: transformedChunks.length, totalFiles: transformedChunks.length, percentComplete: 100 });

    return result;
  }
}
