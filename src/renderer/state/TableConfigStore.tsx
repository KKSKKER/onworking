// onworking/src/renderer/state/TableConfigStore.tsx
// React Context 提供者 — 跨视图共享每个源文件的 TableConfig
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TableConfig } from './TableConfig';
import type { RuleDefinition } from '../../common/types/etl-types';

interface TableConfigStoreValue {
  revision: number;
  selectedFile: string;
  selectedRule: string;
  selectFile: (file: string) => Promise<void>;
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

  const selectFile = useCallback(async (file: string) => {
    setSelectedFile(file);
    if (!file) return;
    const cfg = ensureConfig(file);
    if (cfg.fields.length > 0) return; // already loaded

    // Try loading a saved rule first, fall back to auto-detect
    const fileName = file.replace(/^.*[\\/]/, '');
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    const ruleName = `rule_${baseName}`;
    const res = await window.onworking.api.call('rule.get', { name: ruleName });
    if (res.success) {
      cfg.loadFromRuleDefinition(res.data as RuleDefinition);
    } else {
      cfg.detectFields();
    }
  }, [ensureConfig]);

  const selectRule = useCallback(async (ruleName: string) => {
    setSelectedRule(ruleName);
    if (!ruleName) return;
    const res = await window.onworking.api.call('rule.get', { name: ruleName });
    if (!res.success) return;
    const rule = res.data as RuleDefinition;

    // Find which file this rule belongs to from its display or saved source
    // Rules saved by TableConfig include the original file in display: "提取规则: filename"
    const fileName = rule.display?.replace(/^提取规则:\s*/, '');
    // Try to match against existing configs or the currently selected file
    let targetFile = selectedFile;
    if (fileName && !targetFile) {
      // Search known configs for a matching file
      for (const [path] of configsRef.current) {
        if (path.endsWith(fileName) || path.includes(fileName)) {
          targetFile = path;
          break;
        }
      }
    }

    if (targetFile) {
      setSelectedFile(targetFile);
      ensureConfig(targetFile).loadFromRuleDefinition(rule);
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
