import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { APIRouter, apiRouter } from './api/router';
import { DBConnection } from './db/connection';
import { registerDBRoutes } from './db/routes';
import { registerEntityRoutes, loadEntitiesFromDir } from './entity/routes';
import { registerRuleRoutes } from './rules/routes';
import { registerETLRoutes } from './etl/routes';
import { registerWorkspaceRoutes, WorkspaceManager } from './workspace/manager';
import type { WorkspaceInfo } from './workspace/manager';

let mainWindow: BrowserWindow | null = null;
let db: DBConnection | null = null;

/** JSON replacer: convert BigInt to string for IPC serialization */
function serializeBigInt(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `__BIGINT__${value.toString()}__`;
  return value;
}

function setupIPC(router: APIRouter): void {
  ipcMain.handle('api:call', async (_event, command: string, params?: Record<string, unknown>) => {
    try {
      const result = await router.call(command, params);
      const serialized = JSON.parse(JSON.stringify({ data: result }, serializeBigInt));
      return { success: true, data: serialized.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

function initModules(ws: WorkspaceInfo): void {
  // Close previous DB if reopening
  if (db) { db.close(); }
  db = new DBConnection(ws.dbPath);
  registerDBRoutes(apiRouter, db);
  registerEntityRoutes(apiRouter, db);
  loadEntitiesFromDir(ws.entitiesDir);
  registerRuleRoutes(apiRouter, ws.rulesDir);
  registerETLRoutes(apiRouter, db, { sourceDir: ws.sourceDir, rulesDir: ws.rulesDir, root: ws.root });
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

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Register workspace routes with initModules as callback
  // so that workspace.open/create triggers full module initialization
  registerWorkspaceRoutes(apiRouter, initModules);

  // Auto-open if exactly one recent workspace
  const recent = WorkspaceManager.listRecent();
  if (recent.length === 1) {
    try {
      const ws = WorkspaceManager.open(recent[0].rootPath);
      initModules(ws.toInfo());
    } catch { /* workspace may be invalid, let user select in UI */ }
  }

  setupIPC(apiRouter);
  createWindow();
});

app.on('before-quit', () => {
  if (db) db.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
