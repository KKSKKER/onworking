import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { apiRouter } from './api/router';
import { DBConnection } from './db/connection';
import { ExcelParser } from './plugins/onw-excel';
import { excelToUniverSnapshot } from './plugins/onw-excel/bridge';
import { registerParser } from './etl/pipeline';
import { defaultParseConfig } from '../common/types/parse-config';
import { getEntity, listEntities, registerEntity } from './entity/entity-registry';
import { RuleStore, autoGenerateRule } from './rules/rule-store';

// Register the onw-excel parser on startup
registerParser(new ExcelParser());

let mainWindow: BrowserWindow | null = null;

/** JSON replacer: convert BigInt to string for IPC serialization */
function serializeBigInt(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return `__BIGINT__${value.toString()}__`;
  }
  return value;
}

function setupIPC(): void {
  ipcMain.handle('api:call', async (_event, command: string, params?: Record<string, unknown>) => {
    try {
      const result = await apiRouter.call(command, params);
      // BigInt not JSON-serializable → serialize via replacer before IPC
      const serialized = JSON.parse(JSON.stringify({ data: result }, serializeBigInt));
      return { success: true, data: serialized.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'OnWorking',
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'onworking.db');
  const db = new DBConnection(dbPath);

  apiRouter.register('db.query', async (params) => {
    const { sql, args } = params as { sql: string; args?: unknown[] };
    return db.execute(sql, args);
  });

  apiRouter.register('db.getTables', async () => db.getTables());

  apiRouter.register('db.getSchema', async (params) => {
    const { table } = params as { table: string };
    return db.getSchema(table);
  });

  const excelParser = new ExcelParser();

  apiRouter.register('etl.preview', async (params) => {
    const { file, sheetIndex, sheetName, headerRow, maxRows } = params as {
      file: string;
      sheetIndex?: number;
      sheetName?: string;
      headerRow?: number;
      maxRows?: number;
    };

    const config = defaultParseConfig(file, sheetIndex ?? 0, headerRow ?? 1);
    config.sheetName = sheetName;
    if (maxRows) config.chunkSize = maxRows;

    const chunks = excelParser.parse(file, config);
    const snapshot = excelToUniverSnapshot(chunks, sheetName);
    return snapshot;
  }, { description: 'Preview Excel file as Univer snapshot' });

  apiRouter.register('entity.query', async (params) => {
    const { name, filters } = params as {
      name: string;
      filters?: Record<string, string>;
    };

    const entity = getEntity(name);
    if (!entity) throw new Error(`Entity not found: ${name}`);

    // Build SQL: SELECT attrs FROM table WHERE filters GROUP BY grain
    const selects = entity.attributes.map(a => `${a.expression} AS "${a.name}"`);
    const sql = [`SELECT ${selects.join(', ')}`, `FROM "${entity.table}"`];

    const whereClauses: string[] = [];
    const whereParams: unknown[] = [];
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        whereClauses.push(`"${key}" = ?`);
        whereParams.push(value);
      }
    }
    if (whereClauses.length > 0) {
      sql.push(`WHERE ${whereClauses.join(' AND ')}`);
    }

    if (entity.grain.length > 0) {
      sql.push(`GROUP BY ${entity.grain.map(g => `"${g}"`).join(', ')}`);
    }

    return db.execute(sql.join(' '), whereParams.length > 0 ? whereParams : undefined);
  }, { description: 'Query entity data' });

  apiRouter.register('entity.list', async () => listEntities());

  apiRouter.register('rule.autoGenerate', async (params) => {
    const { file } = params as { file: string };
    if (!file) throw new Error('rule.autoGenerate requires a "file" parameter');

    const structure = excelParser.scan(file);
    const fileName = file.replace(/^.*[\\/]/, '');
    if (structure.sheets.length === 0) throw new Error('No sheets found');

    // Scan the first sheet to profile its columns
    const sheetIndex = 0;
    const config = defaultParseConfig(file, sheetIndex, 1); // start with row 1 as tentative header
    const chunks = excelParser.parse(file, config);

    // Build simple column profiles from sample data
    const allRows = chunks.flatMap(c => c.rows).slice(0, 50);
    const headers = [...new Set(allRows.flatMap(r => Object.keys(r)))];

    const profiles = headers.map((h, i) => {
      const values = allRows.map(r => r[h]?.raw ?? '').filter(v => v !== '');
      const nonNull = values.length;
      const nullCt = allRows.length - nonNull;

      // Simple type guess — strip thousands separators/currency before numeric check,
      // and detect common date formats so the number/date branches of autoGenerateRule
      // are exercised for accounting-style ledgers.
      const looksNumeric = (v: string): boolean => {
        const cleaned = v.replace(/[,，\s¥$￥]/g, '').replace(/^\(.*\)$/, '-1');
        return cleaned !== '' && !isNaN(Number(cleaned));
      };
      const looksDate = (v: string): boolean => {
        const t = v.trim();
        return /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?$/.test(t)
          || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(t);
      };
      const numCount = values.filter(looksNumeric).length;
      const dateCount = values.filter(looksDate).length;
      const n = Math.max(nonNull, 1);
      const primary = numCount / n > 0.8 ? 'number' : dateCount / n > 0.8 ? 'date' : 'string';
      const confidence = Math.max(numCount, dateCount) / n;
      const evidence = primary === 'number' ? '数值占比高'
        : primary === 'date' ? '日期格式占比高'
        : '文本为主';

      return {
        colLetter: String.fromCharCode(65 + i),
        headerText: h,
        nonNullCount: nonNull,
        nullCount: nullCt,
        nullRate: allRows.length > 0 ? nullCt / allRows.length : 0,
        typeGuess: { primary, confidence, evidence },
        sampleValues: values.slice(0, 5),
      };
    });

    // Simplified — a real implementation would scan rows 1-10 for the best header row
    const headerRow = 1;

    const rule = autoGenerateRule(file, fileName, structure.sheets, sheetIndex, headerRow, profiles);

    // Save to rules directory
    const rulesDir = path.join(app.getPath('userData'), 'rules');
    const store = new RuleStore(rulesDir);
    store.save(rule);

    return { rule, savedTo: rulesDir };
  }, { description: 'Auto-generate extraction rule from file structure' });

  // Register a test entity for spike verification
  registerEntity({
    name: 'account',
    table: 'journal_ledger',
    grain: ['account_code'],
    attributes: [
      { name: 'code', type: 'string', expression: 'account_code' },
      { name: 'name', type: 'string', expression: 'account_name' },
      { name: 'total_debit', type: 'cents', expression: 'SUM(debit_amount_cents)' },
      { name: 'total_credit', type: 'cents', expression: 'SUM(credit_amount_cents)' },
      { name: 'balance', type: 'cents', expression: 'SUM(debit_amount_cents) - SUM(credit_amount_cents)' },
    ],
  });

  app.on('before-quit', () => {
    db.close();
  });

  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
