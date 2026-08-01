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
  const tableName = rule.name;

  // Collect all column names from included fields
  const columns = rule.fields
    .filter(f => f.included)
    .sort((a, b) => a.order - b.order)
    .map(f => f.outputName);

  if (columns.length === 0) {
    throw new Error(`Rule "${rule.name}" has no included fields`);
  }

  // Map outputType to SQLite column type
  const typeMap: Record<string, string> = {
    string: 'TEXT',
    cents: 'INTEGER',   // bigint stored as INTEGER
    number: 'TEXT',     // stored as string to avoid float
    date: 'TEXT',       // ISO-8601 string
    boolean: 'TEXT',
    null: 'TEXT',
  };

  // Get field output types from rule for CREATE TABLE
  const colDefs = columns.map(col => {
    const field = rule.fields.find(f => f.outputName === col);
    const sqlType = typeMap[field?.transforms[field.transforms.length - 1]?.kind === 'coerce_number'
      ? ((field.transforms[field.transforms.length - 1] as { outputType?: string }).outputType === 'cents' ? 'cents' : 'number')
      : 'string'] ?? 'TEXT';
    return `"${col}" ${sqlType}`;
  });

  // Create table
  await db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
  await db.exec(`CREATE TABLE "${tableName}" (${colDefs.join(', ')})`);

  // Create lineage table per SOURCE_LAYER_SPEC §4.5
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_pk INTEGER NOT NULL,
      source_locator TEXT NOT NULL,
      extracted_at TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      rule_version INTEGER NOT NULL
    )
  `);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_lineage_table ON _lineage(table_name)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_lineage_rule ON _lineage(rule_name, rule_version)');

  // Insert rows
  const placeholders = columns.map(() => '?').join(', ');
  const insertSQL = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

  const extractedAt = new Date().toISOString();
  let totalRows = 0;
  let rowIndex = 0;

  for (const chunk of chunks) {
    const locatorJson = JSON.stringify(chunk.locator);

    for (const row of chunk.rows) {
      const values = columns.map(col => {
        const cell = row[col];
        if (!cell || cell.value === null) return null;
        return cell.value;
      });

      await db.run(insertSQL, values);

      // Insert lineage
      await db.run(
        'INSERT INTO _lineage (table_name, row_pk, source_locator, extracted_at, rule_name, rule_version) VALUES (?, ?, ?, ?, ?, ?)',
        [tableName, rowIndex, locatorJson, extractedAt, rule.name, rule.version],
      );

      totalRows++;
      rowIndex++;
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
