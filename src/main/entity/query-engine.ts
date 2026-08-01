// ============================================================
// src/main/entity/query-engine.ts
// Entity YAML → CTE SQL 编译 — Spike 2.8
// ============================================================

import type { EntityDef, EntityAttribute } from './entity-registry';
import type { DBConnection } from '../db/connection';

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  layers: number;
}

export interface QueryFilters {
  [dimension: string]: string | string[];
}

const AGG_FUNCS = ['SUM(', 'COUNT(', 'AVG(', 'MAX(', 'MIN('];

const SQL_KEYWORDS = new Set([
  'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'COALESCE', 'CAST', 'ABS', 'ROUND',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT',
]);

/**
 * Compile an EntityDef into executable SQL with CTE layers.
 *
 * Algorithm:
 * 1. Separate attributes into: direct (from table), aggregated (SUM/COUNT/AVG),
 *    computed (references other attributes).
 * 2. Build dependency graph for computed attributes.
 * 3. Topological sort into layers.
 * 4. Generate: WITH layer_0 AS (SELECT ... GROUP BY grain), layer_1 AS (...), ...
 * 5. Final SELECT from top layer.
 */
export class EntityQueryEngine {
  constructor(private db: DBConnection) {}

  compile(entity: EntityDef): CompiledQuery {
    const grain = entity.grain;
    const allAttrs = entity.attributes;

    // Classify attributes
    const directAttrs: EntityAttribute[] = [];
    const aggAttrs: EntityAttribute[] = [];
    const computedAttrs: EntityAttribute[] = [];

    for (const attr of allAttrs) {
      const upperExpr = attr.expression.toUpperCase();
      if (AGG_FUNCS.some(fn => upperExpr.includes(fn))) {
        aggAttrs.push(attr);
      } else if (grain.includes(attr.name) || this.isDirectColumn(attr.expression)) {
        directAttrs.push(attr);
      } else {
        computedAttrs.push(attr);
      }
    }

    // Build dependency graph for computed attrs
    const resolved = new Set<string>();
    for (const a of directAttrs) resolved.add(a.name);
    for (const a of aggAttrs) resolved.add(a.name);

    // Topological sort of computed attrs (iterative resolution pass)
    const sorted: EntityAttribute[] = [];
    const remaining = [...computedAttrs];
    let progress = true;

    while (remaining.length > 0 && progress) {
      progress = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const attr = remaining[i];
        const refs = this.extractRefs(attr.expression);
        if (refs.every(r => resolved.has(r))) {
          sorted.push(attr);
          resolved.add(attr.name);
          remaining.splice(i, 1);
          progress = true;
        }
      }
    }

    if (remaining.length > 0) {
      throw new Error(
        `Circular dependency detected in entity "${entity.name}": ${remaining.map(a => a.name).join(', ')}`,
      );
    }

    // Generate SQL
    const grainCols = grain.map(g => `"${g}"`);

    // Layer 0: SELECT direct + aggregate expressions, GROUP BY grain + direct columns
    const layer0Selects: string[] = [];
    for (const a of directAttrs) {
      layer0Selects.push(`${a.expression} AS "${a.name}"`);
    }
    for (const a of aggAttrs) {
      layer0Selects.push(`${a.expression} AS "${a.name}"`);
    }

    // Collect GROUP BY columns: grain + any direct columns not already covered
    const groupByCols = new Set(grain);
    for (const a of directAttrs) {
      if (this.isDirectColumn(a.expression)) {
        const col = a.expression.replace(/"/g, '');
        groupByCols.add(col);
      }
    }

    let sql = `WITH __layer_0 AS (\n  SELECT ${layer0Selects.join(',\n         ')}\n  FROM "${entity.table}"`;

    if (groupByCols.size > 0) {
      const groupStr = [...groupByCols].map(c => `"${c}"`).join(', ');
      sql += `\n  GROUP BY ${groupStr}`;
    }
    sql += '\n)';

    // Layer 1+: computed attributes
    if (sorted.length > 0) {
      const sortedNames = new Set(sorted.map(a => a.name));
      const layer1Selects = [...resolved]
        .filter(r => !sortedNames.has(r))
        .map(r => `"${r}"`);
      for (const a of sorted) {
        layer1Selects.push(`${a.expression} AS "${a.name}"`);
      }

      sql += `,\n__layer_1 AS (\n  SELECT ${layer1Selects.join(',\n         ')}\n  FROM __layer_0\n)`;
    }

    // Final SELECT
    const finalLayer = sorted.length > 0 ? '__layer_1' : '__layer_0';
    sql += `\nSELECT * FROM ${finalLayer}`;

    return { sql, params: [], layers: sorted.length > 0 ? 2 : 1 };
  }

  async execute(entity: EntityDef, filters?: QueryFilters): Promise<Record<string, unknown>[]> {
    const compiled = this.compile(entity);
    let sql = compiled.sql;
    const params: unknown[] = [];

    // Inject WHERE clause into layer_0 before GROUP BY
    if (filters && Object.keys(filters).length > 0) {
      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          whereClauses.push(`"${key}" IN (${value.map(() => '?').join(', ')})`);
          params.push(...value);
        } else if (typeof value === 'string' && value.includes('..')) {
          // Range filter: "2024-01..2024-06"
          const [start, end] = value.split('..');
          whereClauses.push(`"${key}" BETWEEN ? AND ?`);
          params.push(start, end);
        } else {
          whereClauses.push(`"${key}" = ?`);
          params.push(value);
        }
      }

      const whereClause = whereClauses.join(' AND ');
      sql = sql.replace(
        `FROM "${entity.table}"`,
        `FROM "${entity.table}"\n  WHERE ${whereClause}`,
      );
    }

    return this.db.execute(sql, params.length > 0 ? params : undefined);
  }

  private isDirectColumn(expr: string): boolean {
    // Direct column reference: just a column name, no operators, no function calls
    return /^"?\w+"?$/.test(expr.trim());
  }

  private extractRefs(expr: string): string[] {
    // Extract attribute name references from expression
    // Split on operators to isolate identifiers
    const tokens = expr.split(/[+\-*/()\s,]+/).filter(Boolean);
    const refs: string[] = [];
    for (const token of tokens) {
      const cleaned = token.replace(/"/g, '');
      if (/^[a-zA-Z_]\w*$/.test(cleaned) && !SQL_KEYWORDS.has(cleaned.toUpperCase())) {
        refs.push(cleaned);
      }
    }
    return [...new Set(refs)];
  }
}
