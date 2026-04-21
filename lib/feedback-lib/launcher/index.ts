// Public surface of @addnewfeature/feedback-lib-launcher.
//
// Private package that pairs with @claudecontrol/feedback-lib to provide a
// reference FeedbackBackend implementation backed by Claude Code + tmux +
// the automatelinux daemon socket.

// Server-side API route handlers — consumer apps mount these under their
// /api/feedback/* routes to expose the launcher's behaviour.
export {
  handleFeedbackMessage,
  handleFeedbackResponse,
  handleFeedbackSubmit,
  handleFeedbackClose,
  handleFeedbackStatus,
  handleFeedbackSessionEnd,
  handleFeedbackIssues,
  handleFeedbackSessionHistory,
} from './api-handlers';

// App config auto-detection (reads .app-meta.json / derives appName + workDir
// from cwd + git root). Consumer route handlers call this to feed the
// handleFeedback* factories.
export { getAppConfig } from './app-config';

// Lower-level Claude + tmux launch primitives. Kept exported for callers that
// need custom integrations outside the HTTP handlers.
export {
  launchFeedback,
  launchFix,
  launchConclude,
  launchMaintenance,
  sendMessage,
  killFeedback,
  isTmuxAlive,
  checkClaudeAuth,
} from './claude-launcher';
export type {
  LaunchConfig,
  LaunchResult,
  FixConfig,
  ConcludeConfig,
  MaintenanceConfig,
} from './claude-launcher';

// Pluggable launcher selector (direct/tmux vs. bridge). Existing consumers
// that import these keep working unchanged.
export {
  getClaudeLauncher,
  getLauncherMode,
  BridgeDispatchNotReady,
} from './launcher-selector';
export type { ClaudeLauncher, LauncherMode } from './launcher-selector';

// Stop/SessionEnd hook helpers that the api-handlers depend on.
export { waitForResponse, resolveResponse } from './pending-responses';
export { getSessionEnv } from './session-env';

// Static maintenance prompts shipped with addnewfeature. Consumer apps pass
// this to <FeedbackIssuesPage maintenancePrompts={...} />; the core package
// has no knowledge of any specific skill.
export { MAINTENANCE_PROMPTS } from './maintenance-prompts';

// Reference FeedbackBackend implementation that wires the core UI to the
// addnewfeature Next.js /api/feedback/* endpoints. Browser-side helper —
// used by consumer apps' client components.
export { createAddNewFeatureBackend } from './addnewfeature-backend';
