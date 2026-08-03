// onworking/src/renderer/components/FileTree.tsx
import React, { useEffect, useState } from 'react';

interface FileEntry {
  path: string;
  name: string;
  size: number;
}

interface FileTreeProps {
  onSelectFile: (filePath: string) => void;
  selectedFile: string;
  onPreviewFile?: (filePath: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ onSelectFile, selectedFile, onPreviewFile }) => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const res = await window.onworking.api.call('etl.scan');
    if (res.success) setFiles(res.data as FileEntry[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  if (loading) return <div style={{ padding: 8, fontSize: 12, color: '#999' }}>扫描中...</div>;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between' }}>
        <span>📁 源文件</span>
        <button onClick={refresh} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🔄</button>
      </div>
      {files.length === 0 ? (
        <div style={{ padding: 8, color: '#999' }}>source/ 下无 Excel 文件</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map(f => (
            <li key={f.path} onClick={() => onSelectFile(f.path)}
              style={{ padding: '4px 8px', cursor: 'pointer',
                background: f.path === selectedFile ? '#e6f0ff' : 'transparent',
                borderBottom: '1px solid #f0f0f0' }}>
              📄 {f.name}
              <div style={{ fontSize: 10, color: '#aaa' }}>{f.path}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
