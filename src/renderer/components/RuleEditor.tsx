// onworking/src/renderer/components/RuleEditor.tsx
import React, { useState } from 'react';
import { useTableConfig, useTableConfigStore } from '../state/TableConfigStore';
import { SearchableSelect } from './SearchableSelect';
import { useBigTable, useBigTableStore } from '../state/BigTableStore';

interface RuleEditorProps {
  filePath: string;
  onPreview: () => void;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({ filePath, onPreview }) => {
  const { getSheetConfigs, selectedSheetIndex, selectSheet } = useTableConfigStore();
  const config = useTableConfig(filePath);
  const sheetConfigs = filePath ? (getSheetConfigs(filePath) ?? []) : [];
  const [loading, setLoading] = useState(false);
  const { selectedFolder } = useBigTableStore();
  const bigTable = useBigTable(selectedFolder);
  const bigTableFields = bigTable?.fields.map(f => f.name) ?? [];

  if (!config) return <div style={{ fontSize: 12, padding: 8, color: '#999' }}>请先在左侧选择文件</div>;

  const fields = config.fields;
  const headerRow = config.headerRow;
  const ruleName = config.ruleName;
  const saved = config.saved;

  const autoDetect = async () => {
    setLoading(true);
    try {
      await config.detectFields();
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    await config.save();
  };

  return (
    <div style={{ fontSize: 12, padding: 8 }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#666' }}>工作表 (共 {sheetConfigs.length} 张):</span>
        <select value={selectedSheetIndex} onChange={e => selectSheet(Number(e.target.value))}
          title="切换工作表" style={{ padding: '2px 6px', fontSize: 12, maxWidth: 180 }}>
          {sheetConfigs.map((sc, i) => (
            <option key={sc.sheetIndex} value={i}>{sc.sheetName}</option>
          ))}
        </select>
        <span style={{ marginLeft: 8 }}>表头行: <input type="number" value={headerRow}
          onChange={e => config.setHeaderRow(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
        <span>截止行: <input type="number" value={config.endRow ?? ''}
          onChange={e => config.setEndRow(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="末尾" style={{ width: 70, padding: '2px 4px' }} /></span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.merge}
            onChange={e => config.setMerge(e.target.checked)} />
          合并进数据表
        </label>
        <button onClick={autoDetect} disabled={loading}
          style={{ padding: '4px 12px', background: '#007acc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {loading ? '检测中...' : '🔍 自动检测字段'}
        </button>
        {ruleName && <span style={{ color: '#666' }}>规则: {ruleName}</span>}
      </div>

      {fields.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: 4, width: 36 }} title="全选/取消全选">
                  <input type="checkbox"
                    checked={fields.length > 0 && fields.every(f => f.included)}
                    onChange={e => config.setAllIncluded(e.target.checked)} />
                </th>
                <th style={{ padding: 4 }}>字段名</th>
                <th style={{ padding: 4 }}>映射字段</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', opacity: f.included ? 1 : 0.4 }}>
                  <td style={{ padding: 4 }}>
                    <input type="checkbox" checked={f.included} onChange={() => config.toggleField(i)} />
                  </td>
                  <td style={{ padding: 4 }}>{f.sourceHeader}</td>
                  <td style={{ padding: 4 }}>
                    <SearchableSelect
                      value={f.mappedField}
                      options={bigTableFields}
                      onChange={val => config.setMappedField(i, val)}
                      placeholder="映射到..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={saveRule}
              style={{ padding: '6px 16px', background: saved ? '#28a745' : '#007acc', color: 'white',
                border: 'none', borderRadius: 3, cursor: 'pointer' }}>
              {saved ? '✅ 已保存' : '💾 保存规则'}
            </button>
            <button onClick={onPreview}
              style={{ padding: '6px 16px', background: '#6c757d', color: 'white', border: 'none',
                borderRadius: 3, cursor: 'pointer' }}>
              预览 → View2
            </button>
          </div>
        </>
      )}
      {!loading && fields.length === 0 && filePath && (
        <p style={{ color: '#999' }}>选中文件后点击"自动检测字段"开始</p>
      )}
    </div>
  );
};
