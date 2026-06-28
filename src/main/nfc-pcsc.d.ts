declare module 'nfc-pcsc' {
  import { EventEmitter } from 'events'

  export interface Card {
    uid: string
    type?: string
    standard?: string
    atr?: Buffer
  }

  export interface Reader extends EventEmitter {
    name: string
    on(event: 'card', listener: (card: Card) => void): this
    on(event: 'card.off', listener: (card: Card) => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'end', listener: () => void): this
  }

  export class NFC extends EventEmitter {
    constructor(logger?: unknown)
    on(event: 'reader', listener: (reader: Reader) => void): this
    on(event: 'error', listener: (err: Error) => void): this
  }
}
