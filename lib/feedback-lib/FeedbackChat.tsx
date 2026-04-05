"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { feedbackTranslations } from "./i18n";
import { ProdToggle, useProdPreview } from "./prod-preview";

const PAGE_CONTEXT_KEY = '__feedbackPageContext';

/** Set the current page context (e.g. active tab name) for issue tracking.
 *  Alternative to using `data-active-tab` DOM attribute — both are detected automatically. */
export function setFeedbackPageContext(context: string | null) {
  (window as unknown as Record<string, unknown>)[PAGE_CONTEXT_KEY] = context;
}

/** Auto-detect page context: checks explicit setter, then scans DOM for data-active-tab. */
function getPageContext(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  // 1. Explicit setter (escape hatch)
  const explicit = (window as unknown as Record<string, unknown>)[PAGE_CONTEXT_KEY];
  if (typeof explicit === 'string' && explicit) return explicit;
  // 2. Scan DOM for active tab element
  const activeTab = document.querySelector('[data-active-tab]');
  if (activeTab) {
    const val = activeTab.getAttribute('data-active-tab');
    if (val) return val;
  }
  return undefined;
}

function getFullPagePath(): string {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  staleIssues?: Issue[];
}

export interface Issue {
  title: string;
  description: string;
}

/** Grayed-out issue checklist used to display previously-proposed issues in chat history. */
export function StaleIssueList({ issues, isDark, label }: { issues: Issue[]; isDark: boolean; label: string }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2 opacity-50`}>
      <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</p>
      {issues.map((issue, j) => (
        <div key={j} className="flex items-start gap-2 p-2">
          <input type="checkbox" checked disabled className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600" />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
            <p
              className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} ${expanded[j] ? '' : 'line-clamp-2'} cursor-pointer whitespace-pre-wrap`}
              onMouseDown={(e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; }}
              onClick={(e) => { const s = mouseRef.current; if (s && (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3)) return; if (window.getSelection()?.toString()) return; setExpanded(prev => ({ ...prev, [j]: !prev[j] })); }}
            >
              {issue.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SubmitResult {
  title: string;
  issueNumber?: number;
  success: boolean;
}

export interface FeedbackLabels {
  greeting: string;
  title: string;
  newChat: string;
  selectIssues: string;
  submit: string;
  submitting: string;
  issueSubmitted: string;
  error: string;
  placeholder: string;
  button: string;
  thinking: string;
  endSession: string;
  sessionActive: string;
  timeoutError: string;
  networkError: string;
  viewIssues: string;
  writeDirectly: string;
  useClarifier: string;
  directTitle: string;
  directTitlePlaceholder: string;
  directDescPlaceholder: string;
  directSubmit: string;
  directCreating: string;
  sessionEnded: string;
  sessionExpired: string;
  goToIssuesPrompt: string;
  goToIssuesYes: string;
  goToIssuesNo: string;
}

const defaultLabels: FeedbackLabels = {
  greeting: "Hi! Use this chat to report bugs, suggest features, or share any feedback with the development team. Describe what's on your mind and I'll help you put together a clear report.",
  title: "Issue Clarifier",
  newChat: "New Chat",
  selectIssues: "Select the issues to submit:",
  submit: "Submit Selected",
  submitting: "Submitting...",
  issueSubmitted: "Issue #",
  error: "Something went wrong. Please try again.",
  placeholder: "Describe your issue or idea...",
  button: "Issue Clarifier",
  thinking: "Thinking...",
  endSession: "End Session",
  sessionActive: "Session active",
  timeoutError: "Claude did not respond in time.",
  networkError: "Network error — check your connection and try again.",
  viewIssues: "View Issues",
  writeDirectly: "Write directly",
  useClarifier: "Use clarifier",
  directTitle: "New Issue",
  directTitlePlaceholder: "Issue title",
  directDescPlaceholder: "Description (optional)",
  directSubmit: "Create Issue",
  directCreating: "Creating...",
  sessionEnded: "Session ended — send a new message to continue where you left off.",
  sessionExpired: "Your previous session could not be restored. Starting a new conversation.",
  goToIssuesPrompt: "Issues submitted! Would you like to view them on the Issues page?",
  goToIssuesYes: "View Issues Page",
  goToIssuesNo: "Close",
};

interface FeedbackChatProps {
  /** Language code for built-in translations (e.g. "en", "he"). Defaults to "en". */
  lang?: string;
  /** Override individual labels (merged on top of lang translations) */
  labels?: Partial<FeedbackLabels>;
  /** Custom accent color class (default: "bg-indigo-600 hover:bg-indigo-700") */
  accentClass?: string;
  /** Color scheme: 'system' follows OS preference, 'light' or 'dark' forces a mode */
  colorScheme?: 'system' | 'light' | 'dark';
  /** Path to the issues page (e.g. "/issues"). If set, shows a link in the header. */
  issuesPath?: string;
}

const STORAGE_KEY_BASE = "feedback-chat-session";

interface PersistedSession {
  sessionId: string;
  tmuxSession: string;
  messages: Message[];
  issues?: Issue[];
  checkedIssues?: boolean[];
}

function useSystemDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}

function openIssuesTab(url: string, target = 'feedback-issues') {
  const w = window.open(url, target);
  w?.focus();
}

export function FeedbackChat(props: FeedbackChatProps = {}) {
  if (process.env.NEXT_PUBLIC_IS_PROD === 'true') return null;
  return <FeedbackChatDev {...props} />;
}

function FeedbackChatDev(props: FeedbackChatProps) {
  const preview = useProdPreview();
  return (
    <>
      <ProdToggle />
      {/* Keep FeedbackChatInner mounted during prod preview to preserve
          conversation state — only hide it visually */}
      <div style={preview ? { display: 'none' } : undefined}>
        <FeedbackChatInner {...props} />
      </div>
    </>
  );
}

function FeedbackChatInner({ lang, labels: labelOverrides, accentClass, colorScheme = 'system', issuesPath = '/issues' }: FeedbackChatProps) {
  const langLabels = lang ? (feedbackTranslations[lang] ?? defaultLabels) : defaultLabels;
  const labels = { ...langLabels, ...labelOverrides };
  const accent = accentClass ?? "bg-indigo-600 hover:bg-indigo-700";
  const accentBase = accent.split(" ")[0]; // e.g. "bg-indigo-600"
  const systemDark = useSystemDark();
  const isDark = colorScheme === 'dark' || (colorScheme !== 'light' && systemDark);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tmuxSession, setTmuxSession] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [checkedIssues, setCheckedIssues] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<SubmitResult[] | null>(null);
  const [hookWarning, setHookWarning] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null);
  const [restoredSession, setRestoredSession] = useState(false);
  const [directMode, setDirectMode] = useState(false);
  const [directTitle, setDirectTitle] = useState("");
  const [directDesc, setDirectDesc] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [showPostSubmitPrompt, setShowPostSubmitPrompt] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasSession = sessionId !== null;
  const [isOnIssuesPage, setIsOnIssuesPage] = useState(false);
  useEffect(() => {
    setIsOnIssuesPage(window.location.pathname === issuesPath);
  }, [issuesPath]);

  // Scope localStorage key by page context — issues page targets addnewfeature,
  // not the host app, so it needs its own independent session.
  const [storageKey] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname === issuesPath
      ? `${STORAGE_KEY_BASE}-issues`
      : STORAGE_KEY_BASE
  );

  // Persist session to localStorage whenever it changes
  useEffect(() => {
    const sid = sessionId || resumeId;
    if (sid) {
      const data: PersistedSession = {
        sessionId: sid,
        tmuxSession: tmuxSession || '',
        messages,
        ...(issues && issues.length > 0 && { issues, checkedIssues }),
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  }, [storageKey, sessionId, tmuxSession, resumeId, messages, issues, checkedIssues]);

  // Restore session from localStorage on mount
  useEffect(() => {
    if (restoredSession) return;
    setRestoredSession(true);

    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    try {
      const data: PersistedSession = JSON.parse(stored);
      if (!data.sessionId) return;

      // Always restore messages and issues from localStorage
      if (data.messages?.length > 0) {
        setMessages(data.messages);
      }
      if (data.issues && data.issues.length > 0) {
        setIssues(data.issues);
        setCheckedIssues(data.checkedIssues ?? new Array(data.issues.length).fill(true));
      }
      if (!data.tmuxSession) {
        // No tmux recorded — set up for resume
        setResumeId(data.sessionId);
        return;
      }

      // Verify the tmux session is still alive
      fetch(`/api/feedback/status?tmuxSession=${encodeURIComponent(data.tmuxSession)}`)
        .then(res => res.json())
        .then(result => {
          if (result.alive) {
            setSessionId(data.sessionId);
            setTmuxSession(data.tmuxSession);
          } else {
            // Tmux dead — keep sessionId for resume
            setResumeId(data.sessionId);
          }
        })
        .catch(() => {
          // Can't check — assume dead, set up for resume
          setResumeId(data.sessionId);
        });
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [restoredSession, storageKey]);

  // Poll session status while active — detect when tmux dies (e.g. SessionEnd hook killed it)
  useEffect(() => {
    if (!hasSession || !tmuxSession) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/feedback/status?tmuxSession=${encodeURIComponent(tmuxSession)}`);
        const data = await res.json();
        if (!data.alive) {
          // Tmux died — preserve sessionId for resume, notify user
          setResumeId(sessionId);
          setSessionId(null);
          setTmuxSession(null);
          setHookWarning(null);
          setMessages(prev => [...prev, { role: "assistant", text: labels.sessionEnded }]);
        }
      } catch { /* ignore fetch errors */ }
    }, 15_000);
    return () => clearInterval(interval);
  }, [hasSession, tmuxSession, sessionId, labels.sessionEnded]);

  // Clean up tmux on page unload via sendBeacon (localStorage is NOT cleared — resume will restore the session)
  useEffect(() => {
    function handleUnload() {
      if (tmuxSession) {
        const body = JSON.stringify({ tmuxSession });
        navigator.sendBeacon("/api/feedback/close", new Blob([body], { type: "application/json" }));
      }
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [tmuxSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, issues, submitResults]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleOpen() {
    setOpen(true);
    if (messages.length === 0) {
      setMessages([{ role: "assistant", text: labels.greeting }]);
    }
  }

  function handleClose() {
    setOpen(false);
  }

  const closeSession = useCallback(() => {
    if (tmuxSession) {
      fetch("/api/feedback/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmuxSession }),
      }).catch(() => {});
    }
    localStorage.removeItem(storageKey);
    setSessionId(null);
    setTmuxSession(null);
    setResumeId(null);
    setHookWarning(null);
  }, [tmuxSession, storageKey]);

  function handleNewChat() {
    closeSession();
    setMessages([{ role: "assistant", text: labels.greeting }]);
    setInput("");
    setLoadingCount(0);
    setIssues(null);
    setCheckedIssues([]);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
  }

  function handleEndSession() {
    closeSession();
    setMessages([{ role: "assistant", text: labels.greeting }]);
    setInput("");
    setLoadingCount(0);
    setIssues(null);
    setCheckedIssues([]);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
    setOpen(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (loading && !sessionId) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (issues && issues.length > 0) {
      setMessages((prev) => [...prev, { role: "assistant", text: "", staleIssues: issues }, { role: "user", text }]);
      setIssues(null);
      setCheckedIssues([]);
    } else {
      setMessages((prev) => [...prev, { role: "user", text }]);
    }
    setLoadingCount(c => c + 1);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          tmuxSession,
          resumeSessionId: !sessionId ? resumeId : undefined,
          pagePath: getFullPagePath(),
          pageContext: getPageContext(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'session_expired') {
          // Session file gone — notify user and reset to fresh state
          setMessages((prev) => [...prev, { role: "assistant", text: labels.sessionExpired }]);
          setResumeId(null);
          setIssues(null);
          setCheckedIssues([]);
      
          localStorage.removeItem(storageKey);
          return;
        }
        if (res.status === 504 || data.error === 'timeout') {
          setMessages((prev) => [...prev, { role: "assistant", text: labels.timeoutError }]);
          // Preserve session info from timeout response
          if (data.sessionId) setSessionId(data.sessionId);
          if (data.tmuxSession) setTmuxSession(data.tmuxSession);
          return;
        }
        throw new Error(data.message || "Request failed");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setTmuxSession(data.tmuxSession);
      setResumeId(null);
      if (data.hookWarning) setHookWarning(data.hookWarning);

      let displayText = data.response;
      if (data.issues) {
        // Strip fenced JSON blocks (```json or plain ```)
        displayText = displayText.replace(/```(?:json)?\s*\n[\s\S]*?\n```\s*/gi, "").trim();
        // Strip raw JSON arrays if no fenced block was found
        if (displayText === data.response.trim()) {
          displayText = displayText.replace(/\[[\s\S]*\]\s*/g, (match: string) => {
            try { const p = JSON.parse(match); return Array.isArray(p) && p[0]?.title ? "" : match; } catch { return match; }
          }).trim();
        }
      }

      setMessages((prev) => [...prev, { role: "assistant", text: displayText }]);

      if (data.issues) {
        setIssues(data.issues);
        setCheckedIssues(new Array(data.issues.length).fill(true));
      }
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message === 'Failed to fetch';
      setMessages((prev) => [...prev, { role: "assistant", text: isNetwork ? labels.networkError : labels.error }]);
    } finally {
      setLoadingCount(c => c - 1);
    }
  }

  async function handleSubmitIssues() {
    if (!issues || submitting) return;

    const selected = issues.filter((_, i) => checkedIssues[i]);
    if (selected.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issues: selected, pagePath: getFullPagePath(), pageContext: getPageContext(), sessionId: sessionId || resumeId, ...(isOnIssuesPage && { app: 'addnewfeature' }) }),
      });

      if (!res.ok) throw new Error("Submit failed");

      const data = await res.json();
      if (data.results?.every((r: SubmitResult) => r.success)) {
        setSubmitResults(data.results);
        setIssues(null);
        setCheckedIssues([]);
        setShowPostSubmitPrompt(true);
      } else {
        setSubmitResults(data.results);
        setIssues(null);
        setCheckedIssues([]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: labels.error }]);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleIssue(index: number) {
    setCheckedIssues((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  // Auto-resize textarea as user types
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleGoToIssues() {
    if (isOnIssuesPage) {
      // Already on the issues page — trigger a data refresh instead of navigating
      window.dispatchEvent(new Event('feedback-issues-refresh'));
    } else {
      openIssuesTab(issuesPath || '/issues');
    }
    handlePostSubmitCleanup();
  }

  function handlePostSubmitCleanup() {
    closeSession();
    setMessages([{ role: "assistant", text: labels.greeting }]);
    setInput("");
    setLoadingCount(0);
    setIssues(null);
    setCheckedIssues([]);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
    setDirectMode(false);
    setOpen(false);
  }

  async function handleDirectSubmit() {
    if (!directTitle.trim() || directLoading) return;
    setDirectLoading(true);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", title: directTitle, description: directDesc, pagePath: getFullPagePath(), pageContext: getPageContext(), ...(isOnIssuesPage && { app: 'addnewfeature' }) }),
      });
      if (!res.ok) throw new Error("Create failed");
      const data = await res.json();
      setSubmitResults([{ title: directTitle, issueNumber: data.issueNumber, success: true }]);
      setDirectTitle("");
      setDirectDesc("");
      setShowPostSubmitPrompt(true);
    } catch {
      setSubmitResults([{ title: directTitle, success: false }]);
    } finally {
      setDirectLoading(false);
    }
  }

  if (!open) {
    return (
      <div
        className="fixed bottom-6 end-6 z-[10001] w-14 h-14 rounded-full [&:hover>span:first-child]:border-indigo-400"
        onContextMenu={(e) => { e.preventDefault(); handleOpen(); }}
        onPointerDown={(e) => {
          if (e.button === 0) {
            const el = e.currentTarget;
            el.style.pointerEvents = 'none';
            const under = document.elementFromPoint(e.clientX, e.clientY);
            el.style.pointerEvents = '';
            if (under) (under as HTMLElement).click();
          }
        }}
        title={labels.button}
      >
        <span className={`w-full h-full ${accent} text-white rounded-full shadow-lg flex items-center justify-center opacity-50 pointer-events-none border-2 border-indigo-400/50 transition-colors`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        {/* Session active indicator dot */}
        {hasSession && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full pointer-events-none" />
        )}
      </div>
    );
  }

  return (
    <div className={`fixed bottom-6 end-6 z-[10001] w-96 max-h-[min(32rem,calc(100dvh-3rem))] ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl shadow-2xl border flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${accentBase} text-white`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{labels.title}</span>
          {hasSession && (
            <span className="flex items-center gap-1 text-xs opacity-80">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              {labels.sessionActive}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasSession && (
            <button onClick={handleEndSession} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.endSession}>
              {labels.endSession}
            </button>
          )}
          <button
            data-id="toggle-direct-mode"
            onClick={() => { setDirectMode(v => !v); setSubmitResults(null); setShowPostSubmitPrompt(false); }}
            className="text-xs text-indigo-200 hover:text-white transition-colors"
          >
            {directMode ? labels.useClarifier : labels.writeDirectly}
          </button>
          <button onClick={handleNewChat} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.newChat}>
            {labels.newChat}
          </button>
          {issuesPath && (
            <button onClick={() => isOnIssuesPage ? window.dispatchEvent(new Event('feedback-issues-refresh')) : openIssuesTab(issuesPath!)} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.viewIssues}>
              {labels.viewIssues}
            </button>
          )}
          <button onClick={handleClose} className="text-indigo-200 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hook warning banner */}
      {hookWarning && (
        <div className={`px-3 py-2 text-xs ${isDark ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800' : 'bg-yellow-50 text-yellow-800 border-yellow-200'} border-b`}>
          {hookWarning}
        </div>
      )}

      {directMode ? (
        /* Direct issue creation form */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.directTitle}</p>
          <input
            data-id="direct-title"
            type="text"
            placeholder={labels.directTitlePlaceholder}
            value={directTitle}
            onChange={e => setDirectTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && directTitle.trim()) handleDirectSubmit(); }}
            className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
            autoFocus
          />
          <textarea
            data-id="direct-description"
            placeholder={labels.directDescPlaceholder}
            value={directDesc}
            onChange={e => setDirectDesc(e.target.value)}
            rows={4}
            className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
          />
          <button
            data-id="direct-submit"
            onClick={handleDirectSubmit}
            disabled={!directTitle.trim() || directLoading}
            className={`w-full px-3 py-2 ${accent} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white text-sm font-medium rounded-lg transition-colors`}
          >
            {directLoading ? labels.directCreating : labels.directSubmit}
          </button>

          {/* Submit results in direct mode */}
          {submitResults && (
            <div className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
              {submitResults.map((result, i) => (
                <p key={i} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {result.success ? `${labels.issueSubmitted}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
                </p>
              ))}
            </div>
          )}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div className="flex gap-2">
                <button onClick={handleGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button onClick={handlePostSubmitCleanup} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[12rem] max-h-[20rem]">
          {messages.map((msg, i) => (
            msg.staleIssues ? (
              <StaleIssueList key={i} issues={msg.staleIssues} isDark={isDark} label={labels.selectIssues} />
            ) : (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${msg.role === "user" ? `${accentBase} text-white` : `${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}`}>
                  {msg.text}
                </div>
              </div>
            )
          ))}

          {/* Active issue checklist */}
          {issues && issues.length > 0 && (
            <div className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.selectIssues}</p>
              {issues.map((issue, i) => (
                <label key={i} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'} transition-colors`}>
                  <input type="checkbox" checked={checkedIssues[i] ?? true} onChange={() => toggleIssue(i)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
                    <p
                      className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} ${expandedIssues[i] ? '' : 'line-clamp-2'} cursor-pointer whitespace-pre-wrap`}
                      onMouseDown={(e) => { mouseDownRef.current = { x: e.clientX, y: e.clientY }; }}
                      onClick={(e) => { e.preventDefault(); const s = mouseDownRef.current; if (s && (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3)) return; if (window.getSelection()?.toString()) return; setExpandedIssues(prev => ({ ...prev, [i]: !prev[i] })); }}
                      data-id={`issue-description-${i}`}
                    >
                      {issue.description}
                    </p>
                  </div>
                </label>
              ))}
              <button
                onClick={handleSubmitIssues}
                disabled={submitting || !checkedIssues.some(Boolean)}
                className={`w-full mt-1 px-3 py-2 ${accent} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white text-sm font-medium rounded-lg transition-colors`}
              >
                {submitting ? labels.submitting : labels.submit}
              </button>
            </div>
          )}

          {/* Submit results */}
          {submitResults && (
            <div className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
              {submitResults.map((result, i) => (
                <p key={i} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {result.success ? `${labels.issueSubmitted}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
                </p>
              ))}
            </div>
          )}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div className="flex gap-2">
                <button onClick={handleGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button onClick={handlePostSubmitCleanup} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className={`${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'} px-3 py-2 rounded-xl text-sm`}>{labels.thinking}</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-200'} px-3 py-2 flex gap-2`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            rows={1}
            className={`flex-1 resize-none rounded-lg border ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || (loading && !sessionId)}
            className={`px-3 py-2 ${accent} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white rounded-lg transition-colors`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        </>
      )}
    </div>
  );
}
