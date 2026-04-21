/**
 * Reference FeedbackBackend implementation.
 *
 * Client-side helper. Speaks to the app's own /api/feedback/* endpoints,
 * which are mounted from this launcher package's handleFeedback* factories.
 * Consumer apps that want the addnewfeature behaviour call
 * `createAddNewFeatureBackend()` and hand the result to <FeedbackChat /> and
 * <FeedbackIssuesPage />.
 */

import type {
  FeedbackBackend,
  SendChatMessageRequest,
  SendChatMessageResponse,
  IssueAction,
  IssueActionResult,
  SessionHistoryResult,
  ListIssuesResult,
} from '../core/api-contract';
import {
  BackendAuthExpiredError,
  BackendSessionExpiredError,
} from '../core/api-contract';
import type { ChatIssue, ChatSubmitResult } from '../core/shared-ui';

export interface AddNewFeatureBackendOptions {
  /** Route prefix. Defaults to "/api/feedback". Override if the consumer app
   *  mounted the handlers under a different base path. */
  basePath?: string;
}

export function createAddNewFeatureBackend(
  opts: AddNewFeatureBackendOptions = {},
): FeedbackBackend {
  const base = opts.basePath ?? '/api/feedback';

  async function jsonPost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData.error === 'auth_expired' || res.status === 401) {
        throw new BackendAuthExpiredError(errData.message);
      }
      if (errData.error === 'session_expired' || res.status === 410) {
        throw new BackendSessionExpiredError(errData.message);
      }
      throw new Error(errData.message || `POST ${path} failed (${res.status})`);
    }
    return res.json();
  }

  async function jsonGet<T>(path: string): Promise<T> {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) {
      throw new Error(`GET ${path} failed (${res.status})`);
    }
    return res.json();
  }

  return {
    async sendChatMessage(request: SendChatMessageRequest): Promise<SendChatMessageResponse> {
      return jsonPost<SendChatMessageResponse>('', request);
    },

    async submitChatIssues(
      issues: ChatIssue[],
      context,
    ): Promise<ChatSubmitResult[]> {
      const data = await jsonPost<{ results: ChatSubmitResult[] }>(
        '/submit',
        { issues, ...context },
      );
      return data.results;
    },

    async getSessionStatus(tmuxSession: string) {
      return jsonGet<{ alive: boolean }>(
        `/status?tmuxSession=${encodeURIComponent(tmuxSession)}`,
      );
    },

    async closeSession(tmuxSession: string): Promise<void> {
      await jsonPost<{ ok: boolean }>('/close', { tmuxSession });
    },

    closeSessionOnUnload(tmuxSession: string): void {
      const body = JSON.stringify({ tmuxSession });
      navigator.sendBeacon(
        `${base}/close`,
        new Blob([body], { type: 'application/json' }),
      );
    },

    async listIssues(appOverride?: string | null): Promise<ListIssuesResult> {
      const qs = appOverride ? `?app=${encodeURIComponent(appOverride)}` : '';
      return jsonGet<ListIssuesResult>(`/issues${qs}`);
    },

    async issueAction(body: IssueAction): Promise<IssueActionResult> {
      return jsonPost<IssueActionResult>('/issues', body);
    },

    async getSessionHistory(
      sessionId: string,
      appOverride?: string | null,
    ): Promise<SessionHistoryResult> {
      const qs = new URLSearchParams({ sessionId });
      if (appOverride) qs.set('app', appOverride);
      return jsonGet<SessionHistoryResult>(`/session-history?${qs.toString()}`);
    },
  };
}
