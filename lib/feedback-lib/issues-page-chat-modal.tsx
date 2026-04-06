"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { StaleIssueList } from "./FeedbackChat";
import type { Issue, IssuesPageLabels } from './issues-page-types';

interface RegressionChatModalProps {
  issue: Issue;
  appName: string | null;
  labels: IssuesPageLabels;
  isDark: boolean;
  /** All issues from the parent list — used to look up claudeLaunchDir for fix operations */
  parentIssues: Issue[];
  onClose: (pendingFix?: { issueNumbers: Set<number>; resumeSessionId: string } | null) => void;
  onFixIssues: (successIssues: { number: number; title: string; claudeLaunchDir?: string }[], resumeSessionId?: string) => Promise<boolean>;
  fetchIssues: () => void;
}

export function RegressionChatModal({ issue, appName, labels, isDark, parentIssues, onClose, onFixIssues, fetchIssues }: RegressionChatModalProps) {
  const [messages, setMessages] = useState<{ role: string; text: string; staleIssues?: { title: string; description: string }[] }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tmuxSession, setTmuxSession] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatIssues, setChatIssues] = useState<{ title: string; description: string }[] | null>(null);
  const [checkedIssues, setCheckedIssues] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<{ title: string; issueNumber?: number; success: boolean }[] | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, chatIssues, submitResults]);

  // Load chat history on mount
  useEffect(() => {
    if (!issue.clarifierSessionId) return;
    setHistoryLoading(true);
    fetch(`/api/feedback/session-history?sessionId=${encodeURIComponent(issue.clarifierSessionId)}${appName ? `&app=${appName}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data.found && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [issue.clarifierSessionId, appName]);

  // Cleanup tmux session on unmount
  useEffect(() => {
    return () => {
      // tmuxSession is captured by the cleanup closure at the time the effect re-runs
    };
  }, []);

  function closeModal(skipPreserve = false) {
    // Preserve same-session fix option for issues submitted from the chat
    let pendingFix: { issueNumbers: Set<number>; resumeSessionId: string } | null = null;
    if (!skipPreserve && submitResults) {
      const successNumbers = submitResults.filter(r => r.success && r.issueNumber).map(r => r.issueNumber!);
      if (successNumbers.length > 0) {
        let resumeId: string | null = null;
        const match = parentIssues.find(i => successNumbers.includes(i.issueNumber) && i.claudeSessionIds?.length);
        if (match) resumeId = match.claudeSessionIds![match.claudeSessionIds!.length - 1];
        else if (issue.claudeSessionIds?.length) resumeId = issue.claudeSessionIds[issue.claudeSessionIds.length - 1];
        if (resumeId) pendingFix = { issueNumbers: new Set(successNumbers), resumeSessionId: resumeId };
      }
    }
    if (tmuxSession) {
      fetch("/api/feedback/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmuxSession }),
      }).catch(() => {});
    }
    onClose(pendingFix);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    // Move current active issues to stale before sending new message
    if (chatIssues && chatIssues.length > 0) {
      setMessages(prev => [...prev, { role: "assistant", text: "", staleIssues: chatIssues }, { role: "user", text }]);
      setChatIssues(null);
      setCheckedIssues([]);
    } else {
      setMessages(prev => [...prev, { role: "user", text }]);
    }
    setLoading(true);
    setSubmitResults(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          ...(sessionId && tmuxSession
            ? { sessionId, tmuxSession }
            : { resumeSessionId: issue.clarifierSessionId }),
          ...(appName && { app: appName }),
          pagePath: "/issues",
          pageContext: "Issues",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'session_expired') {
          setMessages(prev => [...prev, { role: "assistant", text: labels.noSessionHistory }]);
          setLoading(false);
          return;
        }
        throw new Error(data.message || "Request failed");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setTmuxSession(data.tmuxSession);

      let displayText = data.response || "";
      if (data.issues) {
        displayText = displayText.replace(/```(?:json)?\s*\n[\s\S]*?\n```\s*/gi, "").trim();
        if (displayText === (data.response || "").trim()) {
          displayText = displayText.replace(/\[[\s\S]*\]\s*/g, (match: string) => {
            try { const p = JSON.parse(match); return Array.isArray(p) && p[0]?.title ? "" : match; } catch { return match; }
          }).trim();
        }
      }
      if (displayText) {
        setMessages(prev => [...prev, { role: "assistant", text: displayText }]);
      }
      if (data.issues) {
        setChatIssues(data.issues);
        setCheckedIssues(new Array(data.issues.length).fill(true));
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    }
    setLoading(false);
  }

  async function handleSubmitIssues() {
    if (!chatIssues || submitting) return;
    const selected = chatIssues.filter((_, i) => checkedIssues[i]);
    if (selected.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issues: selected, ...(appName && { app: appName }), pagePath: "/issues", pageContext: "Issues", sessionId: sessionId || issue.clarifierSessionId }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const data = await res.json();
      setSubmitResults(data.results);
      setChatIssues(null);
      setCheckedIssues([]);
      fetchIssues();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    }
    setSubmitting(false);
  }

  async function handleFixIssues(resumeSessionId?: string) {
    if (!submitResults) return;
    const successIssues = submitResults
      .filter(r => r.success && r.issueNumber)
      .map(r => {
        const full = parentIssues.find(i => i.issueNumber === r.issueNumber);
        return { number: r.issueNumber!, title: r.title, claudeLaunchDir: full?.claudeLaunchDir };
      });
    if (successIssues.length === 0) return;

    setFixLoading(true);
    const success = await onFixIssues(successIssues, resumeSessionId);
    if (success) {
      closeModal(true);
    }
    setFixLoading(false);
  }

  // Compute resume session ID for fix buttons
  const fixResumeSessionId = (() => {
    if (submitResults) {
      const successNumbers = submitResults.filter(r => r.success && r.issueNumber).map(r => r.issueNumber!);
      const match = parentIssues.find(i => successNumbers.includes(i.issueNumber) && i.claudeSessionIds?.length);
      if (match) return match.claudeSessionIds![match.claudeSessionIds!.length - 1];
    }
    return issue.claudeSessionIds?.length
      ? issue.claudeSessionIds[issue.claudeSessionIds.length - 1]
      : null;
  })();

  const dialogBgClass = isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200";

  return (
    <div data-id="regression-chat-modal" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !loading && closeModal()}>
      <div data-id="chat-modal-backdrop" className="absolute inset-0 bg-black/50" />
      <div
        data-id="chat-modal-dialog"
        className={`relative shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${maximized ? 'rounded-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' : 'rounded-2xl w-96 max-h-[min(32rem,calc(100dvh-3rem))]'} ${dialogBgClass}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div data-id="chat-modal-header" className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
          <div data-id="chat-modal-header-text" className="flex-1 min-w-0">
            <span data-id="chat-modal-title" className="font-semibold text-sm">{labels.resumeChat}</span>
            <p data-id="chat-modal-subtitle" className="text-xs truncate text-indigo-200">
              <span className="font-mono">#{issue.issueNumber}</span>{" "}{issue.title}
            </p>
          </div>
          <div data-id="chat-modal-header-actions" className="flex items-center gap-1">
            <button
              data-id="chat-modal-maximize"
              onClick={() => setMaximized(m => !m)}
              className="text-indigo-200 hover:text-white transition-colors"
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
            <button
              data-id="chat-modal-close"
              onClick={() => closeModal()}
              disabled={loading}
              className="text-indigo-200 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div data-id="chat-modal-messages" className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[12rem] ${maximized ? '' : 'max-h-[20rem]'}`}>
          {historyLoading && (
            <p data-id="chat-modal-loading" className={`text-sm text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>{labels.loadingHistory}</p>
          )}
          {!historyLoading && messages.length === 0 && (
            <p data-id="chat-modal-no-history" className={`text-sm text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>{labels.noSessionHistory}</p>
          )}
          {messages.map((msg, i) => (
            <Fragment key={i}>
              {msg.text && (
                <div data-id={`chat-modal-msg-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div data-id={`chat-modal-bubble-${i}`} className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-800")
                  }`}>
                    {msg.text}
                  </div>
                </div>
              )}
              {msg.staleIssues && (
                <StaleIssueList issues={msg.staleIssues} isDark={isDark} label={labels.selectIssues} />
              )}
            </Fragment>
          ))}
          {/* Active issue checklist */}
          {chatIssues && chatIssues.length > 0 && (
            <div data-id="chat-modal-issues" className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p data-id="chat-modal-issues-label" className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.selectIssues}</p>
              {chatIssues.map((ci, i) => (
                <label key={i} data-id={`chat-modal-issue-${i}`} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'} transition-colors`}>
                  <input
                    data-id={`chat-modal-issue-check-${i}`}
                    type="checkbox"
                    checked={checkedIssues[i] ?? true}
                    onChange={() => setCheckedIssues(prev => { const next = [...prev]; next[i] = !next[i]; return next; })}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div data-id={`chat-modal-issue-content-${i}`} className="flex-1 min-w-0">
                    <p data-id={`chat-modal-issue-title-${i}`} className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{ci.title}</p>
                    <p data-id={`chat-modal-issue-desc-${i}`} className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} whitespace-pre-wrap`}>
                      {ci.description}
                    </p>
                  </div>
                </label>
              ))}
              <button
                data-id="chat-modal-submit-issues"
                onClick={handleSubmitIssues}
                disabled={submitting || !checkedIssues.some(Boolean)}
                className={`w-full mt-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white text-sm font-medium rounded-lg transition-colors`}
              >
                {submitting ? labels.chatSubmitting : labels.chatSubmit}
              </button>
            </div>
          )}

          {/* Submit results */}
          {submitResults && (
            <div data-id="chat-modal-results" className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
              {submitResults.map((result, i) => (
                <p key={i} data-id={`chat-modal-result-${i}`} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {result.success ? `Issue #${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
                </p>
              ))}
            </div>
          )}

          {/* Fix action buttons after successful submit */}
          {submitResults && submitResults.some(r => r.success) && (
            <div data-id="chat-modal-fix-actions" className="flex gap-2 flex-wrap">
              {fixResumeSessionId ? (
                <button
                  data-id="chat-fix-original-session"
                  onClick={() => handleFixIssues(fixResumeSessionId)}
                  disabled={fixLoading}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                  } disabled:opacity-50`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                  {fixLoading ? labels.launching : labels.fixInOriginalSession}
                </button>
              ) : null}
              <button
                data-id="chat-fix-new-session"
                onClick={() => handleFixIssues()}
                disabled={fixLoading}
                className={`flex-1 text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                  isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                } disabled:opacity-50`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                {fixLoading ? labels.launching : labels.newFixSession}
              </button>
            </div>
          )}

          {loading && (
            <div data-id="chat-modal-thinking" className="flex justify-start">
              <div data-id="chat-modal-thinking-text" className={`${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'} px-3 py-2 rounded-xl text-sm`}>
                {labels.chatThinking}
              </div>
            </div>
          )}
          <div data-id="chat-modal-scroll-anchor" ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div data-id="chat-modal-input-area" className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-200'} px-3 py-2 flex gap-2`}>
          <textarea
            data-id="chat-modal-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={labels.chatPlaceholder}
            rows={1}
            autoFocus
            disabled={loading}
            className={`flex-1 resize-none rounded-lg border ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50`}
          />
          <button
            data-id="chat-modal-send"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className={`px-3 py-2 bg-indigo-600 hover:bg-indigo-700 ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white rounded-lg transition-colors`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
