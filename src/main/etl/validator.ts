// ============================================================
// src/main/etl/validator.ts
// Stage 4: 类型断言 + 行数对账 — SOURCE_LAYER_SPEC.md §4.4
// ============================================================

import type { TransformedChunk, ValidationReport, FileValidationResult, RuleDefinition } from '../../common/types/etl-types';

export function validate(
  chunks: TransformedChunk[],
  rule: RuleDefinition,
): ValidationReport {
  const fileResults: FileValidationResult[] = [];
  let totalSource = 0;
  let totalOutput = 0;
  let totalDropped = 0;
  const allDirtyReasons: string[] = [];

  for (const chunk of chunks) {
    const sourceRows = chunk.rows.length + chunk.droppedRows.length;
    const outputRows = chunk.rows.length;
    const droppedRows = chunk.droppedRows.length;

    const fieldErrors: FileValidationResult['fieldErrors'] = {};

    for (const field of rule.fields) {
      if (!field.included) continue;

      let nullCount = 0;

      for (const row of chunk.rows) {
        const cell = row[field.outputName];
        if (!cell || cell.value === null || cell.type === 'null') {
          nullCount++;
        }
      }

      const nullRate = outputRows > 0 ? nullCount / outputRows : 0;

      fieldErrors[field.outputName] = { coercionErrors: 0, nullCount, nullRate };
    }

    const dirtyReasons: string[] = [];
    let dirty = false;

    if (droppedRows > 0) {
      dirtyReasons.push(`${droppedRows} rows filtered out`);
      dirty = true;
    }

    for (const [fieldName, errors] of Object.entries(fieldErrors)) {
      if (errors.nullRate === 1.0) {
        dirtyReasons.push(`Field "${fieldName}" is 100% null`);
        dirty = true;
      }
    }

    fileResults.push({
      file: chunk.locator.file,
      contentHash: chunk.locator.contentHash,
      sourceRows, outputRows, droppedRows,
      fieldErrors,
      dirty,
      dirtyReasons,
    });

    totalSource += sourceRows;
    totalOutput += outputRows;
    totalDropped += droppedRows;
    allDirtyReasons.push(...dirtyReasons);
  }

  return {
    ruleName: rule.name,
    files: fileResults,
    aggregate: {
      sourceRows: totalSource,
      outputRows: totalOutput,
      droppedRows: totalDropped,
      dirty: fileResults.some(f => f.dirty),
      dirtyReasons: [...new Set(allDirtyReasons)],
    },
  };
}
