// onworking/src/renderer/components/RuleList.tsx
import React, { useEffect, useState } from 'react';

interface RuleSummary {
  name: string;
  display: string;
}

interface RuleListProps {
  onSelectRule?: (ruleName: string) => void;
  selectedRuleName?: string;
}

export const RuleList: React.FC<RuleListProps> = ({ onSelectRule, selectedRuleName }) => {
  const [rules, setRules] = useState<RuleSummary[]>([]);

  const refresh = async () => {
    const res = await window.onworking.api.call('rule.list');
    if (res.success) setRules(res.data as RuleSummary[]);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ fontSize: 12, marginTop: 16 }}>
      <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between' }}>
        <span>📋 规则</span>
        <button onClick={refresh} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🔄</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rules.map(r => (
          <li key={r.name} onClick={() => onSelectRule?.(r.name)}
            style={{ padding: '4px 8px', cursor: 'pointer',
              background: r.name === selectedRuleName ? '#e6f0ff' : 'transparent',
              borderBottom: '1px solid #f0f0f0' }}>
            {r.display || r.name}
          </li>
        ))}
      </ul>
    </div>
  );
};
