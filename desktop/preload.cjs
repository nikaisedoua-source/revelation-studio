'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('StudioDesktop', {
  isDesktop: true,
  platform: process.platform,
  fetch: (payload) => ipcRenderer.invoke('studio:net', {
    url: payload && payload.url,
    method: payload && payload.method,
    headers: payload && payload.headers,
    body: payload && payload.body,
    timeoutMs: payload && payload.timeoutMs,
  }),
  openExternal: (url) => ipcRenderer.invoke('studio:open-external', String(url || '')),
});
