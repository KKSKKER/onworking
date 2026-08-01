// onworking/src/renderer/components/View1Config.tsx
import React from 'react';
import { FileTree } from './FileTree';
import { RuleEditor } from './RuleEditor';
import { useTableConfigStore } from '../state/TableConfigStore';

interface View1ConfigProps {
  onPreview: () => void;
}

export const View1Config: React.FC<View1ConfigProps> = ({ onPreview }) => {
  const { selectedFile, selectFile } = useTableConfigStore();

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30%', minWidth: 200, borderRight: '1px solid #ddd', overflow: 'auto', padding: 8 }}>
        <FileTree selectedFile={selectedFile} onSelectFile={selectFile} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <RuleEditor filePath={selectedFile} onPreview={onPreview} />
      </div>
    </div>
  );
};
