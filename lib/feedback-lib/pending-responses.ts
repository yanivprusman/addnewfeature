// Use globalThis with Symbol.for() to guarantee a single Map instance
// across all Turbopack module copies in the same Node.js process.
const PENDING_KEY = Symbol.for('feedback-lib:pending-responses');

type PendingEntry = { resolve: (text: string) => void };

function getPendingMap(): Map<string, PendingEntry[]> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[PENDING_KEY]) {
    g[PENDING_KEY] = new Map<string, PendingEntry[]>();
  }
  return g[PENDING_KEY] as Map<string, PendingEntry[]>;
}

export function waitForResponse(sessionId: string): Promise<string> {
  const pending = getPendingMap();
  return new Promise<string>((resolve) => {
    const entry: PendingEntry = {
      resolve: (text: string) => {
        const queue = pending.get(sessionId);
        if (queue) {
          const idx = queue.indexOf(entry);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) pending.delete(sessionId);
        }
        console.log(`[feedback-lib] waitForResponse RESOLVED for session ${sessionId} (queue size: ${pending.get(sessionId)?.length ?? 0})`);
        resolve(text);
      },
    };

    if (!pending.has(sessionId)) {
      pending.set(sessionId, []);
    }
    pending.get(sessionId)!.push(entry);
    console.log(`[feedback-lib] waitForResponse REGISTERED for session ${sessionId} (queue size: ${pending.get(sessionId)!.length})`);
  });
}

export function resolveResponse(sessionId: string, text: string): boolean {
  const pending = getPendingMap();
  const queue = pending.get(sessionId);
  if (queue && queue.length > 0) {
    console.log(`[feedback-lib] resolveResponse FOUND session ${sessionId} (queue size: ${queue.length})`);
    // FIFO: resolve the oldest waiter first
    queue[0].resolve(text);
    return true;
  }
  console.log(`[feedback-lib] resolveResponse MISS for session ${sessionId} (keys: [${[...pending.keys()].join(', ')}])`);
  return false;
}
