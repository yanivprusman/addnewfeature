"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { feedbackTranslations } from "./i18n";
import { ProdToggle, useProdPreview } from "./prod-preview";
import { useSystemDark, ChatIssue, ChatSubmitResult, ChatMessages, ChatIssueChecklist, ChatSubmitResults, ChatThinking, ChatInput } from "./shared-ui";
import type { FeedbackBackend } from "./api-contract";
import { BackendAuthExpiredError, BackendSessionExpiredError } from "./api-contract";

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
  staleIssues?: ChatIssue[];
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
  resend: string;
  restoreSize: string;
  copy: string;
  copied: string;
}

const defaultLabels: FeedbackLabels = {
  greeting: "Hi! Use this chat to report bugs, suggest features, or share any feedback with the development team. Describe what's on your mind and I'll help you put together a clear report.",
  title: "Issue Clarifier",
  newChat: "New Chat",
  selectIssues: "Suggested issues:",
  submit: "Submit",
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
  resend: "Re-send",
  restoreSize: "Restore default size",
  copy: "Copy",
  copied: "Copied",
};

interface FeedbackChatProps {
  /** Backend implementation — wires this widget to the host app's clarifier routes. */
  backend: FeedbackBackend;
  /** Language code for built-in translations (e.g. "en", "he"). Defaults to "en". */
  lang?: string;
  /** Override individual labels (merged on top of lang translations) */
  labels?: Partial<FeedbackLabels>;
  /** Custom accent color class (default: "bg-indigo-600 hover:bg-indigo-700") */
  accentClass?: string;
  /** Color scheme: 'system' follows OS preference, 'light' or 'dark' forces a mode */
  colorScheme?: 'system' | 'light' | 'dark';
  /** Path to the issues page (e.g. "/feedback-lib-issues"). If set, shows a link in the header. */
  issuesPath?: string;
}

const STORAGE_KEY_BASE = "feedback-chat-session";
const HEARTBEAT_PREFIX = 'feedback-hb-';
const HEARTBEAT_INTERVAL = 5_000;
const HEARTBEAT_STALE = 10_000;
const HEIGHT_STORAGE_KEY = 'feedback-chat-height';
const DEFAULT_HEIGHT_PX = 512; // matches 32rem max
const MIN_HEIGHT_PX = 260;

interface PersistedSession {
  sessionId: string;
  tmuxSession: string;
  messages: Message[];
  issues?: ChatIssue[];
  checkedIssues?: boolean[];
  /** Titles of issues already submitted from this conversation — passed back to
   *  the clarifier so it doesn't re-propose them in subsequent suggestions. */
  submittedIssueTitles?: string[];
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
  // hydration, the CSS below renders any bubble WITHOUT a `data-fc-hydrated`
  // attribute as a grayed-out pulsing disc with a `wait` cursor — the
  // loading state is the *default*. Once the polling detector observes a
  // `__reactFiber*` on the bubble, we add `data-fc-hydrated="true"` which
  // removes the loading state via the `:not()` selector. This avoids any
  // pre-hydration DOM mutation (which caused a React hydration warning in
  // an earlier attempt).
  //
  // If no fiber appears after ~600ms of polling, reload the page (up to
  // two attempts with different navigation mechanisms) to force re-
  // hydration. If recovery fails, the bubble stays in its loading
  // appearance — the widget really doesn't work, and that's more honest
  // than reverting to a "looks normal but silently unresponsive" state.
  if (!w.__fcHydrationChecked) {
    w.__fcHydrationChecked = true;
    const RELOAD_KEY = '__fcReloadCount';
    const POLL_MS = 50;
    const MAX_POLLS = 12; // ~600ms total

    // Inject loading-state CSS once per document. Targeting the negated
    // selector means any bubble without `data-fc-hydrated` is loading —
    // including the one rendered by SSR before React has even run. No
    // pre-hydration DOM mutation is required to apply the state.
    const style = document.createElement('style');
    style.textContent = `
[data-id="feedback-chat-bubble"]:not([data-fc-hydrated]) {
  cursor: wait !important;
}
[data-id="feedback-chat-bubble"]:not([data-fc-hydrated]) > span:first-child {
  animation: fc-loading-pulse 1.2s ease-in-out infinite;
  filter: grayscale(0.8);
}
@keyframes fc-loading-pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.45; }
}
`;
    if (document.head) document.head.appendChild(style);

    let polls = 0;
    const poll = () => {
      polls++;
      const bubble = document.querySelector('[data-id="feedback-chat-bubble"]') as HTMLElement | null;
      if (bubble && Object.keys(bubble).some(k => k.startsWith('__reactFiber'))) {
        // Healthy hydration detected. Adding the attribute post-hydration
        // is safe — React has already finished its initial commit, so
        // external DOM mutations no longer conflict with hydration checks.
        bubble.setAttribute('data-fc-hydrated', 'true');
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }
      if (polls < MAX_POLLS) {
        setTimeout(poll, POLL_MS);
        return;
      }
      // Gave up waiting for a fiber. The bubble still lacks
      // `data-fc-hydrated` so it keeps the visible loading state. Try to
      // recover via reload.
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

export function FeedbackChat(props: FeedbackChatProps) {
  if (process.env.NODE_ENV === 'production') return null;
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

function FeedbackChatInner({ backend, lang, labels: labelOverrides, accentClass, colorScheme = 'system', issuesPath = '/feedback-lib-issues' }: FeedbackChatProps) {
  const langLabels = lang ? (feedbackTranslations[lang] ?? defaultLabels) : defaultLabels;
  const labels = { ...langLabels, ...labelOverrides };
  const accent = accentClass ?? "bg-indigo-600 hover:bg-indigo-700";
  const accentBase = accent.split(" ")[0]; // e.g. "bg-indigo-600"
  const headerBg = (accent.split(" ").find(c => c.startsWith("hover:bg-"))?.replace("hover:", "")) ?? accentBase;
  const systemDark = useSystemDark();
  const isDark = colorScheme === 'dark' || (colorScheme !== 'light' && systemDark);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tmuxSession, setTmuxSession] = useState<string | null>(null);
  const [issues, setIssues] = useState<ChatIssue[] | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);
  const [submitResults, setSubmitResults] = useState<ChatSubmitResult[] | null>(null);
  const [hookWarning, setHookWarning] = useState<string | null>(null);
  const [restoredSession, setRestoredSession] = useState(false);
  const [directMode, setDirectMode] = useState(false);
  const [directTitle, setDirectTitle] = useState("");
  const [directDesc, setDirectDesc] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [showPostSubmitPrompt, setShowPostSubmitPrompt] = useState(false);
  const [submittedIssueTitles, setSubmittedIssueTitles] = useState<string[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
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
  // so it needs its own independent session. Note: sessionStorage is per-tab but is
  // copied on tab duplication — the BroadcastChannel dedup above handles that case.
  const [storageKey] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname === issuesPath
      ? `${STORAGE_KEY_BASE}-issues`
      : STORAGE_KEY_BASE
  );

  // --- Tab dedup via localStorage heartbeat ---
  // When a tab is duplicated, sessionStorage is copied — both tabs would share
  // the same clarifier session. The active tab writes a heartbeat to localStorage
  // (shared across tabs). On restore, if a recent heartbeat from a different tab
  // exists, we know another tab owns the session and skip restoration.
  const tabId = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36)).current;
  const hbKey = `${HEARTBEAT_PREFIX}${storageKey}`;

  // Write heartbeat while session is active
  useEffect(() => {
    const sid = sessionId || resumeId;
    if (!sid) return;
    const write = () => localStorage.setItem(hbKey, JSON.stringify({ t: tabId, ts: Date.now() }));
    write();
    const interval = setInterval(write, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [sessionId, resumeId, hbKey, tabId]);

  // Persist session to sessionStorage whenever it changes
  useEffect(() => {
    const sid = sessionId || resumeId;
    if (sid) {
      const data: PersistedSession = {
        sessionId: sid,
        tmuxSession: tmuxSession || '',
        messages,
        ...(issues && issues.length > 0 && { issues }),
        ...(submittedIssueTitles.length > 0 && { submittedIssueTitles }),
      };
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    }
  }, [storageKey, sessionId, tmuxSession, resumeId, messages, issues, submittedIssueTitles]);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    if (restoredSession) return;
    setRestoredSession(true);

    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;

    try {
      const data: PersistedSession = JSON.parse(stored);
      if (!data.sessionId) return;

      // Check heartbeat — if another tab recently wrote one, it owns this session
      // (happens when sessionStorage is copied via tab duplication)
      try {
        const hb = JSON.parse(localStorage.getItem(hbKey) || '{}');
        if (hb.t && hb.t !== tabId && Date.now() - hb.ts < HEARTBEAT_STALE) {
          sessionStorage.removeItem(storageKey);
          return;
        }
      } catch {}

      // Always restore messages and issues from sessionStorage
      if (data.messages?.length > 0) {
        setMessages(data.messages);
      }
      if (data.issues && data.issues.length > 0) {
        setIssues(data.issues);
      }
      if (data.submittedIssueTitles && data.submittedIssueTitles.length > 0) {
        setSubmittedIssueTitles(data.submittedIssueTitles);
      }
      if (!data.tmuxSession) {
        // No tmux recorded — set up for resume
        setResumeId(data.sessionId);
        return;
      }

      // Verify the tmux session is still alive
      backend.getSessionStatus(data.tmuxSession)
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
  }, [restoredSession, storageKey, hbKey, tabId]);

  // Poll session status while active — detect when tmux dies (e.g. SessionEnd hook killed it)
  useEffect(() => {
    if (!hasSession || !tmuxSession) return;
    const interval = setInterval(async () => {
      try {
        const data = await backend.getSessionStatus(tmuxSession);
        if (!data.alive) {
          // Tmux died — preserve sessionId for resume silently; next user
          // message will resume the prior session without any UI noise.
          setResumeId(sessionId);
          setSessionId(null);
          setTmuxSession(null);
          setHookWarning(null);
        }
      } catch { /* ignore backend errors */ }
    }, 15_000);
    return () => clearInterval(interval);
  }, [backend, hasSession, tmuxSession, sessionId]);

  // Clean up tmux + heartbeat on page unload (sessionStorage is NOT cleared — resume will restore the session on reload)
  useEffect(() => {
    function handleUnload() {
      if (tmuxSession) {
        backend.closeSessionOnUnload(tmuxSession);
      }
      // Clear heartbeat so a reload doesn't see its own stale entry as a foreign tab
      try {
        const hb = JSON.parse(localStorage.getItem(hbKey) || '{}');
        if (hb.t === tabId) localStorage.removeItem(hbKey);
      } catch {}
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [backend, tmuxSession, hbKey, tabId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, issues, submitResults]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Restore user-preferred widget height from localStorage — the dragged size
  // persists across page loads and tabs (cleared by the restore-size button).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HEIGHT_STORAGE_KEY);
      if (!stored) return;
      const h = parseInt(stored, 10);
      if (!isNaN(h) && h >= MIN_HEIGHT_PX) setCustomHeight(h);
    } catch { /* ignore */ }
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    // Measure the widget's actual rendered height — otherwise the first drag
    // jumps from content-sized to DEFAULT_HEIGHT_PX because no inline height
    // is set until the user has dragged at least once.
    const widgetEl = e.currentTarget.parentElement as HTMLElement | null;
    const measured = widgetEl?.getBoundingClientRect().height;
    const startHeight = customHeight ?? (measured && measured > 0 ? measured : Math.min(DEFAULT_HEIGHT_PX, window.innerHeight - 48));
    setIsResizing(true);
    let finalHeight = startHeight;

    const onMove = (ev: PointerEvent) => {
      // Widget is anchored bottom-right — dragging the top edge UP grows it.
      const deltaY = startY - ev.clientY;
      const maxH = window.innerHeight - 48;
      finalHeight = Math.max(MIN_HEIGHT_PX, Math.min(maxH, startHeight + deltaY));
      setCustomHeight(finalHeight);
    };

    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(finalHeight)); } catch { /* ignore */ }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [customHeight]);

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
      backend.closeSession(tmuxSession).catch(() => {});
    }
    sessionStorage.removeItem(storageKey);
    // Clear heartbeat if we own it
    try {
      const hb = JSON.parse(localStorage.getItem(hbKey) || '{}');
      if (hb.t === tabId) localStorage.removeItem(hbKey);
    } catch {}
    setSessionId(null);
    setTmuxSession(null);
    setResumeId(null);
    setHookWarning(null);
  }, [backend, tmuxSession, storageKey, hbKey, tabId]);

  function handleNewChat() {
    closeSession();
    setMessages([{ role: "assistant", text: labels.greeting }]);
    setInput("");
    setLoadingCount(0);
    setIssues(null);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
    setSubmittedIssueTitles([]);
  }

  function handleEndSession() {
    closeSession();
    setMessages([{ role: "assistant", text: labels.greeting }]);
    setInput("");
    setLoadingCount(0);
    setIssues(null);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
    setSubmittedIssueTitles([]);
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
    } else {
      setMessages((prev) => [...prev, { role: "user", text }]);
    }
    setLoadingCount(c => c + 1);
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);

    try {
      let data;
      try {
        data = await backend.sendChatMessage({
          message: text,
          sessionId,
          tmuxSession,
          resumeSessionId: !sessionId ? resumeId : undefined,
          pagePath: getFullPagePath(),
          pageContext: getPageContext(),
          ...(appOverride && { app: appOverride }),
          ...(submittedIssueTitles.length > 0 && { submittedIssueTitles }),
        });
      } catch (err) {
        if (err instanceof BackendAuthExpiredError) {
          setMessages((prev) => [...prev, { role: "assistant", text: labels.authExpired }]);
          return;
        }
        if (err instanceof BackendSessionExpiredError) {
          setMessages((prev) => [...prev, { role: "assistant", text: labels.sessionExpired }]);
          setResumeId(null);
          setIssues(null);
          sessionStorage.removeItem(storageKey);
          return;
        }
        throw err;
      }

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

      if (displayText) {
        setMessages((prev) => [...prev, { role: "assistant", text: displayText }]);
      }

      if (data.issues) {
        setIssues(data.issues);
      }
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message === 'Failed to fetch';
      setMessages((prev) => [...prev, { role: "assistant", text: isNetwork ? labels.networkError : labels.error }]);
    } finally {
      setLoadingCount(c => c - 1);
    }
  }

  async function handleSubmitOneIssue(index: number) {
    if (!issues || submittingIndex !== null) return;
    const issue = issues[index];
    if (!issue) return;

    setSubmittingIndex(index);
    try {
      const results = await backend.submitChatIssues([issue], {
        pagePath: getFullPagePath(),
        pageContext: getPageContext(),
        sessionId: sessionId || resumeId,
        ...(appOverride && { app: appOverride }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: "", staleIssues: [issue] }]);
      const remaining = issues.filter((_, i) => i !== index);
      setIssues(remaining.length > 0 ? remaining : null);
      setSubmitResults(prev => prev ? [...prev, ...results] : results);
      const justSubmitted = results.filter(r => r.success).map(r => r.title);
      if (justSubmitted.length > 0) {
        setSubmittedIssueTitles(prev => Array.from(new Set([...prev, ...justSubmitted])));
      }
      if (remaining.length === 0 && results.every(r => r.success)) {
        setShowPostSubmitPrompt(true);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: labels.error }]);
    } finally {
      setSubmittingIndex(null);
    }
  }

  function handleResendStale(staleIssues: ChatIssue[]) {
    setIssues(prev => {
      if (!prev || prev.length === 0) return staleIssues;
      const existing = new Set(prev.map(i => i.title));
      const additions = staleIssues.filter(i => !existing.has(i.title));
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
    setSubmitResults(null);
    setShowPostSubmitPrompt(false);
  }

  async function handleSubmitStaleIssue(staleIssue: ChatIssue): Promise<boolean> {
    try {
      const results = await backend.submitChatIssues([staleIssue], {
        pagePath: getFullPagePath(),
        pageContext: getPageContext(),
        sessionId: sessionId || resumeId,
        ...(appOverride && { app: appOverride }),
      });
      setMessages(prev => prev.map(msg => {
        if (!msg.staleIssues) return msg;
        const filtered = msg.staleIssues.filter(i => i.title !== staleIssue.title);
        return { ...msg, staleIssues: filtered.length > 0 ? filtered : undefined };
      }));
      setSubmitResults(prev => prev ? [...prev, ...results] : results);
      const justSubmitted = results.filter(r => r.success).map(r => r.title);
      if (justSubmitted.length > 0) {
        setSubmittedIssueTitles(prev => Array.from(new Set([...prev, ...justSubmitted])));
      }
      return results.every(r => r.success);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: labels.error }]);
      return false;
    }
  }

  function handleGoToIssues() {
    if (!isOnIssuesPage) {
      openIssuesTab(issuesPath || '/feedback-lib-issues');
    } else {
      const viewedApp = new URLSearchParams(window.location.search).get('app')
        || (window as Window & { __feedbackIssuesAppName?: string }).__feedbackIssuesAppName;
      if (viewedApp === 'addnewfeature') {
        window.dispatchEvent(new Event('feedback-issues-refresh'));
      } else {
        openIssuesTab('/feedback-lib-issues?app=addnewfeature', 'addnewfeature-issues');
      }
    }
  }

  function handlePostSubmitGoToIssues() {
    handleGoToIssues();
    handleEndSession();
  }

  function handleDismissPostSubmitPrompt() {
    handleEndSession();
  }

  async function handleDirectSubmit() {
    if (!directTitle.trim() || directLoading) return;
    setDirectLoading(true);
    try {
      const data = await backend.issueAction({
        action: 'create',
        title: directTitle,
        description: directDesc,
        pagePath: getFullPagePath(),
        pageContext: getPageContext(),
        ...(appOverride && { app: appOverride }),
      });
      const issueNumber = 'issueNumber' in data ? data.issueNumber : undefined;
      setSubmitResults([{ title: directTitle, issueNumber, success: true }]);
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

  const sizedCompact = !fullScreen && customHeight != null;

  return (
    <div
      data-id="feedback-chat"
      className={`fixed z-[10001] ${fullScreen ? 'inset-0' : `bottom-6 end-6 w-96 ${sizedCompact ? '' : 'max-h-[min(32rem,calc(100dvh-3rem))]'} rounded-2xl`} ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-2xl border flex flex-col overflow-hidden ${isResizing ? 'select-none' : ''}`}
      style={sizedCompact ? { height: `${customHeight}px`, maxHeight: 'calc(100dvh - 3rem)' } : undefined}
    >
      {!fullScreen && (
        <div
          data-id="chat-resize-handle"
          onPointerDown={handleResizeStart}
          title="Drag to resize height"
          style={{ touchAction: 'none' }}
          className={`absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-start justify-center pt-0.5 group ${isResizing ? 'bg-indigo-400/40' : 'hover:bg-indigo-400/30'}`}
        >
          <span data-id="chat-resize-handle-grip" className={`block w-8 h-0.5 rounded-full ${isResizing ? 'bg-white/80' : 'bg-white/40 group-hover:bg-white/70'}`} />
        </div>
      )}
      {/* Header */}
      <div data-id="chat-header" className={`flex items-center justify-between px-4 py-3 ${headerBg} text-white`}>
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
            className="text-indigo-200 hover:text-white transition-colors"
            title={directMode ? labels.useClarifier : labels.writeDirectly}
          >
            {directMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            )}
          </button>
          <button data-id="new-chat" onClick={handleNewChat} className="text-indigo-200 hover:text-white transition-colors" title={labels.newChat}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              <path d="M12 8v6M9 11h6" />
            </svg>
          </button>
          {issuesPath && (
            <button data-id="view-issues" onClick={handleGoToIssues} className="text-indigo-200 hover:text-white transition-colors" title={labels.viewIssues}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            </button>
          )}
          {sizedCompact && (
            <button data-id="restore-size" onClick={() => { setCustomHeight(null); try { localStorage.removeItem(HEIGHT_STORAGE_KEY); } catch { /* ignore */ } }} className="text-indigo-200 hover:text-white transition-colors" title={labels.restoreSize}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
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

          {submitResults && <ChatSubmitResults results={submitResults} isDark={isDark} issuePrefix={labels.issueSubmitted} />}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div data-id="post-submit-prompt" className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p data-id="post-submit-prompt-text" className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div data-id="post-submit-prompt-actions" className="flex gap-2">
                <button data-id="go-to-issues" onClick={handlePostSubmitGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button data-id="dismiss-prompt" onClick={handleDismissPostSubmitPrompt} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
        {/* Messages */}
        <div data-id="messages-area" className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${fullScreen || sizedCompact ? '' : 'min-h-[12rem] max-h-[20rem]'}`}>
          <ChatMessages messages={messages} isDark={isDark} accentBg={accentBase} selectIssuesLabel={labels.selectIssues} onResendStale={handleResendStale} onSubmitStaleIssue={handleSubmitStaleIssue} resendLabel={labels.resend} submitLabel={labels.submit} submittingLabel={labels.submitting} copyLabel={labels.copy} copiedLabel={labels.copied} />

          {issues && issues.length > 0 && (
            <ChatIssueChecklist
              issues={issues}
              onSubmitOne={handleSubmitOneIssue}
              submittingIndex={submittingIndex}
              isDark={isDark}
              accentClass={accent}
              selectLabel={labels.selectIssues}
              submitLabel={labels.submit}
              submittingLabel={labels.submitting}
              expandable
            />
          )}

          {submitResults && <ChatSubmitResults results={submitResults} isDark={isDark} issuePrefix={labels.issueSubmitted} />}

          {/* Post-submit navigation prompt */}
          {showPostSubmitPrompt && (
            <div data-id="chat-post-submit-prompt" className={`${isDark ? 'border-slate-600' : 'border-slate-200'} border rounded-xl p-3 space-y-2`}>
              <p data-id="chat-post-submit-prompt-text" className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{labels.goToIssuesPrompt}</p>
              <div data-id="chat-post-submit-prompt-actions" className="flex gap-2">
                <button data-id="chat-go-to-issues" onClick={handlePostSubmitGoToIssues} className={`flex-1 px-3 py-2 ${accent} text-white text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesYes}</button>
                <button data-id="chat-dismiss-prompt" onClick={handleDismissPostSubmitPrompt} className={`flex-1 px-3 py-2 ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-sm font-medium rounded-lg transition-colors`}>{labels.goToIssuesNo}</button>
              </div>
            </div>
          )}

          {loading && <ChatThinking isDark={isDark} label={labels.thinking} />}
          <div data-id="chat-messages-scroll-anchor" ref={messagesEndRef} />
        </div>

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          sendDisabled={loading && !sessionId}
          isDark={isDark}
          accentClass={accent}
          placeholder={labels.placeholder}
          inputRef={inputRef}
        />
        </>
      )}
    </div>
  );
}
