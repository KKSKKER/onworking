import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { apiRouter } from './api/router';

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
