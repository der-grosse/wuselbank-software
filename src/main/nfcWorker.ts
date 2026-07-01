// Runs in an Electron `utilityProcess`, i.e. a dedicated Node.js process with
// its own event loop. All PC/SC / nfc-pcsc work happens here so that its
// polling — which busy-loops and emits a flood of errors on Windows when no
// reader is connected — stays contained in this process and can never starve
// the main process's UI message pump.
import { NFC } from 'nfc-pcsc'
import type { NfcMessage } from '../shared/card'

// `process.parentPort` is only defined inside a utility process.
const parentPort = process.parentPort

function post(message: NfcMessage): void {
  parentPort.postMessage(message)
}

// When no reader is present the underlying PC/SC layer can emit errors in a
// tight loop. Forwarding each one would just move the flood to the parent, so
// we collapse them to at most one message every few seconds.
const ERROR_THROTTLE_MS = 5000
let lastErrorAt = 0

function postError(message: string): void {
  const now = Date.now()
  if (now - lastErrorAt < ERROR_THROTTLE_MS) return
  lastErrorAt = now
  post({ type: 'error', message })
}

const nfc = new NFC()

nfc.on('reader', (reader) => {
  post({ type: 'log', message: `NFC reader connected: ${reader.name}` })

  reader.on('card', (card) => {
    post({ type: 'card', uid: card.uid })
  })

  reader.on('card.off', (card) => {
    post({ type: 'card-off', uid: card.uid })
  })

  reader.on('error', (err) => {
    postError(`NFC reader error (${reader.name}): ${err instanceof Error ? err.message : String(err)}`)
  })

  reader.on('end', () => {
    post({ type: 'log', message: `NFC reader disconnected: ${reader.name}` })
  })
})

nfc.on('error', (err) => {
  postError(`NFC error: ${err instanceof Error ? err.message : String(err)}`)
})
