// onworking/src/renderer/components/WorkspaceStart.tsx
import React, { useEffect, useState } from 'react';

interface WorkspaceMeta {
  rootPath: string;
  name: string;
  openedAt: string;
}

interface WorkspaceStartProps {
  onWorkspaceReady: (info: Record<string, unknown>) => void;
}

export const WorkspaceStart: React.FC<WorkspaceStartProps> = ({ onWorkspaceReady }) => {
  const [recent, setRecent] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    window.onworking.api.call('workspace.listRecent').then(res => {
      if (res.success) setRecent(res.data as WorkspaceMeta[]);
      else setError(res.error ?? 'Failed');
      setLoading(false);
    }).catch(e => {
      console.error('[WorkspaceStart] listRecent error:', e);
      setError((e as Error).message);
      setLoading(false);
    });
  }, []);

  const openWorkspace = async (rootPath: string) => {
    setLoading(true);
    setError('');
    const res = await window.onworking.api.call('workspace.open', { rootPath });
    if (res.success) onWorkspaceReady(res.data as Record<string, unknown>);
    else setError(res.error ?? 'Failed');
    setLoading(false);
  };

  const createWorkspace = async () => {
    const rootPath = newPath.trim();
    if (!rootPath) { setError('请输入工作区路径'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await window.onworking.api.call('workspace.create', { rootPath });
      console.log('[WorkspaceStart] workspace.create result:', res);
      if (res.success) {
        onWorkspaceReady(res.data as Record<string, unknown>);
      } else {
        setError(res.error ?? '创建失败');
        setLoading(false);
      }
    } catch (e) {
      console.error('[WorkspaceStart] createWorkspace error:', e);
      setError((e as Error).message);
      setLoading(false);
    }
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
        {recent.length === 0 ? (
          <p style={{ color: '#999' }}>暂无工作区</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {recent.map(ws => (
              <li key={ws.rootPath} style={{ padding: '8px 0', borderBottom: '1px solid #eee', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between' }}
                onClick={() => openWorkspace(ws.rootPath)}>
                <span>{ws.name}</span>
                <span style={{ color: '#aaa', fontSize: 12 }}>{ws.rootPath}</span>
              </li>
            ))}
          </ul>
        )}

        {showCreate ? (
          <div style={{ marginTop: 16 }}>
            <input
              type="text"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createWorkspace(); }}
              placeholder="D:\审计项目\良诚审计"
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={createWorkspace}
                style={{ flex: 1, padding: '8px', background: '#007acc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                确认创建
              </button>
              <button onClick={() => { setShowCreate(false); setError(''); }}
                style={{ padding: '8px 16px', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)} style={{ marginTop: 16, width: '100%', padding: '10px',
            background: '#007acc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
            + 新建工作区
          </button>
        )}
      </div>
    </div>
  );
};
