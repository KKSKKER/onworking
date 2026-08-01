// onworking/src/renderer/components/View2Preview.tsx
import React, { useState } from 'react';
import { useTableConfig, useTableConfigStore } from '../state/TableConfigStore';

interface PreviewCell { v: string | number | boolean | null; t?: string }
interface PreviewSnapshot {
  sheetName: string; headers: string[];
  rows: PreviewCell[][]; totalRows: number; totalColumns: number;
}

interface View2PreviewProps {
  filePath: string;
  onETLComplete: (result: Record<string, unknown>) => void;
}

export const View2Preview: React.FC<View2PreviewProps> = ({ filePath, onETLComplete }) => {
  const config = useTableConfig(filePath);
  const { selectedRule } = useTableConfigStore();
  const [status, setStatus] = useState('');
  const [executing, setExecuting] = useState(false);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);

  const headerRow = config?.headerRow ?? 1;

  const loadPreview = async () => {
    if (!filePath) return;
    setStatus('加载中...');
    setSnapshot(null);
    const res = await window.onworking.api.call('etl.preview', {
      file: filePath, sheetIndex: 0, headerRow, maxRows: 100,
    });
    if (res.success) {
      const snap = res.data as PreviewSnapshot;
      setSnapshot(snap);
      setStatus(`已加载: ${snap.totalRows} 行, ${snap.totalColumns} 列 (表头行: ${headerRow})`);
    } else {
      setStatus(`错误: ${res.error}`);
    }
  };

  const executeImport = async () => {
    setExecuting(true);
    setStatus('导入中...');
    const ruleName = selectedRule || (config?.ruleName || '');
    if (!ruleName) {
      setStatus('错误: 请先在 View1 中保存/选择规则');
      setExecuting(false);
      return;
    }
    const res = await window.onworking.api.call('etl.execute', { ruleName });
    if (res.success) {
      setStatus('导入完成!');
      onETLComplete(res.data as Record<string, unknown>);
    } else {
      setStatus(`错误: ${res.error}`);
    }
    setExecuting(false);
  };

  const previewRows = snapshot ? snapshot.rows.slice(0, 50) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12,
        alignItems: 'center', fontSize: 12 }}>
        <span>文件: {filePath || '(未选择 — 请先在 View1 中选中文件)'}</span>
        <span>表头行: <input type="number" value={headerRow} onChange={e => config?.setHeaderRow(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
        <button onClick={loadPreview} style={{ padding: '2px 8px' }}>加载预览</button>
        <button onClick={executeImport} disabled={executing}
          style={{ padding: '2px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {executing ? '导入中...' : '▶ 执行导入'}
        </button>
        <span style={{ color: '#666' }}>{status}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {snapshot ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#e8f0fe', position: 'sticky', top: 0 }}>
                {snapshot.headers.map((h, i) => (
                  <th key={i} style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri + 1 === headerRow ? '#fffde7' : 'white' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '2px 8px', border: '1px solid #eee', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cell?.v !== null && cell?.v !== undefined ? String(cell.v) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>
            {filePath ? '点击"加载预览"查看文件内容' : '请先在 View1 中选中文件'}
          </div>
        )}
      </div>
    </div>
  );
};
