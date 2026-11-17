'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('node:path');
const { createStaticServer } = require('./static-server.cjs');
const { proxyRequest } = require('./provider-proxy.cjs');

const PORT = Number(process.env.REVELATION_PORT || 41888);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DIST = path.join(__dirname, '..', 'web-online', 'dist');
let server = null;
let mainWindow = null;

app.setName('Révélation Studio');
if (process.platform === 'darwin') app.setAboutPanelOptions({
  applicationName: 'Révélation Studio',
  applicationVersion: app.getVersion(),
  copyright: 'Révélation Studio',
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Édition', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Affichage', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Fenêtre', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function secureWebContents() {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(ORIGIN)) {
        event.preventDefault();
        if (/^https:\/\//i.test(url)) shell.openExternal(url);
      }
    });
  });
}

async function startServer() {
  server = createStaticServer({ root: DIST });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#101114',
    title: 'Révélation Studio',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`${ORIGIN}/?app_version=${encodeURIComponent(app.getVersion())}&desktop=1`);
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (error) {
    dialog.showErrorBox('Révélation Studio', `Impossible de démarrer le studio local sur ${ORIGIN}.\n${error && error.code === 'EADDRINUSE' ? 'Une autre instance occupe déjà ce port.' : String(error && error.message || error)}`);
    app.quit();
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media' || permission === 'clipboard-sanitized-write');
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'media' || permission === 'clipboard-sanitized-write');
  ipcMain.handle('studio:net', async (_event, payload) => {
    try {
      return await proxyRequest(payload || {});
    } catch (error) {
      return { error: String(error && error.message || error) };
    }
  });
  ipcMain.handle('studio:open-external', async (_event, url) => {
    const value = String(url || '');
    if (!/^https:\/\//i.test(value)) return false;
    await shell.openExternal(value);
    return true;
  });
  secureWebContents();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (server) server.close();
});
