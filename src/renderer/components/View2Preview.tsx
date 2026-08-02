// onworking/src/renderer/components/View2Preview.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTableConfig } from '../state/TableConfigStore';

interface PreviewCell { v: string | number | boolean | null; t?: string }
interface PreviewSnapshot {
  sheetName: string; headers: string[];
  rows: PreviewCell[][]; totalRows: number; totalColumns: number;
}

interface View2PreviewProps {
  filePath: string;
  active: boolean;
}

export const View2Preview: React.FC<View2PreviewProps> = ({ filePath, active }) => {
  const config = useTableConfig(filePath);
  const [status, setStatus] = useState('');
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);

  const headerRow = config?.headerRow ?? 1;
  const sheetIndex = config?.sheetIndex ?? 0;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = useCallback(async () => {
    if (!filePath) return;
    setStatus('加载中...');
    setSnapshot(null);
    const res = await window.onworking.api.call('etl.preview', {
      file: filePath, sheetIndex, headerRow, maxRows: 100,
    });
    if (res.success) {
      const s = res.data as PreviewSnapshot;
      setSnapshot(s);
      setStatus(`已加载: ${s.totalRows} 行, ${s.totalColumns} 列 (表头行: ${headerRow})`);
    } else {
      setStatus(`错误: ${res.error}`);
    }
  }, [filePath, headerRow, sheetIndex]);

  // Auto-load preview when entering view or when headerRow changes (debounced)
  useEffect(() => {
    if (!filePath || !active) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => loadPreview(), 300);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [filePath, headerRow, sheetIndex, active, loadPreview]);

  // Build field mapping at render time — always reflects latest config state
  const fieldMap = new Map<string, string>();
  if (config?.fields) {
    for (const f of config.fields) {
      if (f.included && f.mappedField) fieldMap.set(f.sourceHeader, f.mappedField);
    }
  }
  // Show only mapped columns if mapping exists; otherwise show all
  const effectiveColumns = fieldMap.size > 0
    ? (snapshot?.headers.map((h, i) => ({ header: fieldMap.get(h) || h, idx: i })).filter(c => fieldMap.has(snapshot!.headers[c.idx])) ?? [])
    : (snapshot?.headers.map((h, i) => ({ header: h, idx: i })) ?? []);

  const previewRows = snapshot ? snapshot.rows.slice(0, 50) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12,
        alignItems: 'center', fontSize: 12 }}>
        <span>文件: {filePath || '(未选择 — 请先在 View1 中选中文件)'}</span>
        <span>表头行: <input type="number" value={headerRow} onChange={e => config?.setHeaderRow(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
        <button onClick={loadPreview} style={{ padding: '2px 8px' }}>加载预览</button>
        <span style={{ color: '#666' }}>{status}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {snapshot ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#e8f0fe', position: 'sticky', top: 0 }}>
                {effectiveColumns.map((c, i) => (
                  <th key={i} style={{ padding: '4px 8px', border: '1px solid #ccc', textAlign: 'left', whiteSpace: 'nowrap' }}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri + 1 === headerRow ? '#fffde7' : 'white' }}>
                  {effectiveColumns.map((c, ci) => {
                    const cell = row[c.idx];
                    return (
                      <td key={ci} style={{ padding: '2px 8px', border: '1px solid #eee', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cell?.v !== null && cell?.v !== undefined ? String(cell.v) : ''}
                      </td>
                    );
                  })}
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
