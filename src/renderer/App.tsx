import React, { useEffect, useState, useRef } from 'react';
import { UniverSheet } from './components/UniverSheet';
import { FormulaBar } from './components/FormulaBar';
import type { Univer } from '@univerjs/core';

declare global {
  interface Window {
    onworking: {
      platform: string;
      api: {
        call(command: string, params?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
    };
  }
}

export const App: React.FC = () => {
  const [commands, setCommands] = useState<string[]>([]);
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const univerRef = useRef<Univer | null>(null);

  const handleLoadTestFile = async () => {
    setStatus('Loading...');
    try {
      const res = await window.onworking.api.call('etl.preview', {
        file: 'D:/Jeffrey/测试1/数据文件/扬州良诚/序时账.xls',
        sheetIndex: 0,
        headerRow: 3,
        maxRows: 50,
      });

      if (!res.success || !res.data) {
        setStatus(`Error: ${res.error}`);
        return;
      }

      const snapshot = res.data as {
        sheetName: string;
        headers: string[];
        rows: { v: unknown; t?: string }[][];
        totalRows: number;
        totalColumns: number;
      };

      // Try to write data to Univer via command service
      // (spike: full cell writing requires discovering active sheet/unit IDs)
      const univer = univerRef.current;
      if (univer) {
        try {
          const injector = (univer as unknown as Record<string, unknown>).__getInjector as (() => unknown) | undefined;
          if (injector) {
            const di = injector();
            // ICommandService injection — spike placeholder
            // Actual cell writing via SetRangeValuesCommand will be fleshed out in a future task
            void di;
          }
        } catch {
          // Univer integration not yet complete for data writing
        }
      }

      setStatus(`Loaded: ${snapshot.totalRows} rows, ${snapshot.totalColumns} cols`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    const api = window.onworking;
    if (!api) {
      setError('Preload 未加载');
      return;
    }
    setPlatform(api.platform);
    api.api.call('api:list').then(res => {
      if (res.success) setCommands(res.data as string[]);
      else setError(res.error ?? 'IPC error');
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
        <strong>OnWorking v0.1.0</strong>
        <span>平台: {platform}</span>
        <span>IPC: {error ? <span style={{color:'red'}}>{error}</span> : <span style={{color:'green'}}>✅</span>}</span>
        <span>API: {commands.length} 命令</span>
        <button onClick={handleLoadTestFile} style={{ padding: '2px 8px' }}>加载测试文件</button>
        <span>{status}</span>
      </div>
      <FormulaBar
        onEvaluate={async (formula) => {
          // Parse ENTITY(entity, attr, dimKey?, dimVal?)
          const match = formula.match(/^=ENTITY\("(\w+)",\s*"(\w+)"(?:,\s*"(\w+)",\s*"([^"]+)")?\)$/);
          if (!match) return 'ERROR: parse failed';

          const [, entityName, attrName, dimKey, dimVal] = match;
          const filters: Record<string, string> = {};
          if (dimKey && dimVal) filters[dimKey] = dimVal;

          const res = await window.onworking.api.call('entity.query', {
            name: entityName,
            filters: Object.keys(filters).length > 0 ? filters : undefined,
          });

          if (!res.success || !res.data) return `ERROR: ${res.error}`;

          const rows = res.data as Record<string, unknown>[];
          if (rows.length === 0) return 'null';
          if (rows.length === 1) return String(rows[0][attrName] ?? 'null');

          // Multiple rows: aggregate sum for cents, count for others
          const values = rows.map(r => r[attrName]);
          const allNums = values.every(v => typeof v === 'number' || typeof v === 'bigint');
          if (allNums) {
            return String(values.reduce<number>((a, b) => Number(a) + Number(b), 0));
          }
          return `[${values.join(', ')}]`;
        }}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <UniverSheet onReady={(u) => { univerRef.current = u; }} />
      </div>
    </div>
  );
};
