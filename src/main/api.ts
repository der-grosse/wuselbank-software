import type {
  AccountSummary,
  AccountView,
  ActionRequest,
  ActionResult,
  CardStatus,
  Transaction
} from '../shared/card'

// Server base URL and the admin secret used to authorize transactions. Both can
// be overridden via environment variables on the terminal that runs the app.
const SERVER_URL = (process.env.WUSELBANK_API ?? 'https://wuselkusen.idot-digital.com').replace(
  /\/$/,
  ''
)
const SECRET = process.env.SECRET ?? process.env.WUSELBANK_SECRET ?? 'wuselkusel'

/** Shape of an account as returned by `GET /api/accounts`. */
interface RawAccount {
  account_name: string
  balance: number
  unlimited: boolean
  account_number: number
  transactions: Transaction[]
  cards: string[]
  cardreaders: number[]
}

// !!! FÜR LUIS: hier das parsing von der ausgelesenen Karten ID zum Wert, der an den Server geschickt wird !!!
function parseCardId(cardId: string): string {
  return cardId.toUpperCase()
}

/** Fetch all accounts from the server. Throws on a non-OK response. */
async function fetchAccounts(): Promise<RawAccount[]> {
  const response = await fetch(`${SERVER_URL}/api/accounts`, { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Server antwortet mit ${response.status}`)
  }
  return (await response.json()) as RawAccount[]
}

function toAccountView(account: RawAccount): AccountView {
  return {
    account_number: account.account_number,
    account_name: account.account_name,
    balance: account.balance,
    unlimited: account.unlimited,
    transactions: account.transactions
  }
}

/** Look up the account linked to a tapped card and return its full view. */
export async function fetchBalance(cardId: string): Promise<CardStatus> {
  cardId = parseCardId(cardId)
  try {
    const accounts = await fetchAccounts()
    const ownAccount = accounts.find((account) => account.cards.includes(cardId))
    if (!ownAccount) {
      return { state: 'error', message: 'Karte nicht gefunden' }
    }
    return { state: 'success', account: toAccountView(ownAccount) }
  } catch (error) {
    return {
      state: 'error',
      message: error instanceof Error ? error.message : 'Server nicht erreichbar'
    }
  }
}

/** All accounts as lightweight summaries for the counterpart picker. */
export async function listAccountSummaries(): Promise<AccountSummary[]> {
  const accounts = await fetchAccounts()
  return accounts.map(({ account_number, account_name, balance, unlimited }) => ({
    account_number,
    account_name,
    balance,
    unlimited
  }))
}

/**
 * Perform a teller action. Resolves the action to a directed transaction,
 * posts it with the admin secret, then re-fetches the card's account so the
 * caller can show the updated balance and transaction list.
 */
export async function performAction(request: ActionRequest): Promise<ActionResult> {
  const { kind, cardAccount, counterpartAccount, amount } = request

  if (!SECRET) {
    return { ok: false, message: 'Kein Passwort konfiguriert (SECRET fehlt).' }
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: 'Betrag muss eine positive Zahl sein.' }
  }
  if (!Number.isInteger(counterpartAccount)) {
    return { ok: false, message: 'Kein gültiges Gegenkonto gewählt.' }
  }
  if (counterpartAccount === cardAccount) {
    return { ok: false, message: 'Gegenkonto muss sich vom Kartenkonto unterscheiden.' }
  }

  // Einzahlung adds money to the card; Auszahlung/Überweisung take it out.
  const sender = kind === 'deposit' ? counterpartAccount : cardAccount
  const receiver = kind === 'deposit' ? cardAccount : counterpartAccount

  try {
    const response = await fetch(`${SERVER_URL}/api/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, receiver, amount, password: SECRET })
    })

    if (response.status === 401) {
      return { ok: false, message: 'Passwort abgelehnt (SECRET falsch).' }
    }
    if (response.status === 400) {
      return { ok: false, message: 'Nicht genügend Guthaben.' }
    }
    if (!response.ok) {
      return { ok: false, message: `Server antwortet mit ${response.status}` }
    }

    // Re-read the card's account so the UI reflects the new balance/bookings.
    const accounts = await fetchAccounts()
    const updated = accounts.find((account) => account.account_number === cardAccount)
    if (!updated) {
      return { ok: false, message: 'Konto nach Buchung nicht gefunden.' }
    }
    return { ok: true, account: toAccountView(updated) }
  } catch {
    return { ok: false, message: 'Server nicht erreichbar' }
  }
}
