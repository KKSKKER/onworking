import React, { useState } from 'react';
import { FolderTree } from './FolderTree';
import { RuleEditor } from './RuleEditor';
import { BigTableSettings } from './BigTableSettings';
import { ResizableSidebar } from './ResizableSidebar';
import { useTableConfigStore } from '../state/TableConfigStore';

interface View1ConfigProps {
  onPreview: () => void;
}

export const View1Config: React.FC<View1ConfigProps> = ({ onPreview }) => {
  const { selectedFile, selectFile } = useTableConfigStore();
  const [settingsFolder, setSettingsFolder] = useState('');

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ResizableSidebar initialWidth={380} minWidth={220} contentStyle={{ padding: 8, borderRight: '1px solid #ddd' }}>
        <FolderTree selectedFile={selectedFile} onSelectFile={f => { selectFile(f).catch(console.error); }} onOpenSettings={setSettingsFolder} />
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
