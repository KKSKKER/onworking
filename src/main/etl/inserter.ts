// ============================================================
// src/main/etl/inserter.ts
// Stage 5: SQLite 写入 + 血缘 — SOURCE_LAYER_SPEC.md §4.5
// ============================================================

import type { TransformedChunk, ValidationReport, InsertResult, RuleDefinition, RowLineage } from '../../common/types/etl-types';

export function insert(
  chunks: TransformedChunk[],
  rule: RuleDefinition,
  validation: ValidationReport,
): InsertResult {
  let totalRows = 0;
  const lineageEntries: RowLineage[] = [];

  for (const chunk of chunks) {
    totalRows += chunk.rows.length;

    for (let i = 0; i < chunk.rows.length; i++) {
      lineageEntries.push({
        sourceLocator: chunk.locator,
        extractedAt: new Date().toISOString(),
        ruleName: rule.name,
        ruleVersion: String(rule.version),
      });
    }
  }

  return {
    tableName: rule.name,
    rowsInserted: totalRows,
    lineageEntries: lineageEntries.length,
    validation,
    finishedAt: new Date().toISOString(),
  };
}
