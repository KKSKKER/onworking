// onworking/src/renderer/state/TableConfigStore.tsx
// React Context 提供者 — 每 sheet 一个 TableConfig,切换 sheet 即切换活跃对象
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { TableConfig } from './TableConfig';

interface TableConfigStoreValue {
  revision: number;
  selectedFile: string;
  selectedSheetIndex: number;
  selectFile: (file: string) => Promise<void>;
  selectSheet: (index: number) => void;
  getSheetConfigs: (file: string) => TableConfig[] | undefined;
  getActiveConfig: (file: string) => TableConfig | undefined;
}

const TableConfigContext = createContext<TableConfigStoreValue | null>(null);

export const TableConfigStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const configsRef = useRef<Map<string, TableConfig[]>>(new Map());
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [revision, setRevision] = useState(0);

  const notify = useCallback(() => setRevision(r => r + 1), []);

  const deriveRulesDir = (file: string): string => {
    const normalized = file.replace(/\\/g, '/');
    const sourceIdx = normalized.indexOf('/source/');
    return sourceIdx > 0 ? normalized.slice(0, sourceIdx) + '/.onworking/rules' : '';
  };

  const ensureSheetConfigs = useCallback(async (file: string): Promise<TableConfig[]> => {
    const existing = configsRef.current.get(file);
    if (existing) return existing;

    const rulesDir = deriveRulesDir(file);
    const scan = await window.onworking.api.call('etl.scanSheets', { file });
    const sheets: { index: number; name: string }[] =
      scan.success ? ((scan.data as { index: number; name: string }[]) ?? []) : [{ index: 0, name: 'Sheet1' }];

    const list = sheets.map(s => {
      const cfg = new TableConfig({ filePath: file, sheetIndex: s.index, sheetName: s.name, onChange: notify });
      cfg.rulesDir = rulesDir;
      return cfg;
    });

    for (const cfg of list) {
      try { await cfg.load(); } catch { /* 单个 sheet 规则加载失败不阻塞 */ }
    }

    configsRef.current.set(file, list);
    return list;
  }, [notify]);

  const selectFile = useCallback(async (file: string) => {
    setSelectedFile(file);
    if (!file) return;
    await ensureSheetConfigs(file);
    setSelectedSheetIndex(0);
  }, [ensureSheetConfigs]);

  const selectSheet = useCallback((index: number) => {
    setSelectedSheetIndex(index);
  }, []);

  const getSheetConfigs = useCallback((file: string) => configsRef.current.get(file), []);
  const getActiveConfig = useCallback((file: string) => configsRef.current.get(file)?.[selectedSheetIndex], [selectedSheetIndex]);

  const value: TableConfigStoreValue = {
    revision, selectedFile, selectedSheetIndex, selectFile, selectSheet, getSheetConfigs, getActiveConfig,
  };
  return React.createElement(TableConfigContext.Provider, { value }, children);
};

export function useTableConfigStore(): TableConfigStoreValue {
  const ctx = useContext(TableConfigContext);
  if (!ctx) throw new Error('useTableConfigStore must be used within TableConfigStoreProvider');
  return ctx;
}

export function useTableConfig(file: string): TableConfig | undefined {
  const { getActiveConfig, revision, selectedSheetIndex } = useTableConfigStore();
  return useMemo(() => file ? getActiveConfig(file) : undefined, [file, getActiveConfig, revision, selectedSheetIndex]);
}
