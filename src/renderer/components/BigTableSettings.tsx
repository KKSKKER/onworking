// onworking/src/renderer/components/BigTableSettings.tsx
// 大表设置面板 — 表名、自增主键、字段 CRUD、类型/主键修改、排序、保存
import React, { useState } from 'react';
import { useBigTable } from '../state/BigTableStore';
import type { TypeGuess } from '../state/TableConfig';
import { t } from '../../common/i18n';

interface BigTableSettingsProps {
  folderName: string;
  onClose: () => void;
}

export const BigTableSettings: React.FC<BigTableSettingsProps> = ({ folderName, onClose }) => {
  const bigTable = useBigTable(folderName);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<TypeGuess>('string');
  const [saveError, setSaveError] = useState('');

  if (!bigTable) return <div style={{ padding: 16 }}>{t('common.loading')}</div>;

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
    const result = bigTable.validate();
    if (!result.valid) {
      setSaveError(result.errors.join('；'));
      return;
    }
    setSaveError('');
    await bigTable.save();
  };

  const fields = bigTable.fields;
  const noPrimaryKey = !bigTable.autoIncrementId && bigTable.primaryKeyFields.length === 0;

  return (
    <div style={{ fontSize: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t('bigTableSettings.title', { folderName })}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{t('common.tableName')}</span>
          <input value={bigTable.tableName}
            onChange={e => bigTable.setTableName(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #ccc', borderRadius: 3, width: 180 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={bigTable.autoIncrementId}
            onChange={e => bigTable.setAutoIncrementId(e.target.checked)} />
          <span>{t('bigTableSettings.autoIncPk')}</span>
        </label>
      </div>

      {noPrimaryKey && (
        <div style={{ color: '#d00', marginBottom: 12, fontSize: 11 }}>
          {t('bigTableSettings.noPkWarning')}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', width: 60 }}>{t('bigTableSettings.pk')}</th>
            <th style={{ padding: '6px 8px' }}>{t('common.fieldName')}</th>
            <th style={{ padding: '6px 8px' }}>{t('common.type')}</th>
            <th style={{ padding: '6px 8px', width: 80 }}>{t('bigTableSettings.sort')}</th>
            <th style={{ padding: '6px 8px', width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 8px' }}>
                <input type="checkbox" checked={!!f.isPrimaryKey}
                  disabled={bigTable.autoIncrementId}
                  onChange={e => bigTable.setPrimaryKey(f.name, e.target.checked)} />
              </td>
              <td style={{ padding: '4px 8px' }}>{f.name}</td>
              <td style={{ padding: '4px 8px' }}>
                <select value={f.type} onChange={e => {
                  bigTable.setFieldType(f.name, e.target.value as TypeGuess);
                }} style={{ fontSize: 11 }}>
                  <option value="string">{t('bigTableSettings.typeString')}</option>
                  <option value="cents">{t('bigTableSettings.typeCents')}</option>
                  <option value="number">{t('bigTableSettings.typeNumber')}</option>
                  <option value="date">{t('bigTableSettings.typeDate')}</option>
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
          placeholder={t('bigTableSettings.newFieldPlaceholder')} style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3, width: 120 }} />
        <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as TypeGuess)} style={{ fontSize: 11, padding: '4px' }}>
          <option value="string">{t('bigTableSettings.typeString')}</option>
          <option value="cents">{t('bigTableSettings.typeCents')}</option>
          <option value="number">{t('bigTableSettings.typeNumber')}</option>
          <option value="date">{t('bigTableSettings.typeDate')}</option>
        </select>
        <button onClick={addField}
          style={{ padding: '4px 12px', background: '#007acc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {t('bigTableSettings.addField')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save}
          style={{ padding: '6px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
          {t('bigTableSettings.save')}
        </button>
        {saveError && <span style={{ color: '#d00', fontSize: 11 }}>{saveError}</span>}
      </div>
    </div>
  );
};
