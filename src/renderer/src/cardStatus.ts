import type { CardStatus } from '../../shared/card'

/** Subscribe to card status updates from the main process. */
export function onCardStatus(listener: (status: CardStatus) => void): () => void {
  return window.api.onCardStatus(listener)
}

/**
 * Simulate a card being read: sends the given card id through the same path as a
 * real read (main process -> fetchBalance -> result broadcast), so the balance
 * is fetched for real. Call from the DevTools console, e.g. `simulateCard(1234)`.
 */
export function simulateCard(cardId: string | number): Promise<void> {
  return window.api.simulateCard(cardId)
}

declare global {
  interface Window {
    simulateCard: typeof simulateCard
  }
}

// Expose on window so it can be triggered from the DevTools console.
window.simulateCard = simulateCard
