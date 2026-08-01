import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('onworking', {
  platform: process.platform,
});
