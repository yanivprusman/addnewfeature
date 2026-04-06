import { killFeedback } from './claude-launcher';

/** Track last activity timestamp per tmux session for auto-cleanup.
 *  Use globalThis to avoid Turbopack module duplication (same fix as pending-responses). */
const SESSION_ACTIVITY_KEY = Symbol.for('feedback-lib:session-last-activity');
const CLEANUP_STARTED_KEY = Symbol.for('feedback-lib:cleanup-interval-started');
const SESSION_ID_MAP_KEY = Symbol.for('feedback-lib:session-id-to-tmux');
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

type SessionInfo = { timestamp: number; appName: string };

export function getSessionActivityMap(): Map<string, SessionInfo> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SESSION_ACTIVITY_KEY]) {
    g[SESSION_ACTIVITY_KEY] = new Map<string, SessionInfo>();
  }
  return g[SESSION_ACTIVITY_KEY] as Map<string, SessionInfo>;
}

function isCleanupStarted(): boolean {
  return !!(globalThis as Record<symbol, unknown>)[CLEANUP_STARTED_KEY];
}

function markCleanupStarted(): void {
  (globalThis as Record<symbol, unknown>)[CLEANUP_STARTED_KEY] = true;
}

export function startSessionCleanupInterval() {
  if (isCleanupStarted()) return;
  markCleanupStarted();

  setInterval(() => {
    const sessionLastActivity = getSessionActivityMap();
    const now = Date.now();
    for (const [tmux, info] of sessionLastActivity.entries()) {
      if (now - info.timestamp > SESSION_TIMEOUT_MS) {
        killFeedback(tmux, info.appName);
        sessionLastActivity.delete(tmux);
      }
    }
  }, 60_000); // Check every minute
}

export function touchSession(tmuxSession: string, appName: string) {
  getSessionActivityMap().set(tmuxSession, { timestamp: Date.now(), appName });
}

export function removeSession(tmuxSession: string) {
  getSessionActivityMap().delete(tmuxSession);
  // Also remove from sessionId->tmux map
  const idMap = getSessionIdMap();
  for (const [sid, tmux] of idMap.entries()) {
    if (tmux.tmuxSession === tmuxSession) { idMap.delete(sid); break; }
  }
}

/** Map Claude sessionId -> { tmuxSession, appName } for SessionEnd hook lookup */
export function getSessionIdMap(): Map<string, { tmuxSession: string; appName: string }> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SESSION_ID_MAP_KEY]) {
    g[SESSION_ID_MAP_KEY] = new Map<string, { tmuxSession: string; appName: string }>();
  }
  return g[SESSION_ID_MAP_KEY] as Map<string, { tmuxSession: string; appName: string }>;
}

export function trackSessionId(sessionId: string, tmuxSession: string, appName: string) {
  getSessionIdMap().set(sessionId, { tmuxSession, appName });
}
