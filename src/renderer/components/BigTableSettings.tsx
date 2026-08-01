// onworking/src/renderer/components/BigTableSettings.tsx
// 大表设置面板 — 字段 CRUD、类型修改、排序、保存
import React, { useState } from 'react';
import { useBigTable } from '../state/BigTableStore';
import type { BigTableField } from '../state/BigTable';
import type { TypeGuess } from '../state/TableConfig';

interface BigTableSettingsProps {
  folderName: string;
  onClose: () => void;
}

export const BigTableSettings: React.FC<BigTableSettingsProps> = ({ folderName, onClose }) => {
  const bigTable = useBigTable(folderName);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<TypeGuess>('string');

  if (!bigTable) return <div style={{ padding: 16 }}>加载中...</div>;

  const addField = () => {
    if (!newFieldName.trim()) return;
    bigTable.addField(newFieldName.trim(), newFieldType);
    setNewFieldName('');
  };

  const removeField = (name: string) => {
    bigTable.removeField(name);
  };

  const moveField = (name: string, dir: -1 | 1) => {
    const field = bigTable.fields.find(f => f.name === name);
    if (!field) return;
    bigTable.reorderField(name, field.order + dir);
  };

  const save = async () => {
    await bigTable.save();
  };

  const fields = bigTable.fields;

  return (
    <div style={{ fontSize: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>大表设置: {folderName}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>字段名</th>
            <th style={{ padding: '6px 8px' }}>类型</th>
            <th style={{ padding: '6px 8px', width: 80 }}>排序</th>
            <th style={{ padding: '6px 8px', width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 8px' }}>{f.name}</td>
              <td style={{ padding: '4px 8px' }}>
                <select value={f.type} onChange={e => {
                  bigTable.setFieldType(f.name, e.target.value as TypeGuess);
                }} style={{ fontSize: 11 }}>
                  <option value="string">文本</option>
                  <option value="cents">金额(分)</option>
                  <option value="number">数字</option>
                  <option value="date">日期</option>
                </select>
              </td>
              <td style={{ padding: '4px 8px' }}>
                <button onClick={() => moveField(f.name, -1)} disabled={f.order <= 1}
                  style={{ border: 'none', cursor: 'pointer' }}>▲</button>
                <button onClick={() => moveField(f.name, 1)} disabled={f.order >= fields.length}
                  style={{ border: 'none', cursor: 'pointer' }}>▼</button>
              </td>
              <td style={{ padding: '4px 8px' }}>
                <button onClick={() => removeField(f.name)}
                  style={{ border: 'none', cursor: 'pointer', color: '#d00' }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addField(); }}
          placeholder="新字段名" style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3, width: 120 }} />
        <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as TypeGuess)} style={{ fontSize: 11, padding: '4px' }}>
          <option value="string">文本</option>
          <option value="cents">金额(分)</option>
          <option value="number">数字</option>
          <option value="date">日期</option>
        </select>
        <button onClick={addField}
          style={{ padding: '4px 12px', background: '#007acc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          + 新增字段
        </button>
      </div>

      <button onClick={save}
        style={{ padding: '6px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
        💾 保存设置
      </button>
    </div>
  );
};
