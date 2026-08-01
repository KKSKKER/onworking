// onworking/src/renderer/state/BigTableStore.tsx
// React Context 提供者 — 跨视图共享 BigTable 实例与文件夹管理
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { BigTable } from './BigTable';

interface BigTableStoreValue {
  folders: string[];
  workspaceRoot: string;
  selectedFolder: string;
  selectFolder: (name: string) => Promise<void>;
  getBigTable: (name: string) => BigTable | undefined;
  ensureBigTable: (name: string) => BigTable;
  createFolder: (name: string) => Promise<void>;
  revision: number;
}

const BigTableContext = createContext<BigTableStoreValue | null>(null);

export const BigTableStoreProvider: React.FC<{ children: React.ReactNode; workspaceRoot: string }> = ({ children, workspaceRoot }) => {
  const bigTablesRef = useRef<Map<string, BigTable>>(new Map());
  const [selectedFolder, setSelectedFolder] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  const notify = useCallback(() => setRevision(r => r + 1), []);

  const ensureBigTable = useCallback((name: string): BigTable => {
    let bt = bigTablesRef.current.get(name);
    if (!bt) {
      bt = new BigTable({ name, folderPath: workspaceRoot + '/' + name, onChange: notify });
      bigTablesRef.current.set(name, bt);
    }
    return bt;
  }, [workspaceRoot, notify]);

  const getBigTable = useCallback((name: string) => bigTablesRef.current.get(name), []);

  const scanFolders = useCallback(async () => {
    // Scan workspace root for subdirs that have a source/ folder (= BigTable folders)
    const res = await window.onworking.api.call('workspace.listFolders', { rootPath: workspaceRoot });
    if (res.success) {
      setFolders(res.data as string[]);
    }
  }, [workspaceRoot]);

  const selectFolder = useCallback(async (name: string) => {
    setSelectedFolder(name);
    if (!name) return;
    const bt = ensureBigTable(name);
    await bt.load();
  }, [ensureBigTable]);

  const createFolder = useCallback(async (name: string) => {
    const folderPath = workspaceRoot + '/' + name;
    await window.onworking.api.call('workspace.createFolder', { path: folderPath + '/source' });
    await window.onworking.api.call('workspace.createFolder', { path: folderPath + '/.onworking/rules' });
    await window.onworking.api.call('workspace.createFolder', { path: folderPath + '/.onworking/db' });
    const bt = ensureBigTable(name);
    await bt.save(); // creates settings.json
    await scanFolders();
    notify();
  }, [workspaceRoot, ensureBigTable, scanFolders, notify]);

  // Scan on mount
  React.useEffect(() => { scanFolders(); }, [scanFolders]);

  const value: BigTableStoreValue = { folders, workspaceRoot, selectedFolder, selectFolder, getBigTable, ensureBigTable, createFolder, revision };
  return React.createElement(BigTableContext.Provider, { value }, children);
};

export function useBigTableStore(): BigTableStoreValue {
  const ctx = useContext(BigTableContext);
  if (!ctx) throw new Error('useBigTableStore must be used within BigTableStoreProvider');
  return ctx;
}

export function useBigTable(folderName: string): BigTable | undefined {
  const { getBigTable, revision } = useBigTableStore();
  return React.useMemo(() => folderName ? getBigTable(folderName) : undefined, [folderName, getBigTable, revision]);
}
