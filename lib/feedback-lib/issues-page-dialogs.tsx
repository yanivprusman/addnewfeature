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
  onClose: () => void;
  onConfirm: (selectedNumbers: Set<number>, conclude: boolean) => Promise<void>;
}

export function ReviewDialog({ trigger, relatedIssues, labels, isDark, dialogBgClass, btnClass, onClose, onConfirm }: ReviewDialogProps) {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(() => new Set([trigger.issueNumber, ...relatedIssues.map(i => i.issueNumber)]));
  const [conclude, setConclude] = useState(true);
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
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">{labels.markReviewed}</h2>

        {/* Trigger issue (always selected, can't deselect) */}
        <label className="flex items-center gap-3 py-2">
          <input data-id="review-trigger-issue" type="checkbox" checked disabled className="w-4 h-4 accent-purple-500" />
          <span className="text-sm">
            <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{trigger.issueNumber}</span>
            {" "}{trigger.title}
          </span>
        </label>

        {/* Related issues from same session */}
        {relatedIssues.length > 0 && (
          <div className="mt-3">
            <p className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {labels.alsoInSession}
            </p>
            {relatedIssues.map(ri => (
              <label key={ri.issueNumber} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  data-id={`review-related-${ri.issueNumber}`}
                  type="checkbox"
                  checked={selectedNumbers.has(ri.issueNumber)}
                  onChange={() => toggleIssue(ri.issueNumber)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
                <span className="text-sm">
                  <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{ri.issueNumber}</span>
                  {" "}{ri.title}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Conclude toggle */}
        <label className={`flex items-center gap-3 mt-4 py-2 px-3 rounded-lg cursor-pointer ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
          <input
            data-id="review-conclude-toggle"
            type="checkbox"
            checked={conclude}
            onChange={() => setConclude(prev => !prev)}
            className="w-4 h-4 accent-purple-500 cursor-pointer"
          />
          <span className="text-sm">{labels.conclude}</span>
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
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
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-2">{labels.markRegression}</h2>
        <p className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
          {" "}{issue.title}
        </p>
        {issue.description && (
          <p className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {issue.description}
          </p>
        )}
        <div className="mb-3" />
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
        <div className="flex justify-end gap-3 mt-4">
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

export function FixSessionDialog({ issue, labels, isDark, dialogBgClass, btnClass, fixLoading, onClose, onFixSingleIssue }: FixSessionDialogProps) {
  return (
    <div data-id="fix-session-dialog" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !fixLoading && onClose()}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-2">{labels.fixWithClaude}</h2>
        <p className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
          {" "}{issue.title}
        </p>
        {issue.description && (
          <p className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {issue.description}
          </p>
        )}
        {issue.status === "regression" && issue.insights && (
          <p className={`text-xs mb-1 px-2 py-1 rounded ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
            Regression: {issue.insights}
          </p>
        )}
        <div className="mb-4" />

        {/* Previous sessions */}
        {issue.claudeSessionIds && issue.claudeSessionIds.length > 0 && (
          <div className="mb-4">
            <p className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {labels.previousSessions}
            </p>
            <div className="space-y-2">
              {issue.claudeSessionIds.map(sid => (
                <div key={sid} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
                  <span className={`font-mono text-xs break-all ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sid}</span>
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
        <div className="flex justify-end gap-3">
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
