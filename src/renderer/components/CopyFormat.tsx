// onworking/src/renderer/components/CopyFormat.tsx
// 复制格式:把当前映射保存为模板,或把模板应用到当前映射(仅当前大表)。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TableConfig } from '../state/TableConfig';
import { useBigTableStore } from '../state/BigTableStore';
import { t } from '../../common/i18n';

interface TemplateDef {
  name: string;
  mappings: { source: string; target: string }[];
}

interface CopyFormatProps {
  config: TableConfig;
  bigTableFields: string[];
}

export const CopyFormat: React.FC<CopyFormatProps> = ({ config, bigTableFields }) => {
  const { selectedFolder, workspaceRoot } = useBigTableStore();
  const templateDir = selectedFolder ? `${workspaceRoot}/${selectedFolder}/.onworking/template` : '';
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [armedDelete, setArmedDelete] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 预填模板名:当前源文件名去扩展名
  useEffect(() => {
    setTemplateName(config.filePath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''));
  }, [config.filePath]);

  // 切换大表 → 刷新模板列表
  useEffect(() => {
    setTemplates([]);
    setSelected('');
    setArmedDelete(false);
    if (!templateDir) return;
    window.onworking.api.call('template.list', { dir: templateDir }).then(res => {
      if (res.success) setTemplates((res.data as TemplateDef[]) ?? []);
    });
  }, [templateDir]);

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(''), 4000);
  }, []);

  const refresh = useCallback(async () => {
    if (!templateDir) return;
    const res = await window.onworking.api.call('template.list', { dir: templateDir });
    if (res.success) setTemplates((res.data as TemplateDef[]) ?? []);
  }, [templateDir]);

  const saveTemplate = async () => {
    if (!templateDir) { showMessage(t('copyFormat.noBigTable')); return; }
    const name = templateName.trim();
    if (!name) { showMessage(t('copyFormat.nameRequired')); return; }
    const mappings = config.templateMappings();
    if (mappings.length === 0) { showMessage(t('copyFormat.nothingToSave')); return; }
    const res = await window.onworking.api.call('template.save', {
      dir: templateDir, name,
      mappings: mappings.map(([source, target]) => ({ source, target })),
    });
    if (!res.success) { showMessage(String(res.error ?? '')); return; }
    setSelected(name);
    await refresh();
    showMessage(t('copyFormat.saved', { name }));
  };

  const applyTemplate = async () => {
    if (!templateDir) { showMessage(t('copyFormat.noBigTable')); return; }
    if (!selected) { showMessage(t('copyFormat.selectPlaceholder')); return; }
    const def = templates.find(d => d.name === selected);
    if (!def) return;
    const mappings = def.mappings.map(m => [m.source, m.target] as [string, string]);
    const { matched, skipped } = config.applyTemplate(mappings, bigTableFields);
    showMessage(t('copyFormat.applied', { name: selected, matched: matched, total: matched + skipped }));
  };

  const handleDelete = async () => {
    if (!templateDir || !selected) return;
    if (!armedDelete) {
      setArmedDelete(true);
      setTimeout(() => setArmedDelete(false), 2500);
      return;
    }
    const res = await window.onworking.api.call('template.delete', { dir: templateDir, name: selected });
    if (res.success) {
      setSelected('');
      await refresh();
      showMessage('');
    }
    setArmedDelete(false);
  };

  const btnStyle: React.CSSProperties = {
    padding: '2px 10px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: 'pointer', fontSize: 12,
  };
  const primaryStyle: React.CSSProperties = { ...btnStyle, background: '#007acc', color: '#fff', borderColor: '#007acc' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee', fontSize: 12 }}>
      <span style={{ color: '#666' }}>{t('copyFormat.title')}</span>
      {!templateDir ? (
        <span style={{ color: '#999' }}>{t('copyFormat.noBigTable')}</span>
      ) : (
        <>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder={t('copyFormat.templateName')} style={{ width: 160, padding: '2px 6px', fontSize: 12 }} />
          <button onClick={saveTemplate} style={primaryStyle}>{t('copyFormat.saveTemplate')}</button>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={{ padding: '2px 6px', fontSize: 12, width: 150 }}>
            <option value="">{t('copyFormat.selectPlaceholder')}</option>
            {templates.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <button onClick={applyTemplate} disabled={!selected} style={btnStyle}>{t('copyFormat.applyTemplate')}</button>
          <button onClick={handleDelete} disabled={!selected} style={{ ...btnStyle, color: armedDelete ? '#d33' : 'inherit' }}>
            {armedDelete ? t('copyFormat.confirmDelete') : t('copyFormat.deleteTemplate')}
          </button>
          {message && <span style={{ color: '#007acc' }}>{message}</span>}
        </>
      )}
    </div>
  );
};
