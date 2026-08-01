// onworking/src/renderer/components/TopBar.tsx
import React from 'react';

export type ViewId = 'config' | 'preview' | 'results';

interface TopBarProps {
  workspaceName: string;
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

const TABS: { id: ViewId; label: string }[] = [
  { id: 'config', label: 'View1 配置' },
  { id: 'preview', label: 'View2 预览' },
  { id: 'results', label: 'View3 结果' },
];

export const TopBar: React.FC<TopBarProps> = ({ workspaceName, activeView, onViewChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px',
    borderBottom: '1px solid #ddd', background: '#fafafa', gap: 16 }}>
    <strong style={{ fontSize: 13 }}>OnWorking</strong>
    <span style={{ color: '#666', fontSize: 12 }}>[{workspaceName}]</span>
    <div style={{ display: 'flex', gap: 0, marginLeft: 24 }}>
      {TABS.map(tab => (
        <button key={tab.id} onClick={() => onViewChange(tab.id)}
          style={{ padding: '4px 16px', border: 'none', cursor: 'pointer',
            background: activeView === tab.id ? '#007acc' : 'transparent',
            color: activeView === tab.id ? 'white' : '#333',
            borderRadius: 3, fontSize: 12, fontWeight: activeView === tab.id ? 600 : 400 }}>
          {tab.label}
        </button>
      ))}
    </div>
  </div>
);
