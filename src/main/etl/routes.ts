// onworking/src/main/etl/routes.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { APIRouter } from '../api/router';
import type { DBConnection } from '../db/connection';
import { ETLPipeline, registerParser } from './pipeline';
import { ExcelParser } from '../plugins/onw-excel/parser';
import { excelToUniverSnapshot } from '../plugins/onw-excel/bridge';
import { RuleStore } from '../rules/rule-store';
import { defaultParseConfig } from '../../common/types/parse-config';
import { matchGlob } from '../../common/utils/glob';
import type { RuleDefinition } from '../../common/types/etl-types';

export function registerETLRoutes(
  router: APIRouter,
  db: DBConnection,
  workspace: { sourceDir: string; rulesDir: string; root: string },
): void {
  registerParser(new ExcelParser());
  const pipeline = new ETLPipeline(workspace.sourceDir, db, workspace.root);
  const ruleStore = new RuleStore(workspace.rulesDir);

  router.register('etl.preview', async (params) => {
    const { file, sheetIndex, sheetName, headerRow, maxRows } = params as {
      file: string; sheetIndex?: number; sheetName?: string; headerRow?: number; maxRows?: number;
    };
    const parser = new ExcelParser();
    const config = defaultParseConfig(file, sheetIndex ?? 0, headerRow ?? 1);
    config.sheetName = sheetName;
    if (maxRows) config.chunkSize = maxRows;
    const chunks = parser.parse(file, config);
    return excelToUniverSnapshot(chunks, sheetName);
  }, { description: 'Preview Excel file as Univer snapshot' });

  router.register('etl.scan', async () => {
    const sourceDir = workspace.sourceDir;
    const root = workspace.root;
    const files: { path: string; name: string; size: number }[] = [];
    const seen = new Set<string>();

    const walk = (dir: string, baseLabel: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, baseLabel); continue; }
        if (!/\.(xlsx?|csv)$/i.test(entry.name)) continue;
        if (seen.has(full)) continue;
        seen.add(full);
        files.push({ path: full, name: path.relative(root, full), size: fs.statSync(full).size });
      }
    };

    // Scan both source/ and the workspace root (user may drop files at root)
    walk(sourceDir, path.relative(root, sourceDir));
    if (root !== sourceDir) walk(root, path.relative(root, root));

    return files;
  }, { description: 'Scan workspace for Excel files (root + source/)' });

  router.register('etl.scanDir', async (params) => {
    const { dir } = params as { dir: string };
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    if (!fs.existsSync(dir)) return [];
    const files: { path: string; name: string; size: number }[] = [];
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = pathMod.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(xlsx?|csv)$/i.test(entry.name)) {
          files.push({ path: full, name: pathMod.relative(dir, full), size: fs.statSync(full).size });
        }
      }
    };
    walk(dir);
    return files;
  }, { description: 'Scan a directory recursively for Excel/CSV files' });

  router.register('etl.execute', async (params) => {
    const { ruleName } = params as { ruleName: string };
    const rule = ruleStore.load(ruleName);
    if (!rule) throw new Error(`Rule not found: ${ruleName}`);
    const result = await pipeline.execute(rule, {
      onProgress: (progress) => { router.emit('etl:progress', progress); },
    });
    router.emit('etl:complete', result);
    return result;
  }, { description: 'Execute ETL pipeline for a rule' });

  router.register('etl.getTableData', async (params) => {
    const { table, limit, offset } = params as { table: string; limit?: number; offset?: number };
    const l = limit ?? 200;
    const o = offset ?? 0;
    const rows = await db.execute(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`, [l, o]);
    const count = await db.execute(`SELECT COUNT(*) as total FROM "${table}"`);
    const total = (count[0] as Record<string, number>).total;
    return { rows, total, limit: l, offset: o };
  }, { description: 'Get paginated data from an ETL table' });

  router.register('etl.mergeFolder', async (params) => {
    const { folderPath } = params as { folderPath: string };
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    const sourceDir = pathMod.join(folderPath, 'source');
    const rulesDir = pathMod.join(folderPath, '.onworking', 'rules');
    const dbDir = pathMod.join(folderPath, '.onworking', 'db');
    const dbPath = pathMod.join(dbDir, 'onworking.db');

    if (!fs.existsSync(sourceDir)) throw new Error('source/ not found in folder');

    // 1. Read BigTable settings from the folder's settings.json
    const settingsPath = pathMod.join(folderPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) throw new Error(`settings.json not found in folder: ${folderPath}`);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      name?: string;
      tableName?: string;
      autoIncrementId?: boolean;
      fields?: { name: string; type?: string; order?: number; isPrimaryKey?: boolean }[];
    };

    const settingsFields = (settings.fields ?? [])
      .filter(f => f && f.name)
      .map(f => ({ name: f.name, type: (f.type ?? 'string') as string, isPrimaryKey: !!f.isPrimaryKey }));
    if (settingsFields.length === 0) throw new Error('BigTable has no fields configured');

    const autoIncrementId = !!settings.autoIncrementId;
    const rawTableName = (settings.tableName || settings.name || pathMod.basename(folderPath)).trim();
    const tableName = rawTableName.replace(/[^a-zA-Z0-9一-鿿_]/g, '_').toLowerCase() || 'bigtable';

    // 2. Delete old DB file, create a fresh one
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const { DBConnection } = await import('../db/connection');
    const folderDb = new DBConnection(dbPath);

    // 3. Create the target table with the BigTable schema
    const typeMap: Record<string, string> = { string: 'TEXT', cents: 'INTEGER', number: 'REAL', date: 'TEXT' };
    const colDefs = settingsFields.map(f => `"${f.name}" ${typeMap[f.type] ?? 'TEXT'}`);
    const sourceCols = '"__source_file" TEXT, "__source_row" INTEGER, "__extracted_at" TEXT';

    let createSQL: string;
    if (autoIncrementId) {
      createSQL = `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs.join(', ')}, ${sourceCols})`;
    } else {
      const pkFields = settingsFields.filter(f => f.isPrimaryKey).map(f => `"${f.name}"`);
      const pkClause = pkFields.length > 0 ? `, PRIMARY KEY (${pkFields.join(', ')})` : '';
      createSQL = `CREATE TABLE "${tableName}" (${colDefs.join(', ')}, ${sourceCols}${pkClause})`;
    }
    await folderDb.exec(createSQL);

    // 4. Scan source files
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(xlsx?|csv)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(sourceDir);

    // 5. Load rules — folder rules first, then workspace rules
    const { RuleStore } = await import('../rules/rule-store');
    const allRules: RuleDefinition[] = [];
    const folderStore = new RuleStore(rulesDir);
    for (const r of folderStore.listAll()) allRules.push(r);
    if (workspace.rulesDir && workspace.rulesDir !== rulesDir) {
      const wsStore = new RuleStore(workspace.rulesDir);
      for (const r of wsStore.listAll()) {
        if (!allRules.some(x => x.name === r.name)) allRules.push(r);
      }
    }

    // 6. Parse each file and insert directly with strict sourceHeader matching
    const parser = new ExcelParser();

    let totalRows = 0;
    const fileStats: { file: string; rows: number; error?: string }[] = [];
    const columnNames = settingsFields.map(f => f.name);
    const allCols = [...columnNames, '__source_file', '__source_row', '__extracted_at'];
    const placeholders = allCols.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO "${tableName}" (${allCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    const extractedAt = new Date().toISOString();

    for (const file of files) {
      const fileName = pathMod.basename(file);
      const relPath = pathMod.relative(sourceDir, file).replace(/\\/g, '/');
      const rule = allRules.find(r => {
        const pattern = r.sources[0]?.pattern;
        const match = pattern && matchFolderRule(relPath, pattern);
        console.log('[mergeFolder] rule=' + r.name + ' pattern=' + pattern + ' relPath=' + relPath + ' match=' + match);
        return match;
      });
      console.log('[mergeFolder] file=' + fileName + ' matched rule=' + (rule ? rule.name : 'NONE'));
      if (!rule) {
        fileStats.push({ file: fileName, rows: 0, error: 'No matching rule' });
        continue;
      }
      try {
        const source = rule.sources[0];
        const config = defaultParseConfig(file, source.sheetIndex ?? 0, source.headerRow);
        config.sheetName = source.sheetName;
        const chunks = parser.parse(file, config);

        // Build included field list sorted by order
        const includedFields = rule.fields
          .filter(f => f.included && f.sourceHeader)
          .sort((a, b) => a.order - b.order);

        // Collect Excel column names from the first chunk for validation
        const excelHeaders = new Set<string>();
        if (chunks.length > 0 && chunks[0].rows.length > 0) {
          Object.keys(chunks[0].rows[0]).forEach(k => excelHeaders.add(k));
        }

        // Validate: every included sourceHeader must exist in the Excel file
        for (const field of includedFields) {
          if (field.sourceHeader && !excelHeaders.has(field.sourceHeader)) {
            const available = [...excelHeaders].map(h => `"${h}"`).join(', ');
            throw new Error(
              `列名 "${field.sourceHeader}" 在文件 "${fileName}" 中不存在。` +
              `Excel 实际列名: [${available}]`
            );
          }
        }

        // Build lookup: outputName → { sourceHeader, transforms }
        const fieldMap = new Map<string, { sourceHeader: string; transforms: typeof includedFields[0]['transforms'] }>();
        for (const f of includedFields) {
          if (f.sourceHeader) fieldMap.set(f.outputName, { sourceHeader: f.sourceHeader, transforms: f.transforms });
        }

        let fileRows = 0;
        for (const chunk of chunks) {
          let chunkRowIdx = 0;
          for (const row of chunk.rows) {
            const values: (string | bigint | number | null)[] = columnNames.map(col => {
              const mapping = fieldMap.get(col);
              if (!mapping) return null;
              const cell = row[mapping.sourceHeader];
              if (!cell || cell.raw === '' || cell.raw === undefined) return null;
              return applyTransforms(cell.raw, mapping.transforms);
            });
            const sourceRow = (chunk.locator.detail.chunkStart as number ?? 0) + chunkRowIdx;
            values.push(file, sourceRow, extractedAt);
            await folderDb.run(insertSQL, values);
            totalRows++;
            fileRows++;
            chunkRowIdx++;
          }
        }
        fileStats.push({ file: fileName, rows: fileRows });
      } catch (e) {
        fileStats.push({ file: fileName, rows: 0, error: (e as Error).message });
      }
    }

    folderDb.close();
    return { tableName, rowsInserted: totalRows, fileStats, dbPath };
  }, { description: 'Extract all source files in a folder into a single BigTable table' });
}

// --- Inline transform helpers (replaces TransformEngine for mergeFolder) ---

interface MergeFieldTransform {
  kind: string;
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  maxLength?: number;
  nullValues?: string[];
  outputType?: string;
  emptyAs?: string;
  negativePattern?: string;
  thousandsSeparator?: string;
  decimalSeparator?: string;
  mapping?: Record<string, string>;
  unmappedStrategy?: string;
  caseSensitive?: boolean;
  trueValues?: string[];
  falseValues?: string[];
}

function applyTransforms(rawValue: string, transforms: MergeFieldTransform[]): string | bigint | null {
  let current: string | bigint | null = rawValue;

  // Sort transforms by standard order
  const sorted = [...transforms].sort((a, b) => {
    const orderA = TRANSFORM_KIND_ORDER[a.kind] ?? 99;
    const orderB = TRANSFORM_KIND_ORDER[b.kind] ?? 99;
    return orderA - orderB;
  });

  for (const t of sorted) {
    switch (t.kind) {
      case 'coerce_string': {
        let s: string = String(current ?? '');
        if (t.trim) s = s.trim();
        if (t.lowercase) s = s.toLowerCase();
        if (t.uppercase) s = s.toUpperCase();
        if (t.nullValues?.includes(s)) { current = null; }
        else if (t.maxLength && s.length > t.maxLength) s = s.slice(0, t.maxLength);
        if (current !== null) current = s;
        break;
      }
      case 'coerce_number': {
        let s = String(current ?? '').trim();
        if (s === '' || s === '-') {
          current = t.outputType === 'cents'
            ? (t.emptyAs === '0' ? 0n : null)
            : (t.emptyAs === '0' ? '0' : null);
          break;
        }
        let sign = 1n;
        if (t.negativePattern === 'parentheses') {
          const m = s.match(/^\((.+)\)$/);
          if (m) { s = m[1]; sign = -1n; }
        } else if (t.negativePattern === 'trailing_dash') {
          if (s.endsWith('-')) s = '-' + s.slice(0, -1);
        }
        if (t.negativePattern === 'leading_dash' && s.startsWith('-')) {
          sign = -1n; s = s.slice(1);
        }
        if (t.thousandsSeparator) s = s.replaceAll(t.thousandsSeparator, '');
        if (t.decimalSeparator && t.decimalSeparator !== '.') s = s.replace(t.decimalSeparator, '.');
        if (t.outputType === 'cents') {
          const dot = s.indexOf('.');
          if (dot === -1) { current = BigInt(s) * 100n * sign; }
          else {
            const intPart = s.slice(0, dot) || '0';
            let frac = s.slice(dot + 1).slice(0, 2).padEnd(2, '0');
            current = (BigInt(intPart) * 100n + BigInt(frac)) * sign;
          }
        } else {
          current = sign === -1n ? '-' + s : s;
        }
        break;
      }
      case 'coerce_date': {
        current = String(current ?? '');
        break;
      }
      case 'coerce_enum': {
        const s: string = String(current ?? '');
        if (t.mapping?.[s]) { current = t.mapping[s]; }
        else if (t.unmappedStrategy === 'null') { current = null; }
        else if (t.unmappedStrategy === 'error') {
          throw new Error(`Enum value "${s}" not in mapping`);
        }
        break;
      }
      case 'coerce_boolean': {
        const s = String(current ?? '');
        const cmp = t.caseSensitive ? s : s.toLowerCase();
        const trues = t.caseSensitive ? (t.trueValues ?? []) : (t.trueValues ?? []).map(v => v.toLowerCase());
        const falses = t.caseSensitive ? (t.falseValues ?? []) : (t.falseValues ?? []).map(v => v.toLowerCase());
        if (trues.includes(cmp)) { current = 'true'; }
        else if (falses.includes(cmp)) { current = 'false'; }
        else { current = null; }
        break;
      }
      default:
        throw new Error(`Transform kind "${t.kind}" is not supported in mergeFolder`);
    }
  }
  return current;
}

const TRANSFORM_KIND_ORDER: Record<string, number> = {
  fill_down: 1, rename: 2,
  coerce_string: 3, coerce_number: 3, coerce_date: 3, coerce_enum: 3, coerce_boolean: 3,
  split_to_columns: 4, extract: 4, split_by_sign: 4,
  derive: 5, filter_rows: 6,
};

/**
 * Match a rule's source pattern against a file path (forward-slash normalized).
 * Handles brace alternation (e.g. globs like "*.{xls,xlsx,csv}") by expanding to
 * multiple globs, then delegates to the shared matchGlob util.
 */
function matchFolderRule(filePath: string, pattern: string): boolean {
  return expandBraces(pattern).some(p => matchGlob(filePath, p));
}

function expandBraces(pattern: string): string[] {
  const start = pattern.indexOf('{');
  if (start === -1) return [pattern];
  const end = pattern.indexOf('}', start);
  if (end === -1) return [pattern];
  const prefix = pattern.slice(0, start);
  const options = pattern.slice(start + 1, end).split(',').map(s => s.trim()).filter(Boolean);
  const suffix = pattern.slice(end + 1);
  const results: string[] = [];
  for (const opt of options) {
    results.push(...expandBraces(prefix + opt + suffix));
  }
  return results;
}
