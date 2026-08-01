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
    const dbPath = pathMod.join(folderPath, '.onworking', 'db', 'onworking.db');

    if (!fs.existsSync(sourceDir)) throw new Error('source/ not found in folder');

    // Create a DB connection for this folder
    const { DBConnection } = await import('../db/connection');
    const folderDb = new DBConnection(dbPath);

    // Scan source files
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(xlsx?|csv)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(sourceDir);

    // Load rules
    const { RuleStore } = await import('../rules/rule-store');
    const store = new RuleStore(rulesDir);
    const allRules = store.listAll();

    // For each file, find matching rule and run ETL
    const tableName = pathMod.basename(folderPath).replace(/[^a-zA-Z0-9一-鿿_]/g, '_').toLowerCase();
    const { ETLPipeline, registerParser } = await import('./pipeline');
    const { ExcelParser } = await import('../plugins/onw-excel/parser');
    registerParser(new ExcelParser());
    const pipeline = new ETLPipeline(sourceDir, folderDb, folderPath);

    let totalRows = 0;
    const fileStats: { file: string; rows: number; error?: string }[] = [];

    for (const file of files) {
      const fileName = pathMod.basename(file);
      // Find matching rule — use first rule whose pattern matches
      const rule = allRules.find(r => {
        const pattern = r.sources[0]?.pattern;
        return pattern && new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.')).test(fileName);
      });
      if (!rule) {
        fileStats.push({ file: fileName, rows: 0, error: 'No matching rule' });
        continue;
      }
      try {
        const result = await pipeline.execute(rule);
        totalRows += result.rowsInserted;
        fileStats.push({ file: fileName, rows: result.rowsInserted });
      } catch (e) {
        fileStats.push({ file: fileName, rows: 0, error: (e as Error).message });
      }
    }

    folderDb.close();
    return { tableName, rowsInserted: totalRows, fileStats, dbPath };
  }, { description: 'Extract all source files in a folder into a single DB table' });
}
