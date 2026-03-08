import { app, BrowserWindow, Tray, nativeImage, Menu } from 'electron';

import { LocalAgentClient } from './local-agent';
import { DesktopModeController } from './mode-controller';
import { createPetWindow } from './pet-window';
import { ReverseMcpTunnel } from './reverse-mcp-tunnel';
import { CrashRestartManager } from './restart-manager';

const modeController = new DesktopModeController();
const agentClient = new LocalAgentClient(process.env.AIVA_LOCAL_AGENT_URL ?? 'http://127.0.0.1:4315');
const restartManager = new CrashRestartManager({
  relaunch: () => app.relaunch(),
  quit: () => app.quit(),
  maxRecoveries: 2,
});
const tunnel = new ReverseMcpTunnel({
  url: process.env.AIVA_GATEWAY_WS_URL ?? 'ws://127.0.0.1:3000/bridge',
  token: process.env.AIVA_TUNNEL_TOKEN ?? '',
});

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Allow actual quit from tray menu
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      AIVA_GATEWAY_WS_URL?: string;
      AIVA_TUNNEL_TOKEN?: string;
      AIVA_LOCAL_AGENT_URL?: string;
      AIVA_DESKTOP_URL?: string;
    }
  }
}

// Extend app with isQuitting flag
(app as unknown as { isQuitting: boolean }).isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 640,
    show: true,
    transparent: false,
    alwaysOnTop: false,
    webPreferences: {
      sandbox: true,
    },
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      restartManager.handleRendererCrash(new Error(details.reason));
    }
  });

  // Minimize to tray instead of closing on macOS
  mainWindow.on('close', (event) => {
    if (!(app as unknown as { isQuitting: boolean }).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.loadURL(process.env.AIVA_DESKTOP_URL ?? 'about:blank').catch(() => {
    // no-op for now, can be replaced by local static bundle path in packaging stage.
  });
}

function updateTrayMenu() {
  const tunnelHealth = tunnel.getHealth();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'AIVA Desktop',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: tunnelHealth.connected ? '● Connected' : '○ Disconnected',
      enabled: false,
    },
    {
      label: 'Show Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Hide Window',
      click: () => {
        mainWindow?.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Pet Mode',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
          modeController.switchMode('pet', mainWindow);
        }
        if (!petWindow || petWindow.isDestroyed()) {
          petWindow = createPetWindow();
        } else {
          petWindow.show();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Window Mode',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.close();
          petWindow = null;
        }
        if (mainWindow) {
          modeController.switchMode('window', mainWindow);
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Reconnect Tunnel',
      click: () => {
        tunnel.start();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as unknown as { isQuitting: boolean }).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray?.setContextMenu(contextMenu);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('AIVA Desktop');

  updateTrayMenu();

  // Double-click to toggle window visibility
  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

app.whenReady().then(async () => {
  createWindow();
  createTray();

  const status = await agentClient.getStatus();
  if (!status.healthy) {
    console.warn('[desktop] local agent is not healthy:', status.error);
  }

  // Start tunnel and refresh tray status every 30s
  tunnel.start();
  setInterval(() => {
    updateTrayMenu();
  }, 30_000);

  modeController.switchMode('window', mainWindow as BrowserWindow);
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
