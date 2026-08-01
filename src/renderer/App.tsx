import React, { useEffect, useState } from 'react';
import { UniverSheet } from './components/UniverSheet';

declare global {
  interface Window {
    onworking: {
      platform: string;
      api: {
        call(command: string, params?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
    };
  }
}

export const App: React.FC = () => {
  const [commands, setCommands] = useState<string[]>([]);
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const api = window.onworking;
    if (!api) {
      setError('Preload 未加载');
      return;
    }
    setPlatform(api.platform);
    api.api.call('api:list').then(res => {
      if (res.success) setCommands(res.data as string[]);
      else setError(res.error ?? 'IPC error');
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #ddd', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
        <strong>OnWorking v0.1.0</strong>
        <span>平台: {platform}</span>
        <span>IPC: {error ? <span style={{color:'red'}}>{error}</span> : <span style={{color:'green'}}>✅</span>}</span>
        <span>API: {commands.length} 命令</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <UniverSheet />
      </div>
    </div>
  );
};
