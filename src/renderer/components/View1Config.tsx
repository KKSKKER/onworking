import React, { useState } from 'react';
// import { FileTree } from './FileTree';
import { FolderTree } from './FolderTree';
// import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';
import { BigTableSettings } from './BigTableSettings';
import { ResizableSidebar } from './ResizableSidebar';
import { useTableConfigStore } from '../state/TableConfigStore';

interface View1ConfigProps { onPreview: () => void; }

export const View1Config: React.FC<View1ConfigProps> = ({ onPreview }) => {
  const { selectedFile, selectFile } = useTableConfigStore();
  const [settingsFolder, setSettingsFolder] = useState('');

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ResizableSidebar initialWidth={380} minWidth={220} contentStyle={{ padding: 8, borderRight: '1px solid #ddd' }}>
        {/* <FileTree selectedFile={selectedFile} onSelectFile={f => { selectFile(f).catch(console.error); }} onPreviewFile={f => { selectFile(f).then(() => onPreview()).catch(console.error); }} /> */}
        <div style={{ borderTop: '1px solid #eee', marginTop: 8, paddingTop: 8 }}>
          <FolderTree selectedFile={selectedFile} onSelectFile={f => { selectFile(f).catch(console.error); }}
            onPreviewFile={f => { selectFile(f).then(() => onPreview()).catch(console.error); }}
            onOpenSettings={setSettingsFolder} />
        </div>
        <div style={{ borderTop: '1px solid #eee', marginTop: 8, paddingTop: 8 }}>
          {/* <RuleList /> */}
        </div>
      </ResizableSidebar>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {settingsFolder ? (
          <BigTableSettings folderName={settingsFolder} onClose={() => setSettingsFolder('')} />
        ) : (
          <RuleEditor filePath={selectedFile} onPreview={onPreview} />
        )}
      </div>
    </div>
  );
};
