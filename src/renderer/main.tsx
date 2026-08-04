import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TableConfigStoreProvider } from './state/TableConfigStore';
import { ContextMenuHost } from './context-menu/ContextMenuHost';
import { setCatalog } from '../common/i18n';
import zh from '../../i18n/zh.json';
import en from '../../i18n/en.json';

// 语言由主进程启动时从根目录 language.json 读定,经 IPC 告知 renderer。
// 必须在 render 前 setCatalog,避免界面渲染成裸 key。
async function bootstrap(): Promise<void> {
  let lang = 'zh';
  try {
    const l = await window.onworking.getLanguage();
    if (l === 'en') lang = 'en';
  } catch { /* IPC 不可用时默认 zh */ }
  setCatalog(lang === 'en' ? en : zh);

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <TableConfigStoreProvider>
      <App />
      <ContextMenuHost />
    </TableConfigStoreProvider>
  );
}
void bootstrap();
