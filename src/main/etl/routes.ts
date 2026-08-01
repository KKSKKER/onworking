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

    if (!fs.existsSync(sourceDir)) throw new Error('source/ not found');

    // 1. Read settings.json
    const settings = JSON.parse(fs.readFileSync(pathMod.join(folderPath, 'settings.json'), 'utf-8'));
    const settingsFields = (settings.fields ?? []).filter((f: any) => f && f.name);
    if (settingsFields.length === 0) throw new Error('No fields in settings.json');

    const autoIncrementId = !!settings.autoIncrementId;
    const rawTableName = (settings.tableName || settings.name || pathMod.basename(folderPath)).trim();
    const tableName = rawTableName.replace(/[^a-zA-Z0-9一-鿿_]/g, '_').toLowerCase() || 'bigtable';

    // 2. Fresh DB
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const { DBConnection } = await import('../db/connection');
    const folderDb = new DBConnection(dbPath);

    // 3. Create table
    const typeMap: Record<string, string> = { string: 'TEXT', cents: 'INTEGER', number: 'REAL', date: 'TEXT' };
    const colDefs = settingsFields.map((f: any) => `"${f.name}" ${typeMap[f.type] ?? 'TEXT'}`);
    const sourceCols = '"__source_file" TEXT, "__source_row" INTEGER, "__extracted_at" TEXT';
    let createSQL: string;
    if (autoIncrementId) {
      createSQL = `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs.join(', ')}, ${sourceCols})`;
    } else {
      const pkFields = settingsFields.filter((f: any) => f.isPrimaryKey).map((f: any) => `"${f.name}"`);
      const pkClause = pkFields.length > 0 ? `, PRIMARY KEY (${pkFields.join(', ')})` : '';
      createSQL = `CREATE TABLE "${tableName}" (${colDefs.join(', ')}, ${sourceCols}${pkClause})`;
    }
    await folderDb.exec(createSQL);

    // 4. Scan files
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(xlsx?|csv)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(sourceDir);

    // 5. Load rules
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

    // 6. Process each file: parse, map columns, insert
    const parser = new ExcelParser();
    let totalRows = 0;
    const fileStats: { file: string; rows: number; error?: string }[] = [];
    const columnNames: string[] = settingsFields.map((f: any) => f.name);
    const allCols = [...columnNames, '__source_file', '__source_row', '__extracted_at'];
    const insertSQL = `INSERT INTO "${tableName}" (${allCols.map(c => `"${c}"`).join(', ')}) VALUES (${allCols.map(() => '?').join(', ')})`;
    const extractedAt = new Date().toISOString();

    for (const file of files) {
      const fileName = pathMod.basename(file);
      const relPath = pathMod.relative(sourceDir, file).replace(/\\/g, '/');
      const rule = allRules.find(r => {
        const pat = r.sources[0]?.pattern;
        return pat ? expandBraces(pat).some(p => matchGlob(relPath, p)) : false;
      });
      if (!rule) {
        fileStats.push({ file: fileName, rows: 0, error: 'No matching rule' });
        continue;
      }
      try {
        // Parse Excel
        const src = rule.sources[0];
        const cfg = defaultParseConfig(file, src.sheetIndex ?? 0, src.headerRow);
        cfg.sheetName = src.sheetName;
        const chunks = parser.parse(file, cfg);

        // Build field mapping: outputName -> sourceHeader + type from YAML
        const includedFields = rule.fields
          .filter((f: any) => f.included && f.sourceHeader)
          .sort((a: any, b: any) => a.order - b.order);

        // Validate sourceHeaders exist in Excel
        const excelHeaders = new Set<string>();
        if (chunks.length > 0 && chunks[0].rows.length > 0) {
          for (const k of Object.keys(chunks[0].rows[0])) excelHeaders.add(k);
        }
        for (const f of includedFields) {
          if (!excelHeaders.has(f.sourceHeader!)) {
            throw new Error(`列名 "${f.sourceHeader!}" 在 "${fileName}" 中不存在。可用: ${[...excelHeaders].join(', ')}`);
          }
        }

        // Build lookup: outputName -> sourceHeader
        const fieldLookup = new Map<string, string>();
        for (const f of includedFields) {
          fieldLookup.set(f.outputName, f.sourceHeader!);
        }

        // Insert rows
        let fileRows = 0;
        for (const chunk of chunks) {
          let ri = 0;
          for (const row of chunk.rows) {
            const vals: (string | number | null)[] = columnNames.map(col => {
              const srcHeader = fieldLookup.get(col);
              if (!srcHeader) return null;
              const cell = row[srcHeader];
              if (!cell) return null;
              const raw = cell.raw?.trim();
              if (!raw) return null;
              // Simple type conversion based on settings field type
              const fieldType = settingsFields.find((f: any) => f.name === col)?.type ?? 'string';
              return coerceValue(raw, fieldType);
            });
            vals.push(file, (chunk.locator.detail.chunkStart as number ?? 0) + ri, extractedAt);
            await folderDb.run(insertSQL, vals);
            totalRows++;
            fileRows++;
            ri++;
          }
        }
        fileStats.push({ file: fileName, rows: fileRows });
      } catch (e) {
        fileStats.push({ file: fileName, rows: 0, error: (e as Error).message });
      }
    }

    // 7. Sync table to workspace DB so View3 can preview/export
    const tableRows = await folderDb.execute(`SELECT * FROM "${tableName}"`);
    const tableMeta = await folderDb.execute(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`, [tableName],
    );
    if (tableMeta.length > 0 && tableRows.length > 0) {
      const createSql = String((tableMeta[0] as Record<string, unknown>).sql);
      await db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
      await db.exec(createSql);
      for (const row of tableRows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        const phs = keys.map(() => '?').join(', ');
        await db.run(
          `INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${phs})`,
          keys.map(k => (row[k] === undefined ? null : row[k])),
        );
      }
    }

    folderDb.close();
    return { tableName, rowsInserted: totalRows, fileStats, dbPath };
  }, { description: 'Extract all source files in a folder into a single BigTable table' });
}

// --- Simple value coercion based on YAML field type ---

function coerceValue(raw: string, type: string): string | number | null {
  switch (type) {
    case 'cents':
    case 'number': {
      // Strip thousands separators (commas), parse as number
      const cleaned = raw.replace(/,/g, '').replace(/，/g, '');
      const num = Number(cleaned);
      if (isNaN(num)) return null;
      return type === 'cents' ? Math.round(num * 100) : num;
    }
    case 'date':
    case 'string':
    default:
      return raw;
  }
}

// --- Glob matching helpers ---

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
