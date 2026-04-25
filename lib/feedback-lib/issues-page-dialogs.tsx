"use client";

import { useState } from "react";
import type { Issue, IssuesPageLabels } from './issues-page-types';
import { statusBadge } from './shared-ui';

// --- Review Dialog ---

interface ReviewDialogProps {
  trigger: Issue;
  relatedIssues: Issue[];
  labels: IssuesPageLabels;
  isDark: boolean;
  dialogBgClass: string;
  btnClass: string;
  hasNonClosedSibling?: boolean;
  onClose: () => void;
  onConfirm: (selectedNumbers: Set<number>, conclude: boolean) => Promise<void>;
}

export function ReviewDialog({ trigger, relatedIssues, labels, isDark, dialogBgClass, btnClass, hasNonClosedSibling, onClose, onConfirm }: ReviewDialogProps) {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(() => new Set([trigger.issueNumber, ...relatedIssues.map(i => i.issueNumber)]));
  const [conclude, setConclude] = useState(!hasNonClosedSibling);
  const [loading, setLoading] = useState(false);

  function toggleIssue(issueNumber: number) {
    if (issueNumber === trigger.issueNumber) return;
    setSelectedNumbers(prev => {
      const next = new Set(prev);
      if (next.has(issueNumber)) next.delete(issueNumber);
      else next.add(issueNumber);
      return next;
    });
  }

  async function handleConfirm() {
    setLoading(true);
    await onConfirm(selectedNumbers, conclude);
    setLoading(false);
  }

  return (
    <div data-id="review-dialog" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !loading && onClose()}>
      <div data-id="review-dialog-backdrop" className="absolute inset-0 bg-black/50" />
      <div
        data-id="review-dialog-body"
        className={`relative border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 data-id="review-dialog-title" className="text-lg font-bold mb-4">{labels.markReviewed}</h2>

        {/* Trigger issue (always selected, can't deselect) */}
        <label data-id="review-trigger-label" className="flex items-center gap-3 py-2">
          <input data-id="review-trigger-issue" type="checkbox" checked disabled className="w-4 h-4 accent-purple-500" />
          <span data-id="review-trigger-text" className="text-sm">
            <span data-id="review-trigger-number" className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{trigger.issueNumber}</span>
            {" "}{trigger.title}
          </span>
        </label>

        {/* Related issues from same session */}
        {relatedIssues.length > 0 && (
          <div data-id="review-related-section" className="mt-3">
            <p data-id="review-related-label" className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {labels.alsoInSession}
            </p>
            {relatedIssues.map(ri => (
              <label data-id={`review-related-label-${ri.issueNumber}`} key={ri.issueNumber} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  data-id={`review-related-${ri.issueNumber}`}
                  type="checkbox"
                  checked={selectedNumbers.has(ri.issueNumber)}
                  onChange={() => toggleIssue(ri.issueNumber)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
                <span data-id={`review-related-text-${ri.issueNumber}`} className="text-sm">
                  <span data-id={`review-related-number-${ri.issueNumber}`} className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{ri.issueNumber}</span>
                  {" "}{ri.title}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Conclude toggle */}
        <label data-id="review-conclude-label" className={`flex items-center gap-3 mt-4 py-2 px-3 rounded-lg cursor-pointer ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
          <input
            data-id="review-conclude-toggle"
            type="checkbox"
            checked={conclude}
            onChange={() => setConclude(prev => !prev)}
            className="w-4 h-4 accent-purple-500 cursor-pointer"
          />
          <span data-id="review-conclude-text" className="text-sm">{labels.conclude}</span>
        </label>

        {/* Actions */}
        <div data-id="review-dialog-actions" className="flex justify-end gap-3 mt-6">
          <button
            data-id="review-cancel"
            onClick={onClose}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
          >
            {labels.cancel}
          </button>
          <button
            data-id="review-confirm"
            onClick={handleConfirm}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
            } disabled:opacity-50 active:scale-95`}
          >
            {loading ? (
              <>{labels.reviewing}</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                {labels.markReviewed}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Regression Dialog ---

interface RegressionDialogProps {
  issue: Issue;
  labels: IssuesPageLabels;
  isDark: boolean;
  dialogBgClass: string;
  btnClass: string;
  onClose: () => void;
  onConfirm: (description: string) => Promise<void>;
}

export function RegressionDialog({ issue, labels, isDark, dialogBgClass, btnClass, onClose, onConfirm }: RegressionDialogProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm(description);
    setLoading(false);
  }

  return (
    <div data-id="regression-dialog" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !loading && onClose()}>
      <div data-id="regression-dialog-backdrop" className="absolute inset-0 bg-black/50" />
      <div
        data-id="regression-dialog-body"
        className={`relative border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 data-id="regression-dialog-title" className="text-lg font-bold mb-2">{labels.markRegression}</h2>
        <p data-id="regression-issue-info" className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <span data-id="regression-issue-number" className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
          {" "}{issue.title}
        </p>
        {issue.description && (
          <p data-id="regression-issue-desc" className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {issue.description}
          </p>
        )}
        <div data-id="regression-spacer" className="mb-3" />
        <textarea
          data-id="regression-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={labels.regressionPlaceholder}
          rows={3}
          autoFocus
          className={`w-full px-3 py-2 rounded-md border text-sm resize-y ${
            isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500" : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
          }`}
        />
        <div data-id="regression-dialog-actions" className="flex justify-end gap-3 mt-4">
          <button
            data-id="regression-cancel"
            onClick={onClose}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
          >
            {labels.cancel}
          </button>
          <button
            data-id="regression-confirm"
            onClick={handleConfirm}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              isDark ? "bg-red-700 hover:bg-red-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            } disabled:opacity-50 active:scale-95`}
          >
            {loading ? (
              <>{labels.markingRegression}</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                {labels.markRegression}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Fix Session Choice Dialog ---

interface FixSessionDialogProps {
  issue: Issue;
  labels: IssuesPageLabels;
  isDark: boolean;
  dialogBgClass: string;
  btnClass: string;
  fixLoading: boolean;
  onClose: () => void;
  onFixSingleIssue: (issue: Issue, resumeSessionId?: string) => void;
}

// --- Batch Fix Session Choice Dialog ---

interface BatchFixSessionDialogProps {
  issues: Issue[];
  sessionIds: string[];
  labels: IssuesPageLabels;
  isDark: boolean;
  dialogBgClass: string;
  btnClass: string;
  fixLoading: boolean;
  onClose: () => void;
  onFixBatch: (resumeSessionId?: string) => void;
}

export function BatchFixSessionDialog({ issues, sessionIds, labels, isDark, dialogBgClass, btnClass, fixLoading, onClose, onFixBatch }: BatchFixSessionDialogProps) {
  return (
    <div data-id="batch-fix-session-dialog" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !fixLoading && onClose()}>
      <div data-id="batch-fix-session-backdrop" className="absolute inset-0 bg-black/50" />
      <div
        data-id="batch-fix-session-body"
        className={`relative border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 data-id="batch-fix-session-title" className="text-lg font-bold mb-3">{labels.fixWithClaude}</h2>

        {/* Selected issues */}
        <p data-id="batch-fix-selected-label" className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {labels.selectedIssues}
        </p>
        <ul data-id="batch-fix-selected-list" className="mb-4 space-y-1">
          {issues.map(i => (
            <li data-id={`batch-fix-selected-${i.issueNumber}`} key={i.issueNumber} className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              <span data-id={`batch-fix-selected-number-${i.issueNumber}`} className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{i.issueNumber}</span>
              {" "}{i.title}
            </li>
          ))}
        </ul>

        {/* Previous sessions */}
        {sessionIds.length > 0 && (
          <div data-id="batch-fix-previous-sessions" className="mb-4">
            <p data-id="batch-fix-previous-sessions-label" className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {labels.previousSessions}
            </p>
            <div data-id="batch-fix-session-list" className="space-y-2">
              {sessionIds.map(sid => (
                <div data-id={`batch-fix-session-item-${sid.slice(0, 8)}`} key={sid} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
                  <span data-id={`batch-fix-session-id-${sid.slice(0, 8)}`} className={`font-mono text-xs break-all ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sid}</span>
                  <button
                    data-id={`batch-resume-session-${sid.slice(0, 8)}`}
                    onClick={() => onFixBatch(sid)}
                    disabled={fixLoading}
                    className={`text-xs px-3 py-1 rounded-md transition-colors cursor-pointer active:scale-95 ${
                      isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                    } disabled:opacity-50`}
                  >
                    {fixLoading ? labels.launching : labels.resumeSession}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div data-id="batch-fix-session-actions" className="flex justify-end gap-3">
          <button
            data-id="batch-fix-session-cancel"
            onClick={onClose}
            disabled={fixLoading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
          >
            {labels.cancel}
          </button>
          <button
            data-id="batch-fix-session-new"
            onClick={() => onFixBatch()}
            disabled={fixLoading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
            } disabled:opacity-50 active:scale-95`}
          >
            {fixLoading ? (
              <>{labels.launching}</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                {labels.newSession}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FixSessionDialog({ issue, labels, isDark, dialogBgClass, btnClass, fixLoading, onClose, onFixSingleIssue }: FixSessionDialogProps) {
  return (
    <div data-id="fix-session-dialog" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !fixLoading && onClose()}>
      <div data-id="fix-session-backdrop" className="absolute inset-0 bg-black/50" />
      <div
        data-id="fix-session-body"
        className={`relative border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 data-id="fix-session-title" className="text-lg font-bold mb-2">{labels.fixWithClaude}</h2>
        <p data-id="fix-session-info" className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <span data-id="fix-session-issue-number" className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
          {" "}{issue.title}
        </p>
        {issue.description && (
          <p data-id="fix-session-desc" className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {issue.description}
          </p>
        )}
        {issue.status === "regression" && issue.insights && (
          <p data-id="fix-session-insights" className={`text-xs mb-1 px-2 py-1 rounded ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
            Regression: {issue.insights}
          </p>
        )}
        <div data-id="fix-session-spacer" className="mb-4" />

        {/* Previous sessions */}
        {issue.claudeSessionIds && issue.claudeSessionIds.length > 0 && (
          <div data-id="fix-previous-sessions" className="mb-4">
            <p data-id="fix-previous-sessions-label" className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {labels.previousSessions}
            </p>
            <div data-id="fix-session-list" className="space-y-2">
              {issue.claudeSessionIds.map(sid => (
                <div data-id={`fix-session-item-${sid.slice(0, 8)}`} key={sid} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
                  <span data-id={`fix-session-id-${sid.slice(0, 8)}`} className={`font-mono text-xs break-all ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sid}</span>
                  <button
                    data-id={`resume-session-${sid.slice(0, 8)}`}
                    onClick={() => onFixSingleIssue(issue, sid)}
                    disabled={fixLoading}
                    className={`text-xs px-3 py-1 rounded-md transition-colors cursor-pointer active:scale-95 ${
                      isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                    } disabled:opacity-50`}
                  >
                    {fixLoading ? labels.launching : labels.resumeSession}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div data-id="fix-session-actions" className="flex justify-end gap-3">
          <button
            data-id="fix-session-cancel"
            onClick={onClose}
            disabled={fixLoading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
          >
            {labels.cancel}
          </button>
          <button
            data-id="fix-session-new"
            onClick={() => onFixSingleIssue(issue)}
            disabled={fixLoading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
            } disabled:opacity-50 active:scale-95`}
          >
            {fixLoading ? (
              <>{labels.launching}</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                {labels.newSession}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
