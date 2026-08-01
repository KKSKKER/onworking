// onworking/src/renderer/components/StatusBar.tsx
import React from 'react';

interface StatusBarProps {
  status: string;
  fileCount: number;
  lastETL: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status, fileCount, lastETL }) => (
  <div style={{ padding: '2px 12px', borderTop: '1px solid #ddd', fontSize: 11,
    color: '#888', display: 'flex', gap: 16, background: '#fafafa' }}>
    <span>⚡ {status}</span>
    <span>source/ 下 {fileCount} 个文件</span>
    {lastETL && <span>最后 ETL: {lastETL}</span>}
  </div>
);
