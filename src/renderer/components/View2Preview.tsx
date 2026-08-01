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
}

export const View2Preview: React.FC<View2PreviewProps> = ({ filePath }) => {
  const config = useTableConfig(filePath);
  const [status, setStatus] = useState('');
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);

  const headerRow = config?.headerRow ?? 1;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = useCallback(async () => {
    if (!filePath) return;
    setStatus('加载中...');
    setSnapshot(null);
    const res = await window.onworking.api.call('etl.preview', {
      file: filePath, sheetIndex: 0, headerRow, maxRows: 100,
    });
    if (res.success) {
      let snap = res.data as PreviewSnapshot;
      // Apply BigTable field mapping: rename columns to mapped field names
      if (config && config.fields.length > 0) {
        const mapping = new Map<string, string>();
        for (const f of config.fields) {
          if (f.included && f.mappedField) mapping.set(f.sourceHeader, f.mappedField);
        }
        if (mapping.size > 0) {
          const newHeaders = snap.headers.map(h => mapping.get(h) || h);
          snap = { ...snap, headers: newHeaders };
        }
      }
      setSnapshot(snap);
      setStatus(`已加载: ${snap.totalRows} 行, ${snap.totalColumns} 列 (表头行: ${headerRow})`);
    } else {
      setStatus(`错误: ${res.error}`);
    }
  }, [filePath, headerRow]);

  // Auto-load preview when entering view or when headerRow changes (debounced)
  useEffect(() => {
    if (!filePath) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => loadPreview(), 300);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [filePath, headerRow, loadPreview]);

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
