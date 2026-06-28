import { ElectronAPI } from '@electron-toolkit/preload'
import type { AccountSummary, ActionRequest, ActionResult, CardStatus } from '../shared/card'

interface Api {
  onCardStatus: (callback: (status: CardStatus) => void) => () => void
  listAccounts: () => Promise<AccountSummary[]>
  performAction: (request: ActionRequest) => Promise<ActionResult>
  simulateCard: (cardId: string | number) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
