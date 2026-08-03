// onworking/src/main/workspace/manager.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { APIRouter } from '../api/router';
import type { DBConnection } from '../db/connection';
import { assertInsideRoot } from '../fs/guard';
import { normalizeTableName } from '../etl/table-name';
import { resolveLaunchMode } from './launch';

const CONFIG_PATH = path.join(app.getPath('userData'), 'workspaces.json');

// 当前活动工作区根路径(仅内存态,不持久化)。菜单等需要知道"当前在哪个工作区"。
let activeRoot: string | null = null;
export function getActiveRoot(): string | null { return activeRoot; }
export function setActiveRoot(root: string | null): void { activeRoot = root; }

export interface WorkspaceMeta {
  rootPath: string;
  name: string;
  openedAt: string;
}

export interface WorkspaceInfo {
  root: string;
  sourceDir: string;
  rulesDir: string;
  entitiesDir: string;
  dbPath: string;
}

export class Workspace {
  constructor(readonly root: string) {}

  get sourceDir(): string { return path.join(this.root, 'source'); }
  get rulesDir(): string { return path.join(this.root, '.onworking', 'rules'); }
  get entitiesDir(): string { return path.join(this.root, '.onworking', 'entities'); }
  get dbPath(): string { return path.join(this.root, '.onworking', 'db', 'onworking.db'); }
  get sealsDir(): string { return path.join(this.root, '.onworking', 'seals'); }

  init(): void {
    const dirs = [this.sourceDir, this.rulesDir, this.entitiesDir,
                  path.dirname(this.dbPath), this.sealsDir];
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  toInfo(): WorkspaceInfo {
    return { root: this.root, sourceDir: this.sourceDir, rulesDir: this.rulesDir,
             entitiesDir: this.entitiesDir, dbPath: this.dbPath };
  }
}

export class WorkspaceManager {
  static listRecent(): WorkspaceMeta[] {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return [];
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw) as WorkspaceMeta[];
    } catch { return []; }
  }

  static create(rootPath: string): Workspace {
    setActiveRoot(rootPath);
    const ws = new Workspace(rootPath);
    ws.init();
    WorkspaceManager._addRecent({ rootPath, name: path.basename(rootPath), openedAt: new Date().toISOString() });
    return ws;
  }

  static open(rootPath: string): Workspace {
    if (!fs.existsSync(rootPath)) throw new Error(`Workspace not found: ${rootPath}`);
    setActiveRoot(rootPath);
    const ws = new Workspace(rootPath);
    WorkspaceManager._addRecent({ rootPath, name: path.basename(rootPath), openedAt: new Date().toISOString() });
    return ws;
  }

  private static _addRecent(meta: WorkspaceMeta): void {
    const list = WorkspaceManager.listRecent().filter(m => m.rootPath !== meta.rootPath);
    list.unshift(meta);
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(list.slice(0, 10), null, 2), 'utf-8');
  }
}

export function registerWorkspaceRoutes(
  router: APIRouter,
  onInit: (ws: WorkspaceInfo) => void,
  getDb?: () => DBConnection | null,
): void {
  router.register('workspace.create', async (params) => {
    const { rootPath } = params as { rootPath: string };
    const ws = WorkspaceManager.create(rootPath);
    const info = ws.toInfo();
    try {
      onInit(info);
    } catch (e) {
      console.error('[workspace.create] onInit failed:', e);
      // Modules failed to init, but workspace dirs are created.
      // Return info anyway so UI can proceed; DB routes will fail if used.
    }
    return info;
  }, { description: 'Create and initialize a new workspace' });

  router.register('workspace.open', async (params) => {
    const { rootPath } = params as { rootPath: string };
    const ws = WorkspaceManager.open(rootPath);
    const info = ws.toInfo();
    try {
      onInit(info);
    } catch (e) {
      console.error('[workspace.open] onInit failed:', e);
    }
    return info;
  }, { description: 'Open an existing workspace' });

  router.register('workspace.info', async () => {
    return { error: 'workspace.info requires active workspace context' };
  }, { description: 'Get current workspace info' });

  router.register('workspace.launch', async (params) => {
    const { rootPath } = params as { rootPath: string };
    setActiveRoot(rootPath);
    const ws = resolveLaunchMode(rootPath) === 'open'
      ? WorkspaceManager.open(rootPath)
      : WorkspaceManager.create(rootPath);
    const info = ws.toInfo();
    try { onInit(info); } catch (e) { console.error('[workspace.launch] onInit failed:', e); }
    return info;
  }, { description: 'Open or create a workspace based on .onworking/ presence' });

  router.register('workspace.deleteFolder', async (params) => {
    const { path: folderPath } = params as { path: string };
    const root = getActiveRoot();
    if (!root) throw new Error('没有活动工作区');
    const abs = assertInsideRoot(root, folderPath);
    if (path.resolve(abs) === path.resolve(root)) throw new Error('不能删除工作区根目录');
    const settingsPath = path.join(abs, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const tableName = normalizeTableName(settings.tableName || settings.name || path.basename(abs));
        const db = getDb?.();
        if (db) { try { await db.exec(`DROP TABLE IF EXISTS "${tableName}"`); } catch { /* 表不存在则忽略 */ } }
      } catch { /* settings 缺失/损坏则只删目录 */ }
    }
    fs.rmSync(abs, { recursive: true, force: true });
    return { ok: true };
  }, { description: 'Delete a BigTable folder (with its db) and drop merged table' });

  router.register('workspace.listRecent', async () => {
    return WorkspaceManager.listRecent();
  }, { description: 'List recent workspaces' });

  router.register('workspace.readFile', async (params) => {
    const { path: filePath } = params as { path: string };
    const fs = await import('node:fs');
    if (!fs.existsSync(filePath)) return { content: null };
    return { content: fs.readFileSync(filePath, 'utf-8') };
  }, { description: 'Read a file from disk' });

  router.register('workspace.writeFile', async (params) => {
    const { path: filePath, content } = params as { path: string; content: string };
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    fs.mkdirSync(pathMod.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  }, { description: 'Write a file to disk (creating parent dirs)' });

  router.register('workspace.listFolders', async (params) => {
    const { rootPath } = params as { rootPath: string };
    const fs = await import('node:fs');
    if (!fs.existsSync(rootPath)) return [];
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(rootPath + '/' + e.name + '/source'))
      .map(e => e.name);
  }, { description: 'List subfolders of a workspace root that contain a source/ folder' });

  router.register('workspace.createFolder', async (params) => {
    const { path: dirPath } = params as { path: string };
    const fs = await import('node:fs');
    fs.mkdirSync(dirPath, { recursive: true });
    return { ok: true };
  }, { description: 'Create a directory recursively' });
}
