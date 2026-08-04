import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { t } from '../../common/i18n';

/**
 * 纯 UI 能力,窄 IPC 通道,不注册进 API 路由。
 * getWin() 延迟取当前窗口,避免重复创建窗口时重复注册 handler。
 */
export function registerUI(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:pickFolder', async () => {
    const win = getWin();
    if (!win || win.isDestroyed()) return null;
    const res = await dialog.showOpenDialog(win, {
      title: t('dialog.openWorkspaceTitle'),
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });

  ipcMain.handle('shell:showInFolder', (_e, fullPath: string) => {
    if (typeof fullPath === 'string' && fullPath) shell.showItemInFolder(fullPath);
  });

  ipcMain.handle('dialog:confirm', async (_e, opts: { title?: string; message?: string; okLabel?: string }) => {
    const win = getWin();
    if (!win || win.isDestroyed()) return false;
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      title: opts.title ?? t('dialog.confirmDefault'),
      message: opts.message ?? '',
      buttons: [opts.okLabel ?? t('dialog.confirmDefault'), t('dialog.cancelDefault')],
      defaultId: 1,
      cancelId: 1,
    });
    return res.response === 0;
  });
}
