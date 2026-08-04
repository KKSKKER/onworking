import React, { useEffect, useState } from 'react';
import { triggerMenu } from '../context-menu/ContextMenuHost';
import { FileClipboard } from '../state/FileClipboard';
import { t } from '../../common/i18n';

interface FileEntry { path: string; name: string; size: number; }
interface FileTreeProps {
  onSelectFile: (filePath: string) => void;
  selectedFile: string;
  onPreviewFile?: (filePath: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ onSelectFile, selectedFile, onPreviewFile }) => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingPath, setRenamingPath] = useState('');
  const [renameValue, setRenameValue] = useState('');

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const res = await window.onworking.api.call('etl.scan');
    if (res.success) setFiles(res.data as FileEntry[]);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const dirOf = (p: string): string => p.replace(/[\\/][^\\/]*$/, '');

  const runPaste = async (dir: string): Promise<void> => {
    const clip = FileClipboard.get();
    if (!clip) return;
    let res = await window.onworking.api.call('etl.copyFile', { sourcePath: clip.sourcePath, destDir: dir, overwrite: false });
    if (res.success && (res.data as { conflict?: boolean }).conflict) {
      const ok = await window.onworking.confirm({ title: t('common.fileExists'), message: t('common.overwritePrompt'), okLabel: t('common.overwrite') });
      if (!ok) return;
      res = await window.onworking.api.call('etl.copyFile', { sourcePath: clip.sourcePath, destDir: dir, overwrite: true });
    }
    if (!res.success) console.error('[FileTree] paste failed:', res.error);
    await refresh();
  };

  const runDelete = async (p: string): Promise<void> => {
    const ok = await window.onworking.confirm({ title: t('common.confirmDelete'), message: t('common.deleteFileConfirm'), okLabel: t('common.delete') });
    if (!ok) return;
    const res = await window.onworking.api.call('etl.deleteFile', { path: p });
    if (res.success) await refresh();
  };

  const startRename = (p: string): void => { setRenamingPath(p); setRenameValue(p.replace(/^.*[\\/]/, '')); };
  const commitRename = async (p: string): Promise<void> => {
    const name = renameValue.trim(); setRenamingPath('');
    if (!name) return;
    const res = await window.onworking.api.call('etl.renameFile', { path: p, newName: name });
    if (!res.success) { console.error('[FileTree] rename failed:', res.error); return; }
    await refresh();
  };

  const onMenu = (path: string, e: React.MouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    triggerMenu('file', { path }, e.clientX, e.clientY, {
      onPreview: (p) => onPreviewFile?.(String(p)),
      onRenameStart: (p) => startRename(String(p)),
      onPaste: (dir) => { void runPaste(String(dir)); },
      onDelete: (p) => { void runDelete(String(p)); },
    });
  };

  if (loading) return <div style={{ padding: 8, fontSize: 12, color: '#999' }}>{t('fileTree.scanning')}</div>;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <span>{t('fileTree.sourceFiles')}</span>
        <button onClick={() => { void refresh(); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🔄</button>
      </div>
      {files.length === 0 ? (
        <div style={{ padding: 8, color: '#999' }}>{t('fileTree.empty')}</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map(f => (
            <li key={f.path} onContextMenu={e => onMenu(f.path, e)} onClick={() => onSelectFile(f.path)}
              style={{ padding: '4px 8px', cursor: 'pointer',
                background: f.path === selectedFile ? '#e6f0ff' : 'transparent',
                borderBottom: '1px solid #f0f0f0' }}>
              {renamingPath === f.path ? (
                <input value={renameValue} autoFocus onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') void commitRename(f.path); if (e.key === 'Escape') setRenamingPath(''); }}
                  style={{ width: '100%', fontSize: 12, padding: '1px 4px' }} />
              ) : (
                <>
                  📄 {f.name}
                  <div style={{ fontSize: 10, color: '#aaa' }}>{dirOf(f.path)}</div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
