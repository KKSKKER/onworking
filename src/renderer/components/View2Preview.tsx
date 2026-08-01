// onworking/src/renderer/components/View2Preview.tsx
import React, { useState } from 'react';
import { UniverSheet } from './UniverSheet';

interface View2PreviewProps {
  filePath: string;
  onETLComplete: (result: Record<string, unknown>) => void;
}

export const View2Preview: React.FC<View2PreviewProps> = ({ filePath, onETLComplete }) => {
  const [headerRow, setHeaderRow] = useState(3);
  const [status, setStatus] = useState('');
  const [executing, setExecuting] = useState(false);

  const loadPreview = async () => {
    if (!filePath) return;
    setStatus('加载中...');
    const res = await window.onworking.api.call('etl.preview', {
      file: filePath, sheetIndex: 0, headerRow, maxRows: 100,
    });
    if (res.success) {
      const snapshot = res.data as { totalRows: number; totalColumns: number };
      setStatus(`已加载: ${snapshot.totalRows} 行, ${snapshot.totalColumns} 列 (表头行: ${headerRow})`);
    } else {
      setStatus(`错误: ${res.error}`);
    }
  };

  const executeImport = async () => {
    setExecuting(true);
    setStatus('导入中...');
    const rulesRes = await window.onworking.api.call('rule.list');
    if (!rulesRes.success || !(rulesRes.data as unknown[]).length) {
      setStatus('错误: 请先在 View1 中保存规则');
      setExecuting(false);
      return;
    }
    const rules = rulesRes.data as { name: string }[];
    const ruleName = rules[0].name;

    const res = await window.onworking.api.call('etl.execute', { ruleName });
    if (res.success) {
      setStatus('导入完成!');
      onETLComplete(res.data as Record<string, unknown>);
    } else {
      setStatus(`错误: ${res.error}`);
    }
    setExecuting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12,
        alignItems: 'center', fontSize: 12 }}>
        <span>文件: {filePath || '(未选择 — 请先在 View1 中选中文件)'}</span>
        <span>表头行: <input type="number" value={headerRow} onChange={e => setHeaderRow(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
        <button onClick={loadPreview} style={{ padding: '2px 8px' }}>加载预览</button>
        <button onClick={executeImport} disabled={executing}
          style={{ padding: '2px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {executing ? '导入中...' : '▶ 执行导入'}
        </button>
        <span style={{ color: '#666' }}>{status}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <UniverSheet />
      </div>
    </div>
  );
};
