import { useEffect, useRef, useState } from 'react'
import type {
  AccountSummary,
  AccountView,
  ActionKind,
  CardStatus,
  Transaction
} from '../../shared/card'
import { onCardStatus } from './cardStatus'

type View = { state: 'idle' } | CardStatus

const wuselFormatter = new Intl.NumberFormat('de-DE')
const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit'
})

// Per-action labels: button caption and how the counterpart is described.
const ACTIONS: Record<ActionKind, { label: string; counterpartLabel: string; verb: string }> = {
  deposit: { label: 'Einzahlung', counterpartLabel: 'Von Konto', verb: 'eingezahlt' },
  withdraw: { label: 'Auszahlung', counterpartLabel: 'Auf Konto', verb: 'ausgezahlt' },
  transfer: { label: 'Überweisung', counterpartLabel: 'Empfänger', verb: 'überwiesen' }
}

/** A live wall-clock that re-renders every second. */
function Clock(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="clock">
      <span className="clock-time">{timeFormatter.format(now)}</span>
    </div>
  )
}

function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ state: 'idle' })

  useEffect(() => {
    const unsubscribe = onCardStatus((status: CardStatus) => {
      // A lifted card is informational: the teller keeps working on the loaded
      // account until a new card is presented or they close it manually.
      if (status.state === 'removed') return
      setView(status)
    })
    return unsubscribe
  }, [])

  return (
    <div className="app-layout">
      <div className="terminal">
        <div className={`card-panel ${view.state}`}>
          <header className="topbar">
            <h1 className="brand">Wuselbank</h1>
            {view.state === 'idle' && <Clock />}
          </header>
          <div className="card-content">
            {view.state === 'success' ? (
              <AccountScreen
                account={view.account}
                onAccountChange={(account) => setView({ state: 'success', account })}
                onClose={() => setView({ state: 'idle' })}
              />
            ) : (
              renderView(view)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderView(view: Exclude<View, { state: 'success' }>): React.JSX.Element {
  switch (view.state) {
    case 'reading':
      return (
        <>
          <div className="spinner" aria-hidden />
          <p className="message">Karte wird gelesen…</p>
        </>
      )
    case 'error':
      return (
        <>
          <div className="icon-error" aria-hidden>
            !
          </div>
          <p className="message">{view.message}</p>
          <p className="hint">Bitte versuche es noch einmal.</p>
        </>
      )
    case 'idle':
    default:
      return (
        <>
          <div className="nfc-icon" aria-hidden>
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
          </div>
          <p className="message">Halte deine Karte an das Lesegerät</p>
        </>
      )
  }
}

/** The account view shown after a card is presented, plus the teller actions. */
function AccountScreen({
  account,
  onAccountChange,
  onClose
}: {
  account: AccountView
  onAccountChange: (account: AccountView) => void
  onClose: () => void
}): React.JSX.Element {
  const [action, setAction] = useState<ActionKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string): void => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  return (
    <div className="account">
      <div className="account-head">
        <div className="account-id">
          <span className="account-name">{account.account_name}</span>
          <span className="account-number">Konto #{account.account_number}</span>
        </div>
        <button className="close-btn" onClick={onClose}>
          Schließen
        </button>
      </div>

      <p className="balance">
        {wuselFormatter.format(account.balance)} <span className="unit">Wusel</span>
        {account.unlimited && <span className="badge">unbegrenzt</span>}
      </p>

      <div className="actions">
        {(Object.keys(ACTIONS) as ActionKind[]).map((kind) => (
          <button key={kind} className={`action-btn ${kind}`} onClick={() => setAction(kind)}>
            {ACTIONS[kind].label}
          </button>
        ))}
      </div>

      <TransactionList accountName={account.account_name} transactions={account.transactions} />

      {toast && <div className="toast">{toast}</div>}

      {action && (
        <ActionDialog
          kind={action}
          account={account}
          onClose={() => setAction(null)}
          onSuccess={(updated, message) => {
            onAccountChange(updated)
            setAction(null)
            showToast(message)
          }}
        />
      )}
    </div>
  )
}

function TransactionList({
  accountName,
  transactions
}: {
  accountName: string
  transactions: Transaction[]
}): React.JSX.Element {
  if (transactions.length === 0) {
    return <p className="hint">Noch keine Buchungen</p>
  }

  return (
    <ul className="transactions">
      {transactions.toReversed().map((tx) => {
        if (tx.amount < 0) {
          const receiver = tx.receiver
          tx.receiver = tx.sender
          tx.sender = receiver
          tx.amount = -tx.amount
        }
        const sending = tx.sender === accountName
        const counterparty = tx.sender === accountName ? tx.receiver : tx.sender
        return (
          <li key={tx.transaction_id} className="transaction">
            <span className="tx-party">{counterparty}</span>
            <span className={`tx-amount ${sending ? 'out' : 'in'}`}>
              {sending ? '−' : '+'}
              {wuselFormatter.format(Math.abs(tx.amount))} Wusel
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Modal for entering an amount and counterpart and submitting one action. */
function ActionDialog({
  kind,
  account,
  onClose,
  onSuccess
}: {
  kind: ActionKind
  account: AccountView
  onClose: () => void
  onSuccess: (account: AccountView, message: string) => void
}): React.JSX.Element {
  const meta = ACTIONS[kind]
  const [amountText, setAmountText] = useState('')
  const [counterpart, setCounterpart] = useState<AccountSummary | null>(null)
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null)
  const [filter, setFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the account list (everyone but the card's own account) for the picker.
  useEffect(() => {
    let active = true
    void window.api.listAccounts().then((all) => {
      if (!active) return
      setAccounts(all.filter((a) => a.account_number !== account.account_number))
    })
    return () => {
      active = false
    }
  }, [account.account_number])

  const amount = Number(amountText)
  const amountValid = Number.isInteger(amount) && amount > 0
  const canSubmit = amountValid && counterpart !== null && !submitting

  const submit = async (): Promise<void> => {
    if (!counterpart || !amountValid) return
    setSubmitting(true)
    setError(null)
    const result = await window.api.performAction({
      kind,
      cardAccount: account.account_number,
      counterpartAccount: counterpart.account_number,
      amount
    })
    setSubmitting(false)
    if (result.ok) {
      onSuccess(result.account, `${wuselFormatter.format(amount)} Wusel ${meta.verb}.`)
    } else {
      setError(result.message)
    }
  }

  const term = filter.trim().toLowerCase()
  const visible = (accounts ?? []).filter(
    (a) =>
      term === '' ||
      a.account_name.toLowerCase().includes(term) ||
      String(a.account_number).includes(term)
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{meta.label}</h2>

        <label className="field">
          <span className="field-label">Betrag (Wusel)</span>
          <input
            className="amount-input"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            autoFocus
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
          />
        </label>

        <div className="field">
          <span className="field-label">{meta.counterpartLabel}</span>
          <input
            className="filter-input"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name oder Kontonummer suchen…"
          />
          <ul className="account-list">
            {accounts === null ? (
              <li className="account-list-empty">Konten werden geladen…</li>
            ) : visible.length === 0 ? (
              <li className="account-list-empty">Keine Konten gefunden</li>
            ) : (
              visible.map((a) => (
                <li key={a.account_number}>
                  <button
                    className={`account-option ${
                      counterpart?.account_number === a.account_number ? 'selected' : ''
                    }`}
                    onClick={() => setCounterpart(a)}
                  >
                    <span className="option-name">{a.account_name}</span>
                    <span className="option-number">#{a.account_number}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>
            Abbrechen
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? 'Wird gebucht…' : meta.label}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
