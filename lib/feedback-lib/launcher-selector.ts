/**
 * Launcher selector — returns either the direct-exec (tmux) or the
 * bridge-backed implementation of the claude-launcher interface, based on
 * `process.env.FEEDBACK_LIB_LAUNCHER`.
 *
 * Default: "direct" (existing behaviour on addnewfeature / NUC).
 * Opt-in: "bridge" (claudeControl hub — Claude runs on user's device).
 *
 * Both modules export the same named functions with the same signatures,
 * so consumers can write code once against this common surface:
 *
 *   import { getClaudeLauncher } from '@automate/feedback-lib';
 *   const launcher = getClaudeLauncher();
 *   const { claudeSessionId } = launcher.launchFeedback({...});
 */

import * as direct from './claude-launcher';
import * as bridge from './claude-launcher-bridge';

export type LauncherMode = 'direct' | 'bridge';

export type ClaudeLauncher = typeof direct;

export function getLauncherMode(): LauncherMode {
  const env = (process.env.FEEDBACK_LIB_LAUNCHER || '').toLowerCase().trim();
  if (env === 'bridge') return 'bridge';
  // Any other value (including empty) falls back to the legacy direct path
  // so production addnewfeature behaviour is preserved by default.
  return 'direct';
}

export function getClaudeLauncher(): ClaudeLauncher {
  return getLauncherMode() === 'bridge'
    ? (bridge as unknown as ClaudeLauncher)
    : direct;
}

// Re-export the error class from the bridge module so callers that want to
// distinguish "bridge not ready" from other failures can import it from one
// place instead of reaching into ./claude-launcher-bridge.
export { BridgeDispatchNotReady } from './claude-launcher-bridge';
