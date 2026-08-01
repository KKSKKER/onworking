import React, { useState } from 'react';
import { useBigTableStore, useBigTable } from '../state/BigTableStore';

interface FolderTreeProps {
  onSelectFile: (filePath: string) => void;
  selectedFile: string;
  onOpenSettings: (folderName: string) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({ onSelectFile, selectedFile, onOpenSettings }) => {
  const { folders, selectedFolder, selectFolder, createFolder, getBigTable } = useBigTableStore();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  // Subscribes this component to revision changes so the tree re-renders after load/create.
  const bigTable = useBigTable(selectedFolder);

  const toggleExpand = (name: string) => {
    const next = new Set(expandedFolders);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExpandedFolders(next);
  };

  const handleSelectFolder = async (name: string) => {
    await selectFolder(name);
    toggleExpand(name);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createFolder(newName.trim());
    setNewName('');
    setShowNew(false);
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <span>📁 大表</span>
        <button onClick={() => setShowNew(!showNew)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>+</button>
      </div>

      {showNew && (
        <div style={{ padding: '4px 8px', display: 'flex', gap: 4 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="大表名称" style={{ flex: 1, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 2 }} autoFocus />
          <button onClick={handleCreate} style={{ padding: '2px 6px', fontSize: 11 }}>确定</button>
        </div>
      )}

      {folders.length === 0 ? (
        <div style={{ padding: 8, color: '#999' }}>暂无大表，点击 + 新建</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {folders.map(name => {
            const expanded = expandedFolders.has(name);
            const bt = getBigTable(name);
            return (
              <li key={name}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer',
                  background: selectedFolder === name ? '#e6f0ff' : 'transparent' }}
                  onClick={() => handleSelectFolder(name)}>
                  <span onClick={e => { e.stopPropagation(); toggleExpand(name); }}
                    style={{ marginRight: 4, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
                  <span style={{ flex: 1 }}>📁 {name}</span>
                  <span onClick={e => { e.stopPropagation(); onOpenSettings(name); }}
                    style={{ fontSize: 12, cursor: 'pointer' }} title="大表设置">⚙</span>
                </div>
                {expanded && bt && (
                  <ul style={{ listStyle: 'none', padding: '0 0 0 20px', margin: 0 }}>
                    {bt.sourceFiles.map(f => (
                      <li key={f} onClick={(e) => { e.stopPropagation(); onSelectFile(f); }}
                        style={{ padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                          background: f === selectedFile ? '#e6f0ff' : 'transparent' }}>
                        📄 {f.replace(/^.*[\\/]/, '')}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
