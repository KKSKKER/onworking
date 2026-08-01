import React, { useState } from 'react';

interface FormulaBarProps {
  onEvaluate: (formula: string) => Promise<string>;
}

export const FormulaBar: React.FC<FormulaBarProps> = ({ onEvaluate }) => {
  const [formula, setFormula] = useState('');
  const [result, setResult] = useState('');

  const handleEvaluate = async () => {
    const match = formula.trim().match(/^=ENTITY\("(\w+)",\s*"(\w+)"(?:,\s*"(\w+)",\s*"([^"]+)")?\)$/);
    if (!match) {
      setResult('Invalid ENTITY() syntax');
      return;
    }
    const val = await onEvaluate(formula.trim());
    setResult(val);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid #ddd', gap: 8, fontSize: 13 }}>
      <span style={{ fontWeight: 600, minWidth: 24 }}>fx</span>
      <input
        type="text"
        value={formula}
        onChange={e => setFormula(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleEvaluate(); }}
        placeholder='=ENTITY("account", "balance", "code", "1001")'
        style={{ flex: 1, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 3, fontFamily: 'monospace' }}
      />
      <button onClick={handleEvaluate} style={{ padding: '2px 12px' }}>执行</button>
      {result && <span style={{ color: '#666', fontSize: 12 }}>→ {result}</span>}
    </div>
  );
};
