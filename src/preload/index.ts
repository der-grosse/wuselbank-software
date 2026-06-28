import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AccountSummary, ActionRequest, ActionResult, CardStatus } from '../shared/card'

// Custom APIs for renderer
const api = {
  /**
   * Subscribe to card status updates from the main process.
   * Returns an unsubscribe function.
   */
  onCardStatus: (callback: (status: CardStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CardStatus): void =>
      callback(status)
    ipcRenderer.on('card-status', listener)
    return () => ipcRenderer.removeListener('card-status', listener)
  },

  /** List all accounts (for choosing the counterpart of an action). */
  listAccounts: (): Promise<AccountSummary[]> => ipcRenderer.invoke('accounts:list'),

  /** Perform a teller action (Einzahlung/Auszahlung/Überweisung). */
  performAction: (request: ActionRequest): Promise<ActionResult> =>
    ipcRenderer.invoke('action:perform', request),

  /** Simulate a card read by id, using the real balance-fetch path. */
  simulateCard: (cardId: string | number): Promise<void> =>
    ipcRenderer.invoke('card:simulate', cardId)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
