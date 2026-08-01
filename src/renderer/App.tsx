import React, { useEffect, useState } from 'react';

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
    setPlatform(window.onworking.platform);
    window.onworking.api.call('api:list').then(res => {
      if (res.success) setCommands(res.data as string[]);
      else setError(res.error ?? 'IPC 调用失败');
    });
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>OnWorking</h1>
      <p>AI 数据工作的透明执行框架 v0.1.0</p>
      <p>平台: {platform} | IPC 通信: {error ? <span style={{color:'red'}}>{error}</span> : <span style={{color:'green'}}>✅</span>}</p>
      <hr />
      <h2>已注册 API ({commands.length})</h2>
      <ul>
        {commands.map(cmd => (
          <li key={cmd}><code>{cmd}</code></li>
        ))}
      </ul>
    </div>
  );
};
