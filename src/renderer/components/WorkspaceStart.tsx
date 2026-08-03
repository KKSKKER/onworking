// onworking/src/renderer/components/WorkspaceStart.tsx
import React, { useEffect, useState } from 'react';
import { openWorkspace, openWorkspacePath } from '../api/openWorkspace';

interface WorkspaceMeta { rootPath: string; name: string; openedAt: string; }
interface WorkspaceStartProps { onWorkspaceReady: (info: Record<string, unknown>) => void; }

export const WorkspaceStart: React.FC<WorkspaceStartProps> = ({ onWorkspaceReady }) => {
  const [recent, setRecent] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.onworking.api.call('workspace.listRecent').then(res => {
      if (res.success) setRecent(res.data as WorkspaceMeta[]);
      else setError(res.error ?? 'Failed');
      setLoading(false);
    }).catch(e => { setError((e as Error).message); setLoading(false); });
  }, []);

  const handleOpen = async () => {
    setLoading(true); setError('');
    try {
      const info = await openWorkspace();
      if (info) onWorkspaceReady(info as unknown as Record<string, unknown>);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };

  const handleOpenPath = async (rootPath: string) => {
    setLoading(true); setError('');
    try {
      onWorkspaceReady((await openWorkspacePath(rootPath)) as unknown as Record<string, unknown>);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
      <h1 style={{ marginBottom: 8 }}>OnWorking</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>AI 数据工作的透明执行框架</p>
      {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
      <div style={{ background: 'white', borderRadius: 8, padding: 24, minWidth: 400,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0 }}>最近工作区</h3>
        {recent.length === 0 ? <p style={{ color: '#999' }}>暂无工作区</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map(ws => (
              <li key={ws.rootPath} onClick={() => handleOpenPath(ws.rootPath)}
                style={{ padding: '8px 0', borderBottom: '1px solid #eee', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between' }}>
                <span>{ws.name}</span>
                <span style={{ color: '#aaa', fontSize: 12 }}>{ws.rootPath}</span>
              </li>
            ))}
          </ul>
        )}
        <button onClick={handleOpen} style={{ marginTop: 16, width: '100%', padding: '10px',
          background: '#007acc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
          打开工作区…
        </button>
      </div>
    </div>
  );
};
