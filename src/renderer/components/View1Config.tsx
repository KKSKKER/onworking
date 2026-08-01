// onworking/src/renderer/components/View1Config.tsx
import React, { useState } from 'react';
import { FileTree } from './FileTree';
import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';

interface View1ConfigProps {
  onNavigatePreview: (selectedFile: string, headerRow: number) => void;
}

export const View1Config: React.FC<View1ConfigProps> = ({ onNavigatePreview }) => {
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedRule, setSelectedRule] = useState('');
  const [headerRow, setHeaderRow] = useState(3);

  const handlePreview = () => {
    onNavigatePreview(selectedFile, headerRow);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30%', minWidth: 200, borderRight: '1px solid #ddd', overflow: 'auto', padding: 8 }}>
        <FileTree selectedFile={selectedFile} onSelectFile={setSelectedFile} />
        <RuleList selectedRuleName={selectedRule} onSelectRule={setSelectedRule} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <RuleEditor
          filePath={selectedFile}
          selectedRuleName={selectedRule}
          headerRow={headerRow}
          onHeaderRowChange={setHeaderRow}
          onPreview={handlePreview}
        />
      </div>
    </div>
  );
};
