import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'path';
import { APIRouter, apiRouter } from './api/router';
import { DBConnection } from './db/connection';
import { registerDBRoutes } from './db/routes';
import { registerEntityRoutes, loadEntitiesFromDir } from './entity/routes';
import { registerRuleRoutes } from './rules/routes';
import { registerETLRoutes } from './etl/routes';
import { registerWorkspaceRoutes, WorkspaceManager, setActiveRoot } from './workspace/manager';
import type { WorkspaceInfo } from './workspace/manager';
import { registerUI } from './ui/ipc';
import { buildApplicationMenu } from './menu';
import { setCatalog } from '../common/i18n';

// 装载界面文案(菜单/对话框/错误消息)。dev: __dirname=dist/main/main → 项目根;打包后 → resources/app。
// 语言由根目录 language.json 决定(language: "zh" | "en"),缺失/非法默认 zh;改它重启即切换。
// 注:__dirname 是 dist/main/main,需 ../../../ 到项目根/应用根。
let appLang = 'zh';
try {
  // 去掉可能的 UTF-8 BOM(Windows 编辑器/Set-Content 会写入 ﻿),否则 JSON.parse 抛错
  const raw = fs.readFileSync(path.join(__dirname, '../../../language.json'), 'utf8').replace(/^﻿/, '');
  const langCfg = JSON.parse(raw) as { language?: string };
  appLang = langCfg.language === 'en' ? 'en' : 'zh';
} catch { /* language.json 缺失/损坏,默认 zh */ }
try {
  const raw = fs.readFileSync(path.join(__dirname, `../../../i18n/${appLang}.json`), 'utf8').replace(/^﻿/, '');
  setCatalog(JSON.parse(raw));
} catch (e) {
  console.warn('[i18n] 加载语言文件失败:', e);
}

let mainWindow: BrowserWindow | null = null;
let db: DBConnection | null = null;

// ===== 运行时缓存策略 =====
// 默认情况下 Chromium 会把 HTTP/GPU/JS 编译等缓存写进 %APPDATA%\onworking，
// 一次运行就能积累几十 MB，且应用卸载后仍残留。这里把可重定位的会话数据
// （Cookies / LocalStorage / SessionStorage 等）移到系统临时目录，并让内核
// 固定写入 userData 的缓存目录在每次启动、退出时自动清理。
const RUNTIME_CACHE_DIR = path.join(os.tmpdir(), 'onworking-runtime');
// Chromium 固定写入 userData、只能靠清理移除的缓存目录
const CHROMIUM_CACHE_DIRS = [
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'blob_storage',
];

/** 清掉 userData 下 Chromium 遗留缓存与旧版空壳 db */
function cleanUserDataCache(): void {
  const userData = app.getPath('userData');
  for (const dir of CHROMIUM_CACHE_DIRS) {
    try { fs.rmSync(path.join(userData, dir), { recursive: true, force: true }); } catch { /* 目录被占用时留待下次清理 */ }
  }
  // 旧版本曾在 userData 下创建过空的 onworking.db，当前代码不再使用，一并清掉
  try { fs.rmSync(path.join(userData, 'onworking.db'), { force: true }); } catch { /* ignore */ }
}

// 必须在 app ready 之前调用。先清掉上次运行残留的临时会话目录（此刻上一个
// 进程已完全退出、目录未被占用，删除必然成功），再把会话数据重定向到系统
// 临时目录。退出时 Chromium 子进程仍占用该目录、删除会失败（EBUSY），所以
// 这里的启动清理是可靠兜底，保证临时目录不会跨运行累积。
try { fs.rmSync(RUNTIME_CACHE_DIR, { recursive: true, force: true }); } catch { /* 目录被占用时忽略，留待下次 */ }
app.setPath('sessionData', RUNTIME_CACHE_DIR);

/** JSON replacer: convert BigInt to string for IPC serialization */
function serializeBigInt(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `__BIGINT__${value.toString()}__`;
  return value;
}

function setupIPC(router: APIRouter): void {
  ipcMain.handle('app:getLanguage', () => appLang);
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
  // Ensure the db directory exists before opening
  fs.mkdirSync(path.dirname(ws.dbPath), { recursive: true });
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
    icon: path.join(__dirname, '../../build/icon.png'),
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 启动即清理：Chromium 尚未写缓存，删除上次残留是安全的
  cleanUserDataCache();

  // Register workspace routes with initModules as callback
  // so that workspace.open/create triggers full module initialization.
  // Wrap initModules to track the active root and rebuild the menu so the
  // 帮助→打开数据目录 item tracks the currently active workspace.
  registerWorkspaceRoutes(apiRouter, (ws) => {
    setActiveRoot(ws.root);
    initModules(ws);
    buildApplicationMenu(() => mainWindow);
  }, () => db);

  // Auto-open if exactly one recent workspace
  const recent = WorkspaceManager.listRecent();
  if (recent.length === 1) {
    try {
      const ws = WorkspaceManager.open(recent[0].rootPath);
      setActiveRoot(ws.root);
      initModules(ws.toInfo());
    } catch { /* workspace may be invalid, let user select in UI */ }
  }

  setupIPC(apiRouter);
  registerUI(() => mainWindow);
  buildApplicationMenu(() => mainWindow);
  createWindow();
});

app.on('before-quit', () => {
  if (db) db.close();
});

app.on('will-quit', () => {
  // 退出即清理：删掉本次运行写入的 Chromium 缓存与临时会话数据
  cleanUserDataCache();
  try { fs.rmSync(RUNTIME_CACHE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
