import { Menu } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import * as path from 'node:path';
import { shell } from 'electron';
import { WorkspaceManager, getActiveRoot } from './workspace/manager';

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
      label: '文件',
      submenu: [
        { label: '打开工作区…', accelerator: 'CmdOrCtrl+O', click: () => send() },
        {
          label: '最近工作区',
          submenu: recent.length > 0
            ? recent.map(r => ({ label: `${r.name} — ${r.rootPath}`, click: () => send({ rootPath: r.rootPath }) }))
            : [{ label: '(无)', enabled: false }],
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { role: 'about', label: '关于' },
        {
          label: '打开数据目录',
          enabled: !!activeRoot,
          click: () => { if (activeRoot) shell.openPath(path.join(activeRoot, 'source')); },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
