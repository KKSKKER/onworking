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

contextBridge.exposeInMainWorld('onworking', {
  platform: process.platform,
  api,
});
