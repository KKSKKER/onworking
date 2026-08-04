// onworking/src/renderer/components/View4Sql.tsx
// View4 SQL 工作台 — 从工作区 DB 用 SQL 拉数据
// 表浏览器 + SQL 编辑器 + 结果网格
import React, { useEffect, useState } from 'react';
import { DataTable } from './DataTable';
import { ResizableSidebar } from './ResizableSidebar';
import { PaginationBar } from './PaginationBar';
import { t } from '../../common/i18n';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// 分页渲染,每页 N 行,避免大结果集冻结界面(查询本身不限制)
const PAGE_SIZE = 500;

export const View4Sql: React.FC = () => {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [sql, setSql] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [writeInfo, setWriteInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState('');
  const [copyInfo, setCopyInfo] = useState('');
  const [page, setPage] = useState(0);

  const loadTables = (): void => {
    window.onworking.api.call('db.getTables').then(res => {
      if (res.success) setTables((res.data as string[]) ?? []);
    }).catch(() => { /* keep current list */ });
  };

  useEffect(() => { loadTables(); }, []);

  const selectTable = async (t: string): Promise<void> => {
    setSelectedTable(t);
    setError('');
    const res = await window.onworking.api.call('db.getSchema', { table: t });
    if (res.success) setSchema((res.data as ColumnInfo[]) ?? []);
    setSql(`SELECT * FROM "${t}" LIMIT 100`);
  };

  const runQuery = async (): Promise<void> => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setError('');
    setRows(null);
    setCols([]);
    setWriteInfo(null);
    try {
      if (isReadStatement(sql)) {
        const res = await window.onworking.api.call('db.query', { sql });
        if (res.success) {
          const data = (res.data ?? []) as Record<string, unknown>[];
          setRows(data);
          setPage(0);
          if (data.length > 0) setCols(Object.keys(data[0]));
        } else {
          setError(res.error ?? t('view4.queryFailed'));
        }
      } else {
        // 写语句 → db.run,结果不是行而是 {changes, lastInsertRowid}
        const res = await window.onworking.api.call('db.run', { sql });
        if (res.success) {
          const r = (res.data ?? {}) as { changes?: number; lastInsertRowid?: number };
          setWriteInfo(t('view4.affectedRows', { changes: r.changes ?? 0 }) + (r.lastInsertRowid ? t('view4.lastInsertRowid', { rowid: r.lastInsertRowid }) : ''));
          loadTables(); // 表结构可能变了,刷新表浏览器
        } else {
          setError(res.error ?? t('view4.executeFailed'));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setRunning(false);
  };

  const exportCsv = async (): Promise<void> => {
    if (!sql.trim() || exporting) return;
    setExporting(true);
    setError('');
    setExportInfo('');
    try {
      const res = await window.onworking.api.call('db.exportCsv', { sql });
      if (res.success) {
        const d = (res.data ?? {}) as { canceled?: boolean; rowCount?: number; filePath?: string };
        if (d.canceled) setExportInfo(t('view4.exportCancelled'));
        else setExportInfo(t('view4.exportedRows', { rowCount: d.rowCount ?? 0, filePath: d.filePath ?? '' }));
      } else {
        setError(res.error ?? t('view4.exportFailed'));
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setExporting(false);
  };

  // 导出整个数据库的结构(表名+列头) → 格式化为 AI 友好文本 → 复制到剪贴板
  const copyStructure = async (): Promise<void> => {
    setCopyInfo('');
    setError('');
    try {
      const res = await window.onworking.api.call('db.getStructure');
      if (!res.success) { setError(res.error ?? t('view4.getStructureFailed')); return; }
      const d = (res.data ?? {}) as {
        tables: { table: string; columns: { name: string; type: string; pk: boolean }[] }[];
      };
      const lines: string[] = [t('view4.dbStructureHeader')];
      for (const table of d.tables) {
        lines.push('', t('view4.tableLabel', { table: table.table }), t('view4.fieldLabel'));
        for (const c of table.columns) {
          lines.push(t('view4.fieldDetail', { name: c.name, type: c.type, pkSuffix: c.pk ? t('view4.pkSuffix') : '' }));
        }
      }
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyInfo(t('view4.copiedStructure', { count: d.tables.length }));
    } catch (e) {
      setError(t('view4.copyFailed', { message: (e as Error).message }));
    }
  };

  const displayedRows = rows ? rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 12 }}>
      {/* 左:表浏览器 */}
      <ResizableSidebar initialWidth={220} minWidth={160} contentStyle={{ padding: 8, borderRight: '1px solid #eee' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('view4.tableTitle')}</div>
        {tables.length === 0 && <div style={{ color: '#999' }}>{t('view4.noTables')}</div>}
        {tables.map(t => (
          <div key={t} onClick={() => selectTable(t)}
            style={{ padding: '3px 6px', cursor: 'pointer', borderRadius: 3,
              background: selectedTable === t ? '#e6f0ff' : 'transparent' }}>
            {t}
          </div>
        ))}
        {selectedTable && schema.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('view4.columnsTitle', { count: schema.length })}</div>
            {schema.map(c => (
              <div key={c.name} style={{ color: '#555', fontSize: 11, padding: '1px 0' }}>
                {c.name} <span style={{ color: '#999' }}>({c.type})</span>
                {c.pk > 0 && ' 🔑'}
              </div>
            ))}
          </div>
        )}
      </ResizableSidebar>

      {/* 右:编辑器 + 结果 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
          <textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery(); }}
            placeholder={t('view4.sqlPlaceholder')}
            spellCheck={false}
            style={{ width: '100%', height: 80, fontFamily: 'Consolas, monospace', fontSize: 12,
              padding: 8, boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: 3, resize: 'vertical' }}
          />
          <div style={{ color: '#999', fontSize: 11, marginTop: 4 }}>
            {t('view4.sqlHint')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button onClick={runQuery} disabled={running}
              style={{ padding: '5px 16px', background: '#007acc', color: 'white', border: 'none',
                borderRadius: 3, cursor: running ? 'default' : 'pointer', opacity: running ? 0.6 : 1 }}>
              {running ? t('common.running') : t('view4.run')}
            </button>
            <button onClick={exportCsv} disabled={exporting}
              style={{ padding: '5px 16px', background: '#28a745', color: 'white', border: 'none',
                borderRadius: 3, cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1 }}>
              {exporting ? t('common.exporting') : t('view4.exportCsv')}
            </button>
            <button onClick={copyStructure}
              style={{ padding: '5px 16px', background: '#6f42c1', color: 'white', border: 'none',
                borderRadius: 3, cursor: 'pointer' }}
              title={t('view4.copyStructureTitle')}>
              {t('view4.copyStructure')}
            </button>
            {copyInfo && <span style={{ color: '#2a7' }}>{copyInfo}</span>}
            {exportInfo && <span style={{ color: '#2a7' }}>{exportInfo}</span>}
            {rows !== null && (
              <span style={{ color: '#666' }}>{t('view4.rowCount', { count: rows.length })}</span>
            )}
            {writeInfo !== null && <span style={{ color: '#2a7' }}>{writeInfo}</span>}
          </div>
        </div>

        {rows && (
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
        )}

        {error && (
          <div style={{ padding: '6px 12px', color: '#c00', background: '#fff0f0', borderBottom: '1px solid #f0d0d0', fontFamily: 'Consolas, monospace' }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {rows && (
            <DataTable columns={cols} rows={displayedRows} />
          )}
        </div>
      </div>
    </div>
  );
};

/** 读语句(返回行)走 db.query;其余(INSERT/UPDATE/DELETE/DDL)走 db.run */
function isReadStatement(sql: string): boolean {
  // 去掉行注释和首部空白,取第一个关键字
  const trimmed = sql.trim().replace(/^--[^\n]*\n?/gm, '').trim();
  const m = /^([a-z]+)/i.exec(trimmed);
  if (!m) return false;
  const kw = m[1].toUpperCase();
  return ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'].includes(kw);
}
