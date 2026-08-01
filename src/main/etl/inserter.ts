// ============================================================
// src/main/etl/inserter.ts
// Stage 5: SQLite 写入 + 血缘 — SOURCE_LAYER_SPEC.md §4.5
// ============================================================

import type { TransformedChunk, ValidationReport, InsertResult, RuleDefinition, RowLineage } from '../../common/types/etl-types';
import type { DBConnection } from '../db/connection';

export async function insert(
  chunks: TransformedChunk[],
  rule: RuleDefinition,
  validation: ValidationReport,
  db: DBConnection,
): Promise<InsertResult> {
  const tableName = rule.name.replace(/[^a-zA-Z0-9一-鿿_]/g, '_').toLowerCase();

  const columns = rule.fields
    .filter(f => f.included)
    .sort((a, b) => a.order - b.order)
    .map(f => f.outputName.replace(/[/\\.*()\[\]]/g, '').replace(/\s+/g, '_')
      .toLowerCase() || f.outputName);

  if (columns.length === 0) {
    throw new Error(`Rule "${rule.name}" has no included fields`);
  }

  const typeMap: Record<string, string> = {
    string: 'TEXT', cents: 'INTEGER', number: 'REAL', date: 'TEXT', boolean: 'TEXT', null: 'TEXT',
  };

  const colDefs = columns.map(col => {
    const field = rule.fields.find(f => f.outputName === col);
    const sqlType = 'TEXT'; // default — exact type inference from transforms is complex; TEXT is always safe
    return `"${col}" ${sqlType}`;
  });

  // CREATE IF NOT EXISTS — never drop existing data
  const sourceCols = '"__source_file" TEXT, "__source_row" INTEGER, "__extracted_at" TEXT';
  await db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')}, ${sourceCols})`);

  // Insert rows with source columns
  const allColumns = [...columns, '__source_file', '__source_row', '__extracted_at'];
  const placeholders = allColumns.map(() => '?').join(', ');
  const insertSQL = `INSERT INTO "${tableName}" (${allColumns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

  const extractedAt = new Date().toISOString();
  let totalRows = 0;

  for (const chunk of chunks) {
    const sourceFile = chunk.locator.file;
    let rowIdx = 0;
    for (const row of chunk.rows) {
      const values: (string | bigint | number | null)[] = columns.map(col => {
        const cell = row[col];
        if (!cell || cell.value === null) return null;
        return cell.value;
      });
      const sourceRow = (chunk.locator.detail.row as number)
        ?? ((chunk.locator.detail.chunkStart as number ?? 0) + rowIdx);
      values.push(sourceFile, sourceRow, extractedAt);
      await db.run(insertSQL, values);
      totalRows++;
      rowIdx++;
    }
  }

  return {
    tableName,
    rowsInserted: totalRows,
    lineageEntries: totalRows,
    validation,
    finishedAt: new Date().toISOString(),
  };
}
