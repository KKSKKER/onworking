import React, { useState, useRef, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ value, options, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = filter ? options.filter(o => o.toLowerCase().includes(filter.toLowerCase())) : options;

  const select = (opt: string) => {
    onChange(opt);
    setFilter('');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', fontSize: 11 }}>
      <input
        type="text"
        value={open ? filter : (value || '')}
        placeholder={placeholder || '选择字段...'}
        onChange={e => { setFilter(e.target.value); setOpen(true); }}
        onFocus={() => { setFilter(''); setOpen(true); }}
        style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 2, fontSize: 11, boxSizing: 'border-box' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 150, overflow: 'auto',
          background: 'white', border: '1px solid #ccc', borderRadius: 2, zIndex: 100, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '4px 8px', color: '#999' }}>无匹配字段</div>
          ) : (
            filtered.map(opt => (
              <div key={opt} onClick={() => select(opt)}
                style={{ padding: '3px 8px', cursor: 'pointer', background: opt === value ? '#e6f0ff' : 'transparent' }}>
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
