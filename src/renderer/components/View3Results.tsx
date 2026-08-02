// onworking/src/renderer/components/View3Results.tsx
import React, { useEffect, useState } from 'react';
import { useBigTableStore } from '../state/BigTableStore';

interface View3ResultsProps {}

export const View3Results: React.FC<View3ResultsProps> = () => {
  const { folders, workspaceRoot } = useBigTableStore();
  const [mergeFolder, setMergeFolder] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<Record<string, unknown>>();

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.onworking.api.call('db.getTables').then(res => {
      if (res.success) {
        const allTables = (res.data as string[]).filter(t => t !== '_lineage' && !t.startsWith('sqlite_'));
        setTables(allTables);
        if (allTables.length > 0) setSelectedTable(allTables[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    setLoading(true);
    window.onworking.api.call('etl.getTableData', { table: selectedTable, limit: 200, offset: 0 }).then(res => {
      if (res.success) {
        const data = res.data as { rows: Record<string, unknown>[]; total: number };
        setRows(data.rows);
        setTotal(data.total);
      }
      setLoading(false);
    });
  }, [selectedTable]);

  const [exporting, setExporting] = useState(false);

  const exportCSV = async () => {
    if (!selectedTable || total === 0) return;
    setExporting(true);
    // Fetch ALL rows for export (not just paginated view)
    const res = await window.onworking.api.call('etl.getTableData', { table: selectedTable, limit: total + 100, offset: 0 });
    setExporting(false);
    if (!res.success) return;
    const allRows = (res.data as { rows: Record<string, unknown>[] }).rows;
    if (allRows.length === 0) return;
    const columns = Object.keys(allRows[0]);
    const header = columns.map(c => `"${c}"`).join(',');
    const body = allRows.map(row => columns.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const csv = '﻿' + header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [buildingMaster, setBuildingMaster] = useState(false);

  const doMerge = async () => {
    if (!mergeFolder) return;
    setMerging(true);
    const folderPath = workspaceRoot + '/' + mergeFolder;
    const res = await window.onworking.api.call('etl.mergeFolder', { folderPath });
    if (res.success) {
      setMergeResult(res.data as Record<string, unknown>);
      const dbRes = await window.onworking.api.call('db.getTables');
      if (dbRes.success) {
        const allTables = (dbRes.data as string[]).filter(t => t !== '_lineage' && !t.startsWith('sqlite_'));
        setTables(allTables);
        if (allTables.length > 0) setSelectedTable(allTables[0]);
      }
    }
    setMerging(false);
  };

  const buildMaster = async () => {
    setBuildingMaster(true);
    const res = await window.onworking.api.call('etl.buildMasterTable');
    if (res.success) {
      const result = res.data as { syncedTables: string[]; folderCount: number };
      setMergeResult(result as unknown as Record<string, unknown>);
      const dbRes = await window.onworking.api.call('db.getTables');
      if (dbRes.success) {
        const allTables = (dbRes.data as string[]).filter(t => t !== '_lineage' && !t.startsWith('sqlite_'));
        setTables(allTables);
        if (allTables.length > 0) setSelectedTable(allTables[0]);
      }
    }
    setBuildingMaster(false);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12 }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>大表文件夹:</span>
        <select value={mergeFolder} onChange={e => setMergeFolder(e.target.value)} style={{ padding: '2px 4px', width: 180 }}>
          <option value="">选择...</option>
          {folders.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={doMerge} disabled={merging || !mergeFolder}
          style={{ padding: '2px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {merging ? '合并中...' : '合并生成'}
        </button>
        <button onClick={buildMaster} disabled={buildingMaster}
          style={{ padding: '2px 12px', background: '#007acc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {buildingMaster ? '构建中...' : '生成总表'}
        </button>
        {mergeResult && <span style={{ fontSize: 11 }}>导入 {(mergeResult as Record<string, unknown>).rowsInserted as number} 行</span>}
        <span style={{ width: 1, height: 16, background: '#ddd' }} />
        <span>合并数据表:</span>
        <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} style={{ padding: '2px 4px', width: 180 }}>
          {tables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ color: '#666' }}>共 {total} 行</span>
        <button onClick={exportCSV} disabled={exporting} style={{ padding: '2px 8px', marginLeft: 'auto' }}>
          {exporting ? '导出中...' : '导出 CSV'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {loading ? <div>加载中...</div>
          : rows.length === 0 ? <div style={{ color: '#999', padding: 20 }}>暂无数据。请先选择文件夹并点击「合并生成」。</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                  {columns.map(c => (
                    <th key={c} style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    {columns.map(c => (
                      <td key={c} style={{ padding: '2px 8px', border: '1px solid #f0f0f0', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[c] !== null && row[c] !== undefined ? String(row[c]) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
};
