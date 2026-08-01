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
    onInit(info);  // trigger main-process module initialization
    return info;
  }, { description: 'Create and initialize a new workspace' });

  router.register('workspace.open', async (params) => {
    const { rootPath } = params as { rootPath: string };
    const ws = WorkspaceManager.open(rootPath);
    const info = ws.toInfo();
    onInit(info);
    return info;
  }, { description: 'Open an existing workspace' });

  router.register('workspace.info', async () => {
    return { error: 'workspace.info requires active workspace context' };
  }, { description: 'Get current workspace info' });

  router.register('workspace.listRecent', async () => {
    return WorkspaceManager.listRecent();
  }, { description: 'List recent workspaces' });
}
