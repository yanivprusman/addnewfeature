// i18n translations
export { feedbackTranslations } from './i18n';

// Server-side API route handlers
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

// App config auto-detection
export { getAppConfig } from './app-config';

// Page context setter (call from app to track active tab/section)
export { setFeedbackPageContext } from './FeedbackChat';

// Prod-preview toggle (P key)
export { ProdToggle, useProdPreview, useIsProd } from './prod-preview';

// Lower-level server utilities (for custom integrations)
export { launchFeedback, launchFix, launchConclude, sendMessage, killFeedback, isTmuxAlive } from './claude-launcher';
export type { LaunchConfig, LaunchResult, FixConfig, ConcludeConfig } from './claude-launcher';
export { waitForResponse, resolveResponse } from './pending-responses';
export { getSessionEnv } from './session-env';
