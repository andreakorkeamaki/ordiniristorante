/** Serial, idempotent writes with an optimistic projection. No order data is persisted in the browser. */
export interface QueuedOrderEdit<E> {
  id: string;
  edit: E;
  label: string;
}

export interface OrderEditQueueState<S, E> {
  base: S;
  visible: S;
  pending: readonly QueuedOrderEdit<E>[];
  error: string | null;
  running: boolean;
}

export class OrderEditQueue<S, E> {
  private state: OrderEditQueueState<S, E>;
  private listeners = new Set<() => void>();
  private work: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;

  constructor(
    initial: S,
    private readonly project: (snapshot: S, edit: E) => S,
    private readonly send: (command: QueuedOrderEdit<E>, base: S) => Promise<S>,
    private readonly describeError: (error: unknown) => string,
    private readonly mergeTail?: (
      last: QueuedOrderEdit<E>,
      next: QueuedOrderEdit<E>,
    ) => QueuedOrderEdit<E> | null,
  ) {
    this.state = { base: initial, visible: initial, pending: [], error: null, running: false };
  }

  getSnapshot = () => this.state;
  getRevision = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: OrderEditQueueState<S, E>) {
    this.state = next;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private visible(base: S, pending: readonly QueuedOrderEdit<E>[]) {
    return pending.reduce((snapshot, command) => this.project(snapshot, command.edit), base);
  }

  /** Do not overlay edits onto realtime data that may already contain those edits. */
  acceptSnapshot(snapshot: S, expectedRevision = this.revision) {
    if (this.state.pending.length || this.state.running || expectedRevision !== this.revision) return false;
    this.publish({ ...this.state, base: snapshot, visible: snapshot });
    return true;
  }

  enqueue(command: QueuedOrderEdit<E>) {
    if (this.state.error) return false;
    const pending = [...this.state.pending];
    const lastIndex = pending.length - 1;
    const canMergeTail =
      lastIndex >= 0 && (!this.state.running || lastIndex > 0);
    const merged = canMergeTail
      ? this.mergeTail?.(pending[lastIndex], command) ?? null
      : null;
    if (merged) {
      // The command at the tail owns the retry identity. In particular, an
      // in-flight command at index 0 must never be replaced by coalescing.
      pending[lastIndex] = { ...merged, id: pending[lastIndex].id };
    } else {
      pending.push(command);
    }
    this.publish({ ...this.state, pending, visible: this.visible(this.state.base, pending) });
    if (!this.timer && !this.work) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, 60);
    }
    return true;
  }

  flush = (): Promise<boolean> => {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.work) return this.work;
    if (this.state.error) return Promise.resolve(false);
    if (!this.state.pending.length) return Promise.resolve(true);
    // Defer execution so work is assigned even when the transport throws synchronously.
    this.work = Promise.resolve().then(() => this.run()).finally(() => { this.work = null; });
    return this.work;
  };

  private async run() {
    this.publish({ ...this.state, running: true });
    while (this.state.pending.length) {
      const command = this.state.pending[0];
      try {
        const base = await this.send(command, this.state.base);
        const pending = this.state.pending.slice(1);
        this.publish({ ...this.state, base, pending, visible: this.visible(base, pending) });
      } catch (error) {
        // A timeout may have committed. Keep this exact operation id and every dependent edit.
        this.publish({ ...this.state, running: false, error: this.describeError(error) });
        return false;
      }
    }
    this.publish({ ...this.state, running: false });
    return true;
  }

  retry = () => {
    if (this.state.running) return this.work ?? Promise.resolve(false);
    this.publish({ ...this.state, error: null });
    return this.flush();
  };

  /** Explicit user recovery only, after reading an authoritative snapshot. */
  discardAndAccept(snapshot: S) {
    if (this.state.running) return false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.publish({ base: snapshot, visible: snapshot, pending: [], error: null, running: false });
    return true;
  }
}
