import type { OperationName } from '@travelta/schemas';

/** In-process event bus. Later milestones add domain events (booking.confirmed, instalment.overdue, …). */
export type ServerEvent =
  | { type: 'db.changed'; operation: OperationName | 'boot' | 'reset' | 'import'; at: string }
  | { type: 'clock.changed'; at: string };

export type Listener = (event: ServerEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ServerEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (error) {
        console.error('event listener failed', error);
      }
    }
  }
}
