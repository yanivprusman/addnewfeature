export interface Issue {
  issueNumber: number;
  title: string;
  description: string;
  status: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  insights?: string;
  claudeSessionId?: string;
  claudeSessionIds?: string[];
  clarifierSessionId?: string;
  claudeLaunchDir?: string;
}

export interface IssuesPageLabels {
  pageTitle: string;
  loading: string;
  error: string;
  noIssues: string;
  open: string;
  closed: string;
  inProgress: string;
  review: string;
  regression: string;
  edit: string;
  save: string;
  cancel: string;
  fixWithClaude: string;
  markReviewed: string;
  fixed: string;
  notFixed: string;
  notWorking: string;
  resumeClarifierSession: string;
  markRegression: string;
  clearRegression: string;
  regressionPlaceholder: string;
  markingRegression: string;
  conclude: string;
  alsoInSession: string;
  launching: string;
  reviewing: string;
  refresh: string;
  close: string;
  closing: string;
  delete: string;
  deleteConfirm: string;
  maintenance: string;
  maintenanceLaunch: string;
  maintenanceLaunching: string;
  maintenanceLaunched: string;
  resumeSession: string;
  newSession: string;
  previousSessions: string;
  resumeChat: string;
  chatPlaceholder: string;
  chatThinking: string;
  loadingHistory: string;
  noSessionHistory: string;
  sendMessage: string;
  selectIssues: string;
  chatSubmit: string;
  chatSubmitting: string;
  fixInOriginalSession: string;
  newFixSession: string;
  authExpired: string;
}

export interface ReviewDialogState {
  trigger: Issue;
  relatedIssues: Issue[];
  selectedNumbers: Set<number>;
  conclude: boolean;
}

export interface MaintenancePrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
