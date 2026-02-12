export class EventEmitter<TEvents extends Record<keyof TEvents, (...args: never[]) => void>> {
  private listeners: Partial<Record<keyof TEvents, Array<(...args: never[]) => void>>> = {};
  private parentEmitter: EventEmitter<TEvents> | null = null;

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event]!.push(listener);

    return () => {
      this.listeners[event] = this.listeners[event]!.filter(l => l !== listener);
    };
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }
  }

  protected emit<K extends keyof TEvents>(event: K, ...args: Parameters<TEvents[K]>): void {
    if (this.parentEmitter) {
      this.parentEmitter.emit(event, ...args);
    }

    this.listeners[event]?.forEach(listener => {
      listener(...(args as never[]));
    });
  }

  bind(emitter: EventEmitter<TEvents>) {
    this.parentEmitter = emitter;
  }
}
