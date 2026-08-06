// onworking/src/renderer/components/TopBar.tsx
import React, { useEffect, useState } from 'react';
import { t } from '../../common/i18n';

export type ViewId = 'config' | 'preview' | 'results' | 'sql';

interface TopBarProps {
  workspaceName: string;
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

// 存 key 而非渲染好的词:ESM 下本模块体先于 main.tsx 的 setCatalog(zh) 执行,
// 模块顶层调 t() 会拿不到目录而渲染成裸 key。改成渲染时取词,规避时序问题。
const TABS: { id: ViewId; labelKey: string }[] = [
  { id: 'config', labelKey: 'topBar.view1' },
  { id: 'preview', labelKey: 'topBar.view2' },
  { id: 'results', labelKey: 'topBar.view3' },
  { id: 'sql', labelKey: 'topBar.view4' },
];

export const TopBar: React.FC<TopBarProps> = ({ workspaceName, activeView, onViewChange }) => {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  useEffect(() => {
    window.onworking.getLanguage().then(l => setLang(l === 'en' ? 'en' : 'zh')).catch(() => {});
  }, []);

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value === 'en' ? 'en' : 'zh';
    setLang(next); // 立即反映选中(重启生效前)
    void window.onworking.setLanguage(next); // 主进程写文件并自动重启
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px',
      borderBottom: '1px solid #ddd', background: '#fafafa', gap: 16 }}>
      <strong style={{ fontSize: 13 }}>OnWorking</strong>
      <span style={{ color: '#666', fontSize: 12 }}>[{workspaceName}]</span>
      <div style={{ display: 'flex', gap: 0, marginLeft: 24 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => onViewChange(tab.id)}
            style={{ padding: '4px 16px', border: 'none', cursor: 'pointer',
              background: activeView === tab.id ? '#007acc' : 'transparent',
              color: activeView === tab.id ? 'white' : '#333',
              borderRadius: 3, fontSize: 12, fontWeight: activeView === tab.id ? 600 : 400 }}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#666' }}>{t('topBar.language')}</span>
        <select value={lang} onChange={handleLangChange} style={{ fontSize: 12, padding: '2px 4px' }}>
          <option value="zh">{t('lang.zhName')}</option>
          <option value="en">{t('lang.enName')}</option>
        </select>
      </span>
    </div>
  );
};
