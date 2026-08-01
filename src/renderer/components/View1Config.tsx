// onworking/src/renderer/components/View1Config.tsx
import React, { useState } from 'react';
import { FileTree } from './FileTree';
import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';

interface View1ConfigProps {
  onNavigatePreview: (selectedFile: string) => void;
}

export const View1Config: React.FC<View1ConfigProps> = ({ onNavigatePreview }) => {
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedRule, setSelectedRule] = useState('');

  const handlePreview = () => {
    onNavigatePreview(selectedFile);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30%', minWidth: 200, borderRight: '1px solid #ddd', overflow: 'auto', padding: 8 }}>
        <FileTree selectedFile={selectedFile} onSelectFile={setSelectedFile} />
        <RuleList selectedRuleName={selectedRule} onSelectRule={setSelectedRule} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <RuleEditor filePath={selectedFile} onPreview={handlePreview} />
      </div>
    </div>
  );
};
