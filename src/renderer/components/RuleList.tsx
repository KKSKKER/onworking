import React, { useEffect, useState } from 'react';
import { triggerMenu } from '../context-menu/ContextMenuHost';
import { matchGlob } from '../../common/utils/glob';
import { useTableConfigStore } from '../state/TableConfigStore';

interface RuleSummary { name: string; display: string; }

export const RuleList: React.FC = () => {
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const { selectFile, selectSheet } = useTableConfigStore();

  const refresh = async (): Promise<void> => {
    const res = await window.onworking.api.call('rule.list');
    if (res.success) setRules(res.data as RuleSummary[]);
  };

  useEffect(() => { void refresh(); }, []);

  /** 由规则 pattern 定位其源文件与 sheet,加载进 RuleEditor。 */
  const editRule = async (name: string): Promise<void> => {
    const getRes = await window.onworking.api.call('rule.get', { name });
    if (!getRes.success) { console.error('[RuleList] rule.get failed:', getRes.error); return; }
    const rule = getRes.data as { sources?: { pattern?: string; sheetIndex?: number }[] };
    const src = rule.sources?.[0];
    if (!src?.pattern) return;
    const scanRes = await window.onworking.api.call('etl.scan');
    const files = (scanRes.data as { path: string; name: string }[] ?? []);
    const file = files.find(f => matchGlob(f.name.replace(/\\/g, '/'), src.pattern!));
    if (!file) { console.error('[RuleList] no file matches rule pattern:', src.pattern); return; }
    await selectFile(file.path);
    selectSheet(src.sheetIndex ?? 0);
  };

  const deleteRule = async (name: string): Promise<void> => {
    const ok = await window.onworking.confirm({ title: '确认删除', message: `确定删除规则 ${name}?`, okLabel: '删除' });
    if (!ok) return;
    const res = await window.onworking.api.call('rule.delete', { name });
    if (res.success) await refresh();
  };

  const onMenu = (rule: RuleSummary, e: React.MouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    triggerMenu('rule', { name: rule.name, display: rule.display }, e.clientX, e.clientY, {
      onEditRule: (n) => { void editRule(String(n)); },
      onDeleteRule: (n) => { void deleteRule(String(n)); },
    });
  };

  return (
    <div style={{ fontSize: 12, marginTop: 16 }}>
      <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <span>📋 规则</span>
        <button onClick={() => { void refresh(); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🔄</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rules.map(r => (
          <li key={r.name} onContextMenu={e => onMenu(r, e)}
            onClick={() => { void editRule(r.name); }}
            style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
            {r.display || r.name}
          </li>
        ))}
      </ul>
    </div>
  );
};
