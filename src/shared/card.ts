/**
 * A single booking on an account. `sender`/`receiver` are account names (the
 * server resolves numbers to names); `amount` is always positive.
 */
export interface Transaction {
  transaction_id: number
  sender: string
  receiver: string
  amount: number
}

/** Full view of one account, shown after a card is presented. */
export interface AccountView {
  /** Display account number (as returned by the server, already offset). */
  account_number: number
  account_name: string
  balance: number
  /** Unlimited accounts (e.g. a till) can always pay out. */
  unlimited: boolean
  transactions: Transaction[]
}

/**
 * Status of a card read, broadcast from the main process to the renderer over
 * the `card-status` IPC channel as the read progresses.
 */
export type CardStatus =
  | { state: 'reading' }
  | { state: 'success'; account: AccountView }
  | { state: 'error'; message: string }
  // The card was lifted off the reader. The teller keeps operating on the
  // loaded account until a new card is presented, so this is informational.
  | { state: 'removed' }

/** Lightweight account entry for the counterpart picker. */
export interface AccountSummary {
  account_number: number
  account_name: string
  balance: number
  unlimited: boolean
}

/** The three teller actions available on a presented account. */
export type ActionKind = 'deposit' | 'withdraw' | 'transfer'

/**
 * Request to move Wusel for the presented card.
 * - `deposit`  (Einzahlung):  counterpart -> card
 * - `withdraw` (Auszahlung):  card -> counterpart
 * - `transfer` (Überweisung): card -> counterpart
 *
 * Account numbers are the display numbers as returned by the server.
 */
export interface ActionRequest {
  kind: ActionKind
  cardAccount: number
  counterpartAccount: number
  amount: number
}

/** Outcome of a teller action; on success carries the refreshed account. */
export type ActionResult =
  | { ok: true; account: AccountView }
  | { ok: false; message: string }
