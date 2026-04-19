"use client";

import { useState, useEffect, useRef } from "react";
import { ChatMessages, ChatIssueChecklist, ChatSubmitResults, ChatThinking, ChatInput, submitChatIssues } from "./shared-ui";
import type { Issue, IssuesPageLabels } from './issues-page-types';

interface RegressionChatModalProps {
  issue: Issue;
  appName: string | null;
  labels: IssuesPageLabels;
  isDark: boolean;
  onClose: () => void;
  onDismiss?: (data: { sessionId: string; tmuxSession: string }) => void;
  fetchIssues: () => void;
  initialSessionId?: string | null;
  initialTmuxSession?: string | null;
}

export function RegressionChatModal({ issue, appName, labels, isDark, onClose, onDismiss, fetchIssues, initialSessionId, initialTmuxSession }: RegressionChatModalProps) {
  const [messages, setMessages] = useState<{ role: string; text: string; staleIssues?: { title: string; description: string }[] }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [tmuxSession, setTmuxSession] = useState<string | null>(initialTmuxSession ?? null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatIssues, setChatIssues] = useState<{ title: string; description: string }[] | null>(null);
  const [checkedIssues, setCheckedIssues] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<{ title: string; issueNumber?: number; success: boolean }[] | null>(null);
  const [maximized, setMaximized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  function dismissModal() {
    if (sessionId && tmuxSession && onDismiss) {
      onDismiss({ sessionId, tmuxSession });
    } else {
      onClose();
    }
  }

  function closeModal() {
    if (tmuxSession) {
      fetch("/api/feedback/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmuxSession }),
      }).catch(() => {});
    }
    onClose();
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = 'auto';
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
            : {
                resumeSessionId: issue.clarifierSessionId,
                priorIssue: {
                  issueNumber: issue.issueNumber,
                  title: issue.title,
                  description: issue.description,
                  status: issue.status,
                  insights: issue.insights,
                },
              }),
          ...(appName && { app: appName }),
          pagePath: "/feedback-lib-issues",
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

  function handleResendStale(staleIssues: { title: string; description: string }[]) {
    setChatIssues(staleIssues);
    setCheckedIssues(new Array(staleIssues.length).fill(true));
  }

  async function handleSubmitIssues() {
    if (!chatIssues || submitting) return;
    const selected = chatIssues.filter((_, i) => checkedIssues[i]);
    if (selected.length === 0) return;

    setSubmitting(true);
    try {
      const results = await submitChatIssues(selected, {
        ...(appName && { app: appName }),
        pagePath: "/feedback-lib-issues",
        pageContext: "Issues",
        sessionId: sessionId || issue.clarifierSessionId,
      });
      setSubmitResults(results);
      setChatIssues(null);
      setCheckedIssues([]);
      fetchIssues();
      if (results.every(r => r.success)) {
        closeModal();
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    } finally {
      setSubmitting(false);
    }
  }

  const dialogBgClass = isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200";

  return (
    <div data-id="regression-chat-modal" className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !loading && dismissModal()}>
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
              <span data-id="chat-modal-issue-number" className="font-mono">#{issue.issueNumber}</span>{" "}{issue.title}
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
              onClick={() => dismissModal()}
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
          <ChatMessages messages={messages} isDark={isDark} selectIssuesLabel={labels.selectIssues} onResendStale={!chatIssues ? handleResendStale : undefined} resendLabel={labels.resend} copyLabel={labels.copy} copiedLabel={labels.copied} />
          {chatIssues && chatIssues.length > 0 && (
            <ChatIssueChecklist
              issues={chatIssues}
              checkedIssues={checkedIssues}
              onToggle={i => setCheckedIssues(prev => { const next = [...prev]; next[i] = !next[i]; return next; })}
              onSubmit={handleSubmitIssues}
              submitting={submitting}
              isDark={isDark}
              selectLabel={labels.selectIssues}
              submitLabel={labels.chatSubmit}
              submittingLabel={labels.chatSubmitting}
            />
          )}
          {submitResults && <ChatSubmitResults results={submitResults} isDark={isDark} />}
          {loading && <ChatThinking isDark={isDark} label={labels.chatThinking} />}
          <div data-id="chat-modal-scroll-anchor" ref={messagesEndRef} />
        </div>

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          sendDisabled={loading}
          inputDisabled={loading}
          isDark={isDark}
          placeholder={labels.chatPlaceholder}
          inputRef={inputRef}
          autoFocus
        />
      </div>
    </div>
  );
}
