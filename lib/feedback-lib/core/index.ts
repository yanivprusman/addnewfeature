// Public surface of @claudecontrol/feedback-lib.
//
// Consumer apps import the UI components and pass a FeedbackBackend
// implementation as a prop. The launcher package (private to addnewfeature)
// provides the reference FeedbackBackend that wires these UIs to the Claude
// Code + tmux + daemon pipeline.

export { FeedbackChat, setFeedbackPageContext } from './FeedbackChat';
export type { FeedbackLabels } from './FeedbackChat';

export { FeedbackIssuesPage } from './FeedbackIssuesPage';
export type { Issue, IssuesPageLabels, MaintenancePrompt } from './issues-page-types';

export { feedbackTranslations } from './i18n';
export { issuesTranslations } from './issues-page-i18n';

export { ProdToggle, useProdPreview, useIsProd } from './prod-preview';

export { feedbackIssuesMetadata, generateFeedbackIssuesMetadata } from './feedback-issues-metadata';

export {
  BackendAuthExpiredError,
  BackendSessionExpiredError,
} from './api-contract';

export type {
  FeedbackBackend,
  SendChatMessageRequest,
  SendChatMessageResponse,
  IssueAction,
  IssueActionResult,
  CreateIssueResult,
  FixResult,
  MaintenanceResult,
  ReviewedResult,
  GenericOkResult,
  HistoryMessage,
  SessionHistoryResult,
  ListIssuesResult,
} from './api-contract';

export type { ChatIssue, ChatSubmitResult } from './shared-ui';
