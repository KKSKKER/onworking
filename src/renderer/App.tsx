import React, { useState } from 'react';
import { TopBar, ViewId } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { WorkspaceStart } from './components/WorkspaceStart';
import { View1Config } from './components/View1Config';
import { View2Preview } from './components/View2Preview';
import { View3Results } from './components/View3Results';

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
  const [selectedFile, setSelectedFile] = useState('');
  const [headerRow, setHeaderRow] = useState(3);
  const [etlResult, setETLResult] = useState<Record<string, unknown>>();

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <TopBar
        workspaceName={workspaceName}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeView === 'config' && (
          <View1Config onNavigatePreview={(file, hr) => {
            setSelectedFile(file);
            setHeaderRow(hr);
            setActiveView('preview');
          }} />
        )}
        {activeView === 'preview' && (
          <View2Preview
            filePath={selectedFile}
            headerRow={headerRow}
            onETLComplete={(result) => {
              setETLResult(result);
              setLastETL(new Date().toLocaleTimeString());
              setStatus('ETL 完成');
              setActiveView('results');
            }}
          />
        )}
        {activeView === 'results' && (
          <View3Results etlResult={etlResult} />
        )}
      </div>
      <StatusBar status={status} fileCount={fileCount} lastETL={lastETL} />
    </div>
  );
};
