import React, { useState } from 'react';
import { TopBar, ViewId } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { WorkspaceStart } from './components/WorkspaceStart';
import { View1Config } from './components/View1Config';
import { View2Preview } from './components/View2Preview';
import { View3Results } from './components/View3Results';
import { View4Sql } from './components/View4Sql';
import { useTableConfigStore } from './state/TableConfigStore';
import { BigTableStoreProvider } from './state/BigTableStore';

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
  const [workspace, setWorkspace] = useState<Record<string, unknown> | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('config');
  const [status, setStatus] = useState('就绪');
  const [fileCount, setFileCount] = useState(0);
  const [lastETL, setLastETL] = useState('');
  const [etlResult, setETLResult] = useState<Record<string, unknown>>();
  const { selectedFile } = useTableConfigStore();

  React.useEffect(() => {
    if (!workspace) return;
    window.onworking.api.call('etl.scan').then(res => {
      if (res.success) setFileCount((res.data as unknown[]).length);
    });
  }, [workspace]);

  if (!workspace) {
    return <WorkspaceStart onWorkspaceReady={setWorkspace} />;
  }

  const workspaceName = (workspace.name as string) ?? (workspace.root as string ?? '').replace(/^.*[\\/]/, '');

  return (
    <BigTableStoreProvider workspaceRoot={String(workspace.root ?? '')}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <TopBar
          workspaceName={workspaceName}
          activeView={activeView}
          onViewChange={setActiveView}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {/* 四个视图常驻挂载、display 切换显隐 —— 切换视图不卸载,状态不丢失。
              display:block 让视图根元素撑满容器宽度;flex 会让其按内容扩张,宽表格时整个视图超出窗口、被外层裁掉,结果区无横向滚动条 */}
          <div style={{ height: '100%', display: activeView === 'config' ? 'block' : 'none' }}>
            <View1Config onPreview={() => setActiveView('preview')} />
          </div>
          <div style={{ height: '100%', display: activeView === 'preview' ? 'block' : 'none' }}>
            <View2Preview filePath={selectedFile} active={activeView === 'preview'} />
          </div>
          <div style={{ height: '100%', display: activeView === 'results' ? 'block' : 'none' }}>
            <View3Results />
          </div>
          <div style={{ height: '100%', display: activeView === 'sql' ? 'block' : 'none' }}>
            <View4Sql />
          </div>
        </div>
        <StatusBar status={status} fileCount={fileCount} lastETL={lastETL} />
      </div>
    </BigTableStoreProvider>
  );
};
