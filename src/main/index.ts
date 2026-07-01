import { app, shell, BrowserWindow, ipcMain, utilityProcess } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { ActionRequest, CardStatus, NfcMessage } from '../shared/card'
import { fetchBalance, listAccountSummaries, performAction } from './api'

// Minimum/maximum time the "reading" state is shown, so the loading animation
// is always visible even when the server responds instantly.
const MIN_READING_MS = 200
const MAX_READING_MS = 1000

// The simulated card path has no physical removal event, so we fake one after
// holding the result on screen for a bit, mirroring a real tap-and-remove.
const SIMULATED_HOLD_MS = 4000

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Broadcast a card status update to every open window. */
function sendCardStatus(status: CardStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('card-status', status)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Handle a single card tap: show loading, fetch, then report the result. */
async function handleCard(cardId: string): Promise<void> {
  sendCardStatus({ state: 'reading' })

  // Artificial minimum delay so the loading animation is always perceptible.
  const minDuration = MIN_READING_MS + Math.random() * (MAX_READING_MS - MIN_READING_MS)
  const [status] = await Promise.all([fetchBalance(cardId), delay(minDuration)])

  sendCardStatus(status)
}

/**
 * Drive the NFC reader from a dedicated `utilityProcess`, handing each card tap
 * to `handleCard`. The reader lives in its own process so that PC/SC polling —
 * which busy-loops on Windows when no reader is connected — can never block
 * this process's event loop and freeze the window. See `nfcWorker.ts`.
 */
function setupNfc(): void {
  const nfc = utilityProcess.fork(join(__dirname, 'nfcWorker.js'), [], {
    serviceName: 'nfc-reader'
  })

  // Tracks the most recent read so a removal doesn't reset the screen before
  // its result has even been shown (e.g. card lifted while still reading).
  let activeRead: Promise<void> = Promise.resolve()

  nfc.on('message', (message: NfcMessage) => {
    switch (message.type) {
      case 'card':
        console.log(`Card detected: ${message.uid}`)
        activeRead = handleCard(message.uid)
        void activeRead
        break
      case 'card-off':
        console.log(`Card removed: ${message.uid}`)
        void activeRead.then(() => sendCardStatus({ state: 'removed' }))
        break
      case 'log':
        console.log(message.message)
        break
      case 'error':
        console.error(message.message)
        break
    }
  })

  nfc.on('exit', (code) => {
    console.error(`NFC process exited with code ${code}`)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // List all accounts for the counterpart picker used by the teller actions.
  ipcMain.handle('accounts:list', () => listAccountSummaries())
  // Perform a teller action (Einzahlung/Auszahlung/Überweisung). The admin
  // secret lives only in the main process and is added here, never exposed to
  // the renderer.
  ipcMain.handle('action:perform', (_event, request: ActionRequest) => performAction(request))
  // Dev helper: simulate a card read by id (drives the real fetchBalance path).
  // There is no physical removal, so emit one after a hold to clear the screen.
  ipcMain.handle('card:simulate', async (_event, cardId: string) => {
    await handleCard(cardId)
    await delay(SIMULATED_HOLD_MS)
    sendCardStatus({ state: 'removed' })
  })

  createWindow()

  setupNfc()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
