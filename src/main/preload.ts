import { contextBridge, ipcRenderer } from 'electron';

export interface APIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const api = {
  call(command: string, params?: Record<string, unknown>): Promise<APIResponse> {
    return ipcRenderer.invoke('api:call', command, params);
  },
};

const onworking = {
  platform: process.platform,
  api,
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  showInFolder: (fullPath: string): Promise<void> => ipcRenderer.invoke('shell:showInFolder', fullPath),
  getLanguage: (): Promise<string> => ipcRenderer.invoke('app:getLanguage'),
  confirm: (opts: { title: string; message: string; okLabel?: string }): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', opts),
  onOpenWorkspace: (cb: (payload?: { rootPath?: string }) => void): (() => void) => {
    const listener = (_e: unknown, payload?: { rootPath?: string }) => cb(payload);
    ipcRenderer.on('menu:open-workspace', listener);
    return () => ipcRenderer.removeListener('menu:open-workspace', listener);
  },
};
contextBridge.exposeInMainWorld('onworking', onworking);
