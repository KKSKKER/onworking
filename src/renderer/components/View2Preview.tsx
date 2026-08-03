// onworking/src/renderer/components/View2Preview.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTableConfig } from '../state/TableConfigStore';
import { PaginationBar } from './PaginationBar';

interface PreviewCell { v: string | number | boolean | null; t?: string }
interface PreviewSnapshot {
  sheetName: string; headers: string[];
  rows: PreviewCell[][]; totalRows: number; totalColumns: number;
}

interface View2PreviewProps {
  filePath: string;
  active: boolean;
}

const PAGE_SIZE = 100;

export const View2Preview: React.FC<View2PreviewProps> = ({ filePath, active }) => {
  const config = useTableConfig(filePath);
  const [status, setStatus] = useState('');
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [page, setPage] = useState(0);

  const headerRow = config?.headerRow ?? 1;
  const sheetIndex = config?.sheetIndex ?? 0;
  const endRow = config?.endRow ?? null;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = useCallback(async () => {
    if (!filePath) return;
    setStatus('加载中...');
    setSnapshot(null);
    const res = await window.onworking.api.call('etl.preview', {
      file: filePath, sheetIndex, headerRow,
      offset: page * PAGE_SIZE, limit: PAGE_SIZE,
      dataEndRow: endRow ?? undefined,
    });
    if (res.success) {
      const s = res.data as PreviewSnapshot;
      setSnapshot(s);
      // 截止行/翻页导致页码越界时,回退到最后一页
      if (page > 0 && s.totalRows > 0 && page * PAGE_SIZE >= s.totalRows) {
        setPage(Math.max(0, Math.floor((s.totalRows - 1) / PAGE_SIZE)));
        return;
      }
      const first = s.totalRows > 0 ? page * PAGE_SIZE + 1 : 0;
      const last = page * PAGE_SIZE + s.rows.length;
      const endNote = endRow ? `, 截止行: ${endRow}` : '';
      setStatus(`已加载: 第 ${first}-${last} 行, 共 ${s.totalRows} 行, ${s.totalColumns} 列 (表头行: ${headerRow}${endNote})`);
    } else {
      setStatus(`错误: ${res.error}`);
    }
  }, [filePath, headerRow, sheetIndex, page, endRow]);

  // Auto-load preview when entering view or when headerRow/endRow/page changes (debounced)
  useEffect(() => {
    if (!filePath || !active) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { void loadPreview(); }, 300);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [filePath, headerRow, sheetIndex, page, endRow, active, loadPreview]);

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

  const previewRows = snapshot ? snapshot.rows : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12,
        alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
        <span>文件: {filePath || '(未选择 — 请先在 View1 中选中文件)'}</span>
        <span>表头行: <input type="number" value={headerRow} onChange={e => config?.setHeaderRow(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
        <span>截止行: <input type="number" value={endRow ?? ''} placeholder="末尾"
          onChange={e => config?.setEndRow(e.target.value === '' ? null : Number(e.target.value))}
          style={{ width: 60, padding: '2px 4px' }} /></span>
        <button onClick={() => { void loadPreview(); }} style={{ padding: '2px 8px' }}>加载预览</button>
        <span style={{ color: '#666' }}>{status}</span>
      </div>

      {snapshot && snapshot.totalRows > 0 && (
        <PaginationBar page={page} pageSize={PAGE_SIZE} total={snapshot.totalRows} onPageChange={setPage} />
      )}

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
              {previewRows.map((row, ri) => {
                // 数据行 ri 对应 sheet 第 (headerRow + ri + 1) 行
                const sheetRow = headerRow + ri + 1;
                const isHeaderRow = ri + 1 === headerRow; // 保留原有表头行高亮语义
                const isEndRow = endRow !== null && sheetRow === endRow;
                return (
                  <tr key={ri} style={{ background: isHeaderRow ? '#fffde7' : (isEndRow ? '#e6f4ea' : 'white') }}>
                    {effectiveColumns.map((c, ci) => {
                      const cell = row[c.idx];
                      return (
                        <td key={ci} style={{ padding: '2px 8px', border: '1px solid #eee', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cell?.v !== null && cell?.v !== undefined ? String(cell.v) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
