import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { apiRouter } from './api/router';
import { DBConnection } from './db/connection';
import { ExcelParser } from './plugins/onw-excel';
import { excelToUniverSnapshot } from './plugins/onw-excel/bridge';
import { registerParser } from './etl/pipeline';
import { defaultParseConfig } from '../common/types/parse-config';

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
