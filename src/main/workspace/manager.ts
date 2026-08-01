// onworking/src/main/workspace/manager.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { APIRouter } from '../api/router';

const CONFIG_PATH = path.join(app.getPath('userData'), 'workspaces.json');

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
    const ws = new Workspace(rootPath);
    ws.init();
    WorkspaceManager._addRecent({ rootPath, name: path.basename(rootPath), openedAt: new Date().toISOString() });
    return ws;
  }

  static open(rootPath: string): Workspace {
    if (!fs.existsSync(rootPath)) throw new Error(`Workspace not found: ${rootPath}`);
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
}
