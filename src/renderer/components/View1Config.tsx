// onworking/src/renderer/components/View1Config.tsx
import React from 'react';
import { FileTree } from './FileTree';
import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';
import { useTableConfigStore } from '../state/TableConfigStore';

interface View1ConfigProps {
  onPreview: () => void;
}

export const View1Config: React.FC<View1ConfigProps> = ({ onPreview }) => {
  const { selectedFile, selectedRule, selectFile, selectRule } = useTableConfigStore();

  const handlePreview = () => {
    onPreview();
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30%', minWidth: 200, borderRight: '1px solid #ddd', overflow: 'auto', padding: 8 }}>
        <FileTree selectedFile={selectedFile} onSelectFile={selectFile} />
        <RuleList selectedRuleName={selectedRule} onSelectRule={selectRule} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <RuleEditor filePath={selectedFile} onPreview={handlePreview} />
      </div>
    </div>
  );
};
