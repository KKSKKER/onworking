import { Menu } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import * as path from 'node:path';
import { shell } from 'electron';
import { WorkspaceManager, getActiveRoot } from './workspace/manager';
import { t } from '../common/i18n';

/**
 * 自选极简菜单(文件/编辑/帮助),替换 Electron 默认菜单。
 * 打开工作区只广播事件,renderer 收到后跑唯一的 openWorkspace() 流程。
 * 退出/剪贴板是 OS 级 role,是唯一不走 API 的特例。
 */
export function buildApplicationMenu(getWin: () => BrowserWindow | null): void {
  const send = (payload?: { rootPath?: string }): void => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send('menu:open-workspace', payload);
  };

  const activeRoot = getActiveRoot();
  const recent = WorkspaceManager.listRecent();

  const template: MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.openWorkspace'), accelerator: 'CmdOrCtrl+O', click: () => send() },
        {
          label: t('menu.recentWorkspaces'),
          submenu: recent.length > 0
            ? recent.map(r => ({ label: `${r.name} — ${r.rootPath}`, click: () => send({ rootPath: r.rootPath }) }))
            : [{ label: t('menu.noRecent'), enabled: false }],
        },
        { type: 'separator' },
        { role: 'quit', label: t('menu.quit') },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        { role: 'about', label: t('menu.about') },
        {
          label: t('menu.openDataDir'),
          enabled: !!activeRoot,
          click: () => { if (activeRoot) shell.openPath(path.join(activeRoot, 'source')); },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
