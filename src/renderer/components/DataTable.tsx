// onworking/src/renderer/components/DataTable.tsx
// 可复用数据表格 — 列头可拖动调整列宽(tableLayout fixed,不再随内容跳)
import React, { useRef, useState } from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
}

// 模块级列宽存储:跨 DataTable 卸载/重挂保留列宽(View3 加载时会卸载重挂,防止调好的宽度被重置)
const widthStore: Record<string, number> = {};

export const DataTable: React.FC<DataTableProps> = ({ columns, rows }) => {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of columns) init[c] = widthStore[c] ?? 160;
    return init;
  });
  const dragRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const startResize = (col: string, e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { col, startX: e.clientX, startW: widths[col] ?? 160 };

    const onMove = (ev: MouseEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.max(40, d.startW + (ev.clientX - d.startX));
      setWidths(w => {
        if (w[d.col] === next) return w;
        widthStore[d.col] = next;
        return { ...w, [d.col]: next };
      });
    };
    const onUp = (): void => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (rows.length === 0) {
    return <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无数据</div>;
  }

  // 表格宽度显式 = 各列宽度之和:拖一列只改这一列,其他列不被重新分配
  const totalWidth = columns.reduce((s, c) => s + (widths[c] ?? 160), 0);

  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: totalWidth }}>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c} style={{ border: '1px solid #e5e5e5', padding: 0, textAlign: 'left',
              background: '#fafafa', position: 'sticky', top: 0, fontWeight: 600,
              whiteSpace: 'nowrap', width: widths[c] ?? 160 }}>
              <div style={{ position: 'relative', padding: '4px 12px 4px 8px', minHeight: 20 }}>
                {c}
                <div onMouseDown={e => startResize(c, e)}
                  title="拖动调整列宽"
                  style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
                    cursor: 'col-resize', zIndex: 1 }} />
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
            {columns.map(c => (
              <td key={c} style={{ border: '1px solid #f0f0f0', padding: '2px 8px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: r[c] === null || r[c] === undefined ? '#aaa' : 'inherit' }}>
                {formatCell(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
