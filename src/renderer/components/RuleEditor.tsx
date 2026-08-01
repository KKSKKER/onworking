// onworking/src/renderer/components/RuleEditor.tsx
import React, { useEffect, useState } from 'react';

interface FieldInfo {
  sourceHeader: string;
  outputName: string;
  included: boolean;
  order: number;
  typeGuess?: string;
}

interface RuleEditorProps {
  filePath: string;
  selectedRuleName: string;
  onPreview: () => void;
  headerRow: number;
  onHeaderRowChange: (hr: number) => void;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({ filePath, selectedRuleName, onPreview, headerRow, onHeaderRowChange }) => {
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [ruleName, setRuleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load rule when user selects one from RuleList
  useEffect(() => {
    if (!selectedRuleName) return;
    (async () => {
      const res = await window.onworking.api.call('rule.get', { name: selectedRuleName });
      if (res.success) {
        const rule = res.data as Record<string, unknown>;
        setRuleName(rule.name as string);
        setFields((rule.fields as FieldInfo[]).map(f => ({ ...f, typeGuess: 'string' })));
        onHeaderRowChange(((rule.sources as { headerRow: number }[])[0]?.headerRow) ?? 3);
        setSaved(true);
      }
    })();
  }, [selectedRuleName]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoDetect = async () => {
    setLoading(true);
    setSaved(false);
    const res = await window.onworking.api.call('rule.autoGenerate', { file: filePath });
    if (res.success) {
      const data = res.data as { rule: { name: string; fields: FieldInfo[]; sources: { headerRow: number }[] } };
      setRuleName(data.rule.name);
      setFields(data.rule.fields.map(f => ({ ...f, typeGuess: 'string' })));
      onHeaderRowChange(data.rule.sources[0]?.headerRow ?? 3);
    }
    setLoading(false);
  };

  const toggleField = (idx: number) => {
    const next = [...fields];
    next[idx] = { ...next[idx], included: !next[idx].included };
    setFields(next);
    setSaved(false);
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((f, i) => { f.order = i + 1; });
    setFields(next);
    setSaved(false);
  };

  const saveRule = async () => {
    const repoName = filePath.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    const name = ruleName || `rule_${repoName}`;
    const rule = {
      name,
      display: `提取规则: ${filePath.replace(/^.*[\\/]/, '')}`,
      version: 1,
      sources: [{ pattern: '**/*.{xls,xlsx,csv}', headerRow }],
      fields: fields.map((f, i) => ({
        sourceHeader: f.sourceHeader,
        outputName: f.outputName || f.sourceHeader,
        included: f.included,
        order: i + 1,
        transforms: [{ kind: 'coerce_string' as const, trim: true, aiRationale: 'Default string coercion' }],
      })),
      mergeStrategy: { mode: 'append' as const },
    };
    await window.onworking.api.call('rule.save', rule as unknown as Record<string, unknown>);
    setSaved(true);
    setRuleName(name);
  };

  return (
    <div style={{ fontSize: 12, padding: 8 }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={autoDetect} disabled={loading}
          style={{ padding: '4px 12px', background: '#007acc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          {loading ? '检测中...' : '🔍 自动检测字段'}
        </button>
        <span>表头行: <input type="number" value={headerRow} onChange={e => onHeaderRowChange(Number(e.target.value))}
          style={{ width: 50, padding: '2px 4px' }} /></span>
      </div>

      {fields.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: 4 }}>☑</th>
                <th style={{ padding: 4 }}>字段名</th>
                <th style={{ padding: 4 }}>类型</th>
                <th style={{ padding: 4 }}>排序</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', opacity: f.included ? 1 : 0.4 }}>
                  <td style={{ padding: 4 }}>
                    <input type="checkbox" checked={f.included} onChange={() => toggleField(i)} />
                  </td>
                  <td style={{ padding: 4 }}>{f.sourceHeader}</td>
                  <td style={{ padding: 4 }}>
                    <select value={f.typeGuess} onChange={e => {
                      const next = [...fields];
                      next[i] = { ...next[i], typeGuess: e.target.value };
                      setFields(next);
                    }} style={{ fontSize: 11 }}>
                      <option value="string">文本</option>
                      <option value="cents">金额(分)</option>
                      <option value="number">数字</option>
                      <option value="date">日期</option>
                    </select>
                  </td>
                  <td style={{ padding: 4 }}>
                    <button onClick={() => moveField(i, -1)} disabled={i === 0}
                      style={{ border: 'none', cursor: 'pointer' }}>▲</button>
                    <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                      style={{ border: 'none', cursor: 'pointer' }}>▼</button>
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
