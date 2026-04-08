"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { feedbackTranslations } from "./i18n";
import { ProdToggle, useProdPreview } from "./prod-preview";
import { useSystemDark } from "./shared-ui";

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
  // 2. Scan DOM for all active tab elements (supports nested tabs, e.g. "Claude > All")
  const activeTabs = document.querySelectorAll('[data-active-tab]');
  if (activeTabs.length) {
    const parts: string[] = [];
    activeTabs.forEach(el => {
      const val = el.getAttribute('data-active-tab');
      if (val) parts.push(val);
    });
    if (parts.length) return parts.join(' > ');
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
    <div data-id="stale-issues" className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2 opacity-50`}>
      <p data-id="stale-issues-label" className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</p>
      {issues.map((issue, j) => (
        <div key={j} data-id={`stale-issue-${j}`} className="flex items-start gap-2 p-2">
          <input data-id={`stale-issue-check-${j}`} type="checkbox" checked disabled className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600" />
          <div data-id={`stale-issue-content-${j}`} className="flex-1 min-w-0">
            <p data-id={`stale-issue-title-${j}`} className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
            <p
              data-id={`stale-issue-desc-${j}`}
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
  sessionExpired: string;
  goToIssuesPrompt: string;
  goToIssuesYes: string;
  goToIssuesNo: string;
  fullScreen: string;
  exitFullScreen: string;
  authExpired: string;
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
  sessionExpired: "Your previous session could not be restored. Starting a new conversation.",
  goToIssuesPrompt: "Issues submitted! Would you like to view them on the Issues page?",
  goToIssuesYes: "View Issues Page",
  goToIssuesNo: "Close",
  fullScreen: "Full Screen",
  exitFullScreen: "Exit Full Screen",
  authExpired: "Claude authentication expired. Run /login in a Claude Code session to refresh.",
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

function openIssuesTab(url: string, target = 'feedback-issues') {
  const w = window.open(url, target);
  w?.focus();
}

// -----------------------------------------------------------------------------
// Module-level bubble right-click handling (issue #122)
//
// We install a document-level `contextmenu` listener at module load time
// (when this file is imported), BEFORE any React component mounts. The
// listener checks if the event target is inside the bubble and, if so,
// prevents the browser's native context menu and invokes the component's
// open callback via a module-scope ref.
//
// Why this module-level approach instead of `onContextMenu` / `useEffect`
// / a ref callback:
//   - React 19 + Next.js 16 + Chrome's "Duplicate tab" was observed to NOT
//     fire ref callbacks or effects for the SSR'd bubble element in the
//     duplicated tab (`__ctxMenuAttached` stayed undefined, `getEventListeners`
//     returned {}). The listener must be attached independently of React's
//     component lifecycle.
//   - The component registers its `handleOpen` into `bubbleOpenCallback`
//     during render (synchronous body assignment). Even if effects or refs
//     don't fire, the render function IS called, so the callback is set.
// -----------------------------------------------------------------------------

const bubbleOpenCallback: { current: (() => void) | null } = { current: null };

if (typeof window !== 'undefined') {
  const w = window as unknown as {
    __fcCtxInstalled?: boolean;
    __fcHydrationChecked?: boolean;
  };
  if (!w.__fcCtxInstalled) {
    w.__fcCtxInstalled = true;
    document.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('[data-id="feedback-chat-bubble"]')) return;
      e.preventDefault();
      bubbleOpenCallback.current?.();
    });
  }

  // Orphan-bubble detection + visible loading state: in Chrome's "Duplicate
  // tab" flow (React 19 + Next.js 16), FeedbackChat was observed to SSR but
  // never hydrate in the duplicated tab — the bubble existed in the DOM
  // with no React fiber attached (issue #122). While waiting to confirm
  // hydration, we mark the bubble with `data-fc-loading="true"` which the
  // injected CSS renders as a grayed-out pulsing disc with a `wait` cursor
  // — the user can see that the widget is not ready and knows to wait.
  // Poll for a fiber; once present, remove the loading mark. If no fiber
  // appears after ~600ms, reload the page (up to two attempts with
  // different navigation mechanisms) to force re-hydration. A per-session
  // counter prevents reload loops. If recovery fails, the loading state
  // stays set — that's accurate UX (the widget really doesn't work) and
  // beats the old "looks normal but silently does nothing" behavior.
  if (!w.__fcHydrationChecked) {
    w.__fcHydrationChecked = true;
    const RELOAD_KEY = '__fcReloadCount';
    const POLL_MS = 50;
    const MAX_POLLS = 12; // ~600ms total

    // Inject loading-state CSS once per document.
    const style = document.createElement('style');
    style.textContent = `
[data-id="feedback-chat-bubble"][data-fc-loading="true"] {
  cursor: wait !important;
}
[data-id="feedback-chat-bubble"][data-fc-loading="true"] > span:first-child {
  animation: fc-loading-pulse 1.2s ease-in-out infinite;
  filter: grayscale(0.8);
}
@keyframes fc-loading-pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.45; }
}
`;
    if (document.head) document.head.appendChild(style);

    // Mark any existing bubble synchronously at module load — before the
    // first poll runs. In the healthy case React will commit a fiber
    // within ~50ms and the mark is removed, typically imperceptible. In
    // the broken (duplicated tab) case the mark persists so the user sees
    // the disabled state immediately.
    document.querySelectorAll('[data-id="feedback-chat-bubble"]').forEach(el => {
      (el as HTMLElement).setAttribute('data-fc-loading', 'true');
    });

    let polls = 0;
    const poll = () => {
      polls++;
      const bubble = document.querySelector('[data-id="feedback-chat-bubble"]') as HTMLElement | null;
      if (bubble && Object.keys(bubble).some(k => k.startsWith('__reactFiber'))) {
        // Healthy hydration — remove the loading state and stop polling.
        bubble.removeAttribute('data-fc-loading');
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }
      // Still no fiber — ensure the loading mark is applied. Handles late-
      // mounted bubbles that weren't in the DOM at module load.
      if (bubble && !bubble.hasAttribute('data-fc-loading')) {
        bubble.setAttribute('data-fc-loading', 'true');
      }
      if (polls < MAX_POLLS) {
        setTimeout(poll, POLL_MS);
        return;
      }
      // Gave up waiting for a fiber. Leave data-fc-loading in place and try
      // to recover via reload.
      if (!bubble) return; // no bubble at all — nothing to recover
      const count = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      if (count === 0) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      } else if (count === 1) {
        sessionStorage.setItem(RELOAD_KEY, '2');
        // Different cache/history semantics than reload() — observed to
        // succeed in chains of tab duplications where reload() fails.
        window.location.replace(window.location.href);
      } else {
        console.warn('[feedback-lib] Bubble did not hydrate after 2 reload attempts');
      }
    };
    setTimeout(poll, POLL_MS);
  }
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
      <div data-id="feedback-chat-wrapper" style={preview ? { display: 'none' } : undefined}>
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
  const [fullScreen, setFullScreen] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasSession = sessionId !== null;
  const [isOnIssuesPage, setIsOnIssuesPage] = useState(false);
  useEffect(() => {
    setIsOnIssuesPage(window.location.pathname === issuesPath);
  }, [issuesPath]);

  // On the issues page, feedback targets addnewfeature (the issues page is a feedback-lib feature).
  // On all other pages, no override — the API route's appName determines the target.
  const appOverride = isOnIssuesPage ? 'addnewfeature' : undefined;

  // Scope sessionStorage key by page context — issues page may target a different app,
  // so it needs its own independent session. sessionStorage is per-tab, so each browser
  // tab automatically gets an independent clarifier session.
  const [storageKey] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname === issuesPath
      ? `${STORAGE_KEY_BASE}-issues`
      : STORAGE_KEY_BASE
  );

  // Persist session to sessionStorage whenever it changes
  useEffect(() => {
    const sid = sessionId || resumeId;
    if (sid) {
      const data: PersistedSession = {
        sessionId: sid,
        tmuxSession: tmuxSession || '',
        messages,
        ...(issues && issues.length > 0 && { issues, checkedIssues }),
      };
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    }
  }, [storageKey, sessionId, tmuxSession, resumeId, messages, issues, checkedIssues]);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    if (restoredSession) return;
    setRestoredSession(true);

    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;

    try {
      const data: PersistedSession = JSON.parse(stored);
      if (!data.sessionId) return;

      // Always restore messages and issues from sessionStorage
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
      sessionStorage.removeItem(storageKey);
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
          // Tmux died — preserve sessionId for resume silently; next user
          // message will resume the prior session without any UI noise.
          setResumeId(sessionId);
          setSessionId(null);
          setTmuxSession(null);
          setHookWarning(null);
        }
      } catch { /* ignore fetch errors */ }
    }, 15_000);
    return () => clearInterval(interval);
  }, [hasSession, tmuxSession, sessionId]);

  // Clean up tmux on page unload via sendBeacon (sessionStorage is NOT cleared — resume will restore the session on reload)
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

  const handleOpen = useCallback(() => {
    setOpen(true);
    setMessages(prev => prev.length === 0 ? [{ role: "assistant", text: labels.greeting }] : prev);
  }, [labels.greeting]);

  // Register the current handleOpen into the module-scope callback so the
  // document-level contextmenu listener can invoke it. Done during render
  // (not in a hook) because render runs even in contexts where React refs
  // / effects did not fire for the bubble element (issue #122).
  bubbleOpenCallback.current = handleOpen;

  function handleClose() {
    setFullScreen(false);
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
    sessionStorage.removeItem(storageKey);
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
          ...(appOverride && { app: appOverride }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'auth_expired') {
          setMessages((prev) => [...prev, { role: "assistant", text: labels.authExpired }]);
          return;
        }
        if (data.error === 'session_expired') {
          // Session file gone — notify user and reset to fresh state
          setMessages((prev) => [...prev, { role: "assistant", text: labels.sessionExpired }]);
          setResumeId(null);
          setIssues(null);
          setCheckedIssues([]);

          sessionStorage.removeItem(storageKey);
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
      console.log('[FeedbackChat] API response:', { response: data.response?.slice(0, 200), issues: !!data.issues, sessionId: data.sessionId });
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

      console.log('[FeedbackChat] displayText:', displayText?.slice(0, 200), 'truthy:', !!displayText);
      if (displayText) {
        setMessages((prev) => [...prev, { role: "assistant", text: displayText }]);
      }

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
        body: JSON.stringify({ issues: selected, pagePath: getFullPagePath(), pageContext: getPageContext(), sessionId: sessionId || resumeId, ...(appOverride && { app: appOverride }) }),
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
    if (!isOnIssuesPage) {
      openIssuesTab(issuesPath || '/issues');
    } else if (!appOverride || new URLSearchParams(window.location.search).get('app') === appOverride) {
      // Already viewing the target app's issues — just refresh data
      window.dispatchEvent(new Event('feedback-issues-refresh'));
    } else {
      // On another app's issues page — open target app's issues in a separate tab
      const w = window.open(`/issues?app=${appOverride}`, `${appOverride}-issues`);
      w?.focus();
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
        body: JSON.stringify({ action: "create", title: directTitle, description: directDesc, pagePath: getFullPagePath(), pageContext: getPageContext(), ...(appOverride && { app: appOverride }) }),
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
        data-id="feedback-chat-bubble"
        className="fixed bottom-6 end-6 z-[10001] w-14 h-14 rounded-full [&:hover>span:first-child]:border-indigo-400"
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
        <span data-id="feedback-bubble-icon" className={`w-full h-full ${accent} text-white rounded-full shadow-lg flex items-center justify-center opacity-50 pointer-events-none border-2 border-indigo-400/50 transition-colors`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        {/* Session active indicator dot */}
        {hasSession && (
          <span data-id="session-indicator" className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full pointer-events-none" />
        )}
      </div>
    );
  }

  return (
    <div data-id="feedback-chat" className={`fixed z-[10001] ${fullScreen ? 'inset-0' : 'bottom-6 end-6 w-96 max-h-[min(32rem,calc(100dvh-3rem))] rounded-2xl'} ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-2xl border flex flex-col overflow-hidden`}>
      {/* Header */}
      <div data-id="chat-header" className={`flex items-center justify-between px-4 py-3 ${accentBase} text-white`}>
        <div data-id="chat-header-left" className="flex items-center gap-2">
          <span data-id="chat-title-text" className="font-semibold text-sm">{labels.title}</span>
          {hasSession && (
            <span data-id="chat-session-status" className="flex items-center gap-1 text-xs opacity-80">
              <span data-id="chat-session-dot" className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              {labels.sessionActive}
            </span>
          )}
        </div>
        <div data-id="chat-header-right" className="flex items-center gap-2">
          {hasSession && (
            <button data-id="end-session" onClick={handleEndSession} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.endSession}>
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
          <button data-id="new-chat" onClick={handleNewChat} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.newChat}>
            {labels.newChat}
          </button>
          {issuesPath && (
            <button data-id="view-issues" onClick={handleGoToIssues} className="text-xs text-indigo-200 hover:text-white transition-colors" title={labels.viewIssues}>
              {labels.viewIssues}
            </button>
          )}
          <button data-id="fullscreen-toggle" onClick={() => setFullScreen(f => !f)} className="text-indigo-200 hover:text-white transition-colors" title={fullScreen ? labels.exitFullScreen : labels.fullScreen}>
            {fullScreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
          <button data-id="close-chat" onClick={handleClose} className="text-indigo-200 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hook warning banner */}
      {hookWarning && (
        <div data-id="hook-warning" className={`px-3 py-2 text-xs ${isDark ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800' : 'bg-yellow-50 text-yellow-800 border-yellow-200'} border-b`}>
          {hookWarning}
        </div>
      )}

      {directMode ? (
        /* Direct issue creation form */
        <div data-id="direct-issue-form" className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p data-id="direct-form-label" className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.directTitle}</p>
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
            <div data-id="direct-submit-results" className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
              {submitResults.map((result, i) => (
                <p key={i} data-id={`direct-result-${i}`} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {result.success ? `${labels.issueSubmitted}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
                </p>
              ))}
            </div>
          )}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div data-id="post-submit-prompt" className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div className="flex gap-2">
                <button data-id="go-to-issues" onClick={handleGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button data-id="dismiss-prompt" onClick={handlePostSubmitCleanup} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
        {/* Messages */}
        <div data-id="messages-area" className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${fullScreen ? '' : 'min-h-[12rem] max-h-[20rem]'}`}>
          {messages.map((msg, i) => (
            msg.staleIssues ? (
              <StaleIssueList key={i} issues={msg.staleIssues} isDark={isDark} label={labels.selectIssues} />
            ) : (
              <div key={i} data-id={`chat-message-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div data-id={`chat-bubble-${i}`} className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${msg.role === "user" ? `${accentBase} text-white` : `${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}`}>
                  {msg.text}
                </div>
              </div>
            )
          ))}

          {/* Active issue checklist */}
          {issues && issues.length > 0 && (
            <div data-id="issue-checklist" className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.selectIssues}</p>
              {issues.map((issue, i) => (
                <label key={i} data-id={`issue-label-${i}`} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'} transition-colors`}>
                  <input data-id={`issue-check-${i}`} type="checkbox" checked={checkedIssues[i] ?? true} onChange={() => toggleIssue(i)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div data-id={`issue-content-${i}`} className="flex-1 min-w-0">
                    <p data-id={`issue-title-${i}`} className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
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
                data-id="submit-issues"
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
            <div data-id="submit-results" className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
              {submitResults.map((result, i) => (
                <p key={i} data-id={`submit-result-${i}`} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {result.success ? `${labels.issueSubmitted}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
                </p>
              ))}
            </div>
          )}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div data-id="chat-post-submit-prompt" className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div className="flex gap-2">
                <button data-id="chat-go-to-issues" onClick={handleGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button data-id="chat-dismiss-prompt" onClick={handlePostSubmitCleanup} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}

          {loading && (
            <div data-id="chat-thinking" className="flex justify-start">
              <div data-id="chat-thinking-text" className={`${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'} px-3 py-2 rounded-xl text-sm`}>{labels.thinking}</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div data-id="chat-input-area" className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-200'} px-3 py-2 flex gap-2`}>
          <textarea
            data-id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            rows={1}
            className={`flex-1 resize-none rounded-lg border ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
          />
          <button
            data-id="chat-send"
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
