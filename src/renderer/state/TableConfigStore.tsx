// onworking/src/renderer/state/TableConfigStore.tsx
// React Context 提供者 — 跨视图共享每个源文件的 TableConfig
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TableConfig } from './TableConfig';
import type { RuleDefinition } from '../../common/types/etl-types';

interface TableConfigStoreValue {
  revision: number;
  selectedFile: string;
  selectedRule: string;
  selectFile: (file: string) => void;
  selectRule: (ruleName: string) => void;
  getConfig: (file: string) => TableConfig | undefined;
  ensureConfig: (file: string) => TableConfig;
}

const TableConfigContext = createContext<TableConfigStoreValue | null>(null);

export const TableConfigStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const configsRef = useRef<Map<string, TableConfig>>(new Map());
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedRule, setSelectedRule] = useState('');
  const [revision, setRevision] = useState(0);

  const notify = useCallback(() => setRevision(r => r + 1), []);

  const ensureConfig = useCallback((file: string): TableConfig => {
    let cfg = configsRef.current.get(file);
    if (!cfg) {
      cfg = new TableConfig({ filePath: file, onChange: notify });
      configsRef.current.set(file, cfg);
    }
    return cfg;
  }, [notify]);

  const getConfig = useCallback((file: string) => configsRef.current.get(file), []);

  const selectFile = useCallback((file: string) => {
    setSelectedFile(file);
    if (file) ensureConfig(file);
  }, [ensureConfig]);

  const selectRule = useCallback(async (ruleName: string) => {
    setSelectedRule(ruleName);
    if (!selectedFile || !ruleName) return;
    const res = await window.onworking.api.call('rule.get', { name: ruleName });
    if (res.success) {
      ensureConfig(selectedFile).loadFromRuleDefinition(res.data as RuleDefinition);
    }
  }, [selectedFile, ensureConfig]);

  const value: TableConfigStoreValue = { revision, selectedFile, selectedRule, selectFile, selectRule, getConfig, ensureConfig };
  return React.createElement(TableConfigContext.Provider, { value }, children);
};

export function useTableConfigStore(): TableConfigStoreValue {
  const ctx = useContext(TableConfigContext);
  if (!ctx) throw new Error('useTableConfigStore must be used within TableConfigStoreProvider');
  return ctx;
}

export function useTableConfig(file: string): TableConfig | undefined {
  const { getConfig, revision } = useTableConfigStore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => file ? getConfig(file) : undefined, [file, getConfig, revision]);
}
