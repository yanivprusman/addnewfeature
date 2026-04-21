/**
 * Bridge-backed implementations of the claude-launcher interface.
 *
 * In this tier, Claude does NOT run on the hub server. Instead, each
 * authenticated user has paired a small "bridge" binary on their own device
 * (see claudeControl Phase 3). When the hub needs to launch Claude for an
 * issue, it dispatches the job to the user's bridge and streams results
 * back over a hub↔bridge command channel.
 *
 * This file provides drop-in replacements for the functions exported by
 * claude-launcher.ts, with matching signatures, so feedback-lib can be wired
 * via a plug-in selector (see index.ts: getClaudeLauncher) without consumers
 * needing to know which mode they're running in.
 *
 * ------------------------------------------------------------------------
 * Status: the hub↔bridge dispatch channel itself is Phase 5 work. Every
 * function here currently throws a clear BridgeDispatchNotReady error so
 * the hub fails loudly instead of pretending to launch Claude. Phase 5
 * will replace each body with a real round-trip to the user's bridge.
 * ------------------------------------------------------------------------
 */

import type {
  LaunchConfig,
  LaunchResult,
  ResumeConfig,
  FixConfig,
  FixResumeConfig,
  MaintenanceConfig,
  ConcludeConfig,
} from './claude-launcher';

// Re-export the types so bridge consumers don't need to reach into the direct
// launcher module. Keeps the surfaces aligned when the types change.
export type {
  LaunchConfig,
  LaunchResult,
  ResumeConfig,
  FixConfig,
  FixResumeConfig,
  MaintenanceConfig,
  ConcludeConfig,
};

/** Structured error so callers (and UI layers) can distinguish this from
 *  generic failures. */
export class BridgeDispatchNotReady extends Error {
  code = 'bridge_dispatch_not_ready' as const;
  constructor(op: string) {
    super(
      `Bridge dispatch not yet implemented for "${op}". ` +
        `The claudeControl hub is using the bridge launcher, but the ` +
        `hub→bridge command channel lands in Phase 5. ` +
        `Addnewfeature (direct/tmux launcher) is unaffected.`,
    );
    this.name = 'BridgeDispatchNotReady';
  }
}

function notReady(op: string): never {
  throw new BridgeDispatchNotReady(op);
}

// ---------------------------------------------------------------------------
// The same named exports as claude-launcher.ts, with identical signatures.
// ---------------------------------------------------------------------------

export function checkClaudeAuth(): string | null {
  // No credentials live on the hub in bridge mode; the user's bridge owns
  // ~/.claude/.credentials.json on their own device. Return null to indicate
  // "hub auth is fine" — the bridge reports its own claude auth via its
  // heartbeat capabilities.
  return null;
}

export function launchFeedback(_config: LaunchConfig): LaunchResult {
  notReady('launchFeedback');
}

export function resumeFeedback(_config: ResumeConfig): LaunchResult {
  notReady('resumeFeedback');
}

export function sendMessage(
  _tmuxSession: string,
  _message: string,
  _user = 'root',
): void {
  notReady('sendMessage');
}

export function killFeedback(
  _tmuxSession: string,
  _appName?: string,
  _user = 'root',
): boolean {
  notReady('killFeedback');
}

export function isTmuxAlive(_tmuxSession: string, _user = 'root'): boolean {
  // In bridge mode there is no tmux on the hub — there's no server-side
  // process to check liveness of. We return false so callers treat any
  // "is this session still running?" probe as "no, it's gone". Phase 5
  // will swap this for a real bridge-side liveness query.
  return false;
}

export function launchFix(_config: FixConfig): LaunchResult {
  notReady('launchFix');
}

export function launchFixResume(_config: FixResumeConfig): LaunchResult {
  notReady('launchFixResume');
}

export function launchMaintenance(_config: MaintenanceConfig): LaunchResult {
  notReady('launchMaintenance');
}

export function launchConclude(
  _config: ConcludeConfig,
): { tmuxSession: string } | null {
  notReady('launchConclude');
}
