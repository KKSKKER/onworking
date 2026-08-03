import React, { useState } from 'react';
import { useBigTableStore, useBigTable } from '../state/BigTableStore';
import { triggerMenu } from '../context-menu/ContextMenuHost';

interface FolderTreeProps {
  onSelectFile: (filePath: string) => void;
  selectedFile: string;
  onOpenSettings: (folderName: string) => void;
  onPreviewFile?: (filePath: string) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({ onSelectFile, selectedFile, onOpenSettings, onPreviewFile }) => {
  const { folders, workspaceRoot, selectedFolder, selectFolder, createFolder, getBigTable, scanFolders } = useBigTableStore();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [renamingPath, setRenamingPath] = useState('');
  const [renameValue, setRenameValue] = useState('');

  useBigTable(selectedFolder);

  const toggleExpand = (name: string): void => {
    const next = new Set(expandedFolders);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExpandedFolders(next);
  };

  const handleSelectFolder = async (name: string): Promise<void> => { await selectFolder(name); toggleExpand(name); };
  const handleCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    await createFolder(newName.trim());
    setNewName(''); setShowNew(false);
  };

  const runPaste = async (dir: string): Promise<void> => {
    const clip = (await import('../state/FileClipboard')).FileClipboard.get();
    if (!clip) return;
    let res = await window.onworking.api.call('etl.copyFile', { sourcePath: clip.sourcePath, destDir: dir, overwrite: false });
    if (res.success && (res.data as { conflict?: boolean }).conflict) {
      const ok = await window.onworking.confirm({ title: '文件已存在', message: '目标已有同名文件,是否覆盖?', okLabel: '覆盖' });
      if (!ok) return;
      res = await window.onworking.api.call('etl.copyFile', { sourcePath: clip.sourcePath, destDir: dir, overwrite: true });
    }
    if (!res.success) console.error('[FolderTree] paste failed:', res.error);
    await scanFolders();
  };

  const runDelete = async (targetPath: string, isFolder: boolean): Promise<void> => {
    const ok = await window.onworking.confirm({
      title: '确认删除', message: isFolder ? '删除该大表将同时删除其数据,确定?' : '确定删除该文件?', okLabel: '删除',
    });
    if (!ok) return;
    const cmd = isFolder ? 'workspace.deleteFolder' : 'etl.deleteFile';
    const res = await window.onworking.api.call(cmd, { path: targetPath });
    if (res.success) await scanFolders();
  };

  const startRename = (oldPath: string): void => { setRenamingPath(oldPath); setRenameValue(oldPath.replace(/^.*[\\/]/, '')); };
  const commitRename = async (oldPath: string): Promise<void> => {
    const name = renameValue.trim(); setRenamingPath('');
    if (!name) return;
    const res = await window.onworking.api.call('etl.renameFile', { path: oldPath, newName: name });
    if (!res.success) { console.error('[FolderTree] rename failed:', res.error); return; }
    await scanFolders();
  };

  const onFolderMenu = (name: string, folderPath: string, e: React.MouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    triggerMenu('folder', { name, folderPath }, e.clientX, e.clientY, {
      onOpenSettings: (n) => onOpenSettings(String(n)),
      onMerge: async (fp) => {
        const res = await window.onworking.api.call('etl.mergeFolder', { folderPath: String(fp) });
        if (!res.success) console.error('[FolderTree] merge failed:', res.error);
        await scanFolders();
      },
      onPaste: (dir) => { void runPaste(String(dir)); },
      onDeleteFolder: (fp) => { void runDelete(String(fp), true); },
    });
  };

  const onFileMenu = (path: string, folderPath: string, e: React.MouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    triggerMenu('folder-file', { path, folderPath }, e.clientX, e.clientY, {
      onPreview: (p) => { void selectFolder(selectedFolder); onPreviewFile?.(String(p)); },
      onRenameStart: (p) => startRename(String(p)),
      onPaste: (dir) => { void runPaste(String(dir)); },
      onDelete: (p) => { void runDelete(String(p), false); },
    });
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
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
            placeholder="大表名称" style={{ flex: 1, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 2 }} autoFocus />
          <button onClick={() => void handleCreate()} style={{ padding: '2px 6px', fontSize: 11 }}>确定</button>
        </div>
      )}

      {folders.length === 0 ? (
        <div style={{ padding: 8, color: '#999' }}>暂无大表,点击 + 新建</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {folders.map(name => {
            const folderPath = workspaceRoot + '/' + name;
            const expanded = expandedFolders.has(name);
            const bt = getBigTable(name);
            return (
              <li key={name}>
                <div
                  onContextMenu={e => onFolderMenu(name, folderPath, e)}
                  onClick={() => { void handleSelectFolder(name); }}
                  style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer',
                    background: selectedFolder === name ? '#e6f0ff' : 'transparent' }}>
                  <span onClick={e => { e.stopPropagation(); toggleExpand(name); }}
                    style={{ marginRight: 4, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
                  {renamingPath === folderPath ? (
                    <input value={renameValue} autoFocus onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') void commitRename(folderPath); if (e.key === 'Escape') setRenamingPath(''); }}
                      style={{ flex: 1, fontSize: 11, padding: '1px 4px' }} />
                  ) : (
                    <span style={{ flex: 1 }}>📁 {name}</span>
                  )}
                  <span onClick={e => { e.stopPropagation(); onOpenSettings(name); }}
                    style={{ fontSize: 12, cursor: 'pointer' }} title="大表设置">⚙</span>
                </div>
                {expanded && bt && (
                  <ul style={{ listStyle: 'none', padding: '0 0 0 20px', margin: 0 }}>
                    {bt.sourceFiles.map(f => (
                      <li key={f}
                        onContextMenu={e => onFileMenu(f, folderPath, e)}
                        onClick={(e) => { e.stopPropagation(); void selectFolder(name); onSelectFile(f); }}
                        style={{ padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                          background: f === selectedFile ? '#e6f0ff' : 'transparent' }}>
                        {renamingPath === f ? (
                          <input value={renameValue} autoFocus onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') void commitRename(f); if (e.key === 'Escape') setRenamingPath(''); }}
                            style={{ width: '100%', fontSize: 11, padding: '1px 4px' }} />
                        ) : (
                          <>📄 {f.replace(/^.*[\\/]/, '')}</>
                        )}
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
