"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Issue {
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
  notWorking: string;
  markRegression: string;
  markRegressionDirect: string;
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
  resumeSession: string;
  newSession: string;
  previousSessions: string;
  resumeChat: string;
  chatPlaceholder: string;
  chatThinking: string;
  loadingHistory: string;
  noSessionHistory: string;
  sendMessage: string;
}

const defaultLabels: IssuesPageLabels = {
  pageTitle: "Issues",
  loading: "Loading issues...",
  error: "Failed to load issues.",
  noIssues: "No issues found.",
  open: "Open",
  closed: "Closed",
  inProgress: "In Progress",
  review: "Needs Review",
  regression: "Regression",
  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  fixWithClaude: "Fix with Claude",
  markReviewed: "Mark as Reviewed",
  notWorking: "Working",
  markRegression: "Mark as Regression",
  markRegressionDirect: "Write directly",
  clearRegression: "Clear Regression",
  regressionPlaceholder: "Describe what regressed (optional)",
  markingRegression: "Marking...",
  conclude: "Run conclude (document work)",
  alsoInSession: "Also fixed in this session:",
  launching: "Launching...",
  reviewing: "Reviewing...",
  refresh: "Refresh",
  close: "Close",
  closing: "Closing...",
  delete: "Delete",
  deleteConfirm: "Are you sure you want to delete this issue?",
  maintenance: "Maintenance",
  maintenanceLaunch: "Launch",
  maintenanceLaunching: "Launching...",
  resumeSession: "Resume",
  newSession: "New Session",
  previousSessions: "Previous sessions:",
  resumeChat: "Resume Chat",
  chatPlaceholder: "Describe what's not working...",
  chatThinking: "Thinking...",
  loadingHistory: "Loading conversation...",
  noSessionHistory: "No previous conversation found.",
  sendMessage: "Send",
};

const heLabels: IssuesPageLabels = {
  pageTitle: "תקלות",
  loading: "טוען תקלות...",
  error: "שגיאה בטעינת תקלות.",
  noIssues: "לא נמצאו תקלות.",
  open: "פתוח",
  closed: "סגור",
  inProgress: "בטיפול",
  review: "ממתין לאישור",
  regression: "רגרסיה",
  edit: "עריכה",
  save: "שמירה",
  cancel: "ביטול",
  fixWithClaude: "תיקון עם Claude",
  markReviewed: "סימון כנבדק",
  notWorking: "עובד",
  markRegression: "סימון כרגרסיה",
  markRegressionDirect: "כתיבה ישירה",
  clearRegression: "ביטול רגרסיה",
  regressionPlaceholder: "תיאור מה חזר (אופציונלי)",
  markingRegression: "מסמן...",
  conclude: "תיעוד עבודה",
  alsoInSession: "תוקנו גם בסשן זה:",
  launching: "משיק...",
  reviewing: "מסמן...",
  refresh: "רענון",
  close: "סגירה",
  closing: "סוגר...",
  delete: "מחיקה",
  deleteConfirm: "האם למחוק תקלה זו?",
  maintenance: "תחזוקה",
  maintenanceLaunch: "הפעלה",
  maintenanceLaunching: "מפעיל...",
  resumeSession: "המשך",
  newSession: "סשן חדש",
  previousSessions: "סשנים קודמים:",
  resumeChat: "המשך שיחה",
  chatPlaceholder: "תארו מה לא עובד...",
  chatThinking: "חושב...",
  loadingHistory: "טוען שיחה...",
  noSessionHistory: "לא נמצאה שיחה קודמת.",
  sendMessage: "שליחה",
};

const issuesTranslations: Record<string, IssuesPageLabels> = {
  en: defaultLabels,
  he: heLabels,
};

interface MaintenancePrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

const MAINTENANCE_PROMPTS: MaintenancePrompt[] = [
  {
    id: "feedback-context",
    title: "Add feedback context tracking",
    description: "Ensure tab/section navigation sets data-active-tab on the active element so the feedback widget tracks which view the user is on.",
    prompt: "Scan this app for tab or section navigation (tab bars, sidebars, segmented controls). For each one, ensure the currently active element has a `data-active-tab` attribute set to the visible label text. This attribute must move with the active state — only the active element should have it at any given time. The feedback-lib widget reads this via `document.querySelector('[data-active-tab]')` at issue-report time. Do not remove any existing attributes. Commit and push when done.",
  },
];

interface FeedbackIssuesPageProps {
  lang?: string;
  labels?: Partial<IssuesPageLabels>;
  colorScheme?: "system" | "light" | "dark";
}

interface ReviewDialogState {
  trigger: Issue;
  relatedIssues: Issue[];
  selectedNumbers: Set<number>;
  conclude: boolean;
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

function statusBadge(status: string, labels: IssuesPageLabels, isDark: boolean) {
  const map: Record<string, { label: string; bg: string }> = {
    open: { label: labels.open, bg: isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800" },
    closed: { label: labels.closed, bg: isDark ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-600" },
    in_progress: { label: labels.inProgress, bg: isDark ? "bg-yellow-900 text-yellow-300" : "bg-yellow-100 text-yellow-800" },
    review: { label: labels.review, bg: isDark ? "bg-purple-900 text-purple-300" : "bg-purple-100 text-purple-800" },
    regression: { label: labels.regression, bg: isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800" },
  };
  const entry = map[status] ?? map.open;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.bg}`}>
      {entry.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function FeedbackIssuesPage({ lang, labels: labelOverrides, colorScheme = "system" }: FeedbackIssuesPageProps) {
  const langLabels = lang ? (issuesTranslations[lang] ?? defaultLabels) : defaultLabels;
  const labels = { ...langLabels, ...labelOverrides };
  const systemDark = useSystemDark();
  const isDark = colorScheme === "dark" || (colorScheme !== "light" && systemDark);

  const [appName, setAppName] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Selection for fix
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fixLoading, setFixLoading] = useState(false);

  // Review dialog
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Regression dialog
  const [regressionTarget, setRegressionTarget] = useState<Issue | null>(null);
  const [regressionDesc, setRegressionDesc] = useState("");
  const [regressionLoading, setRegressionLoading] = useState(false);

  // Fix session choice dialog (for regression issues with previous sessions)
  const [fixSessionTarget, setFixSessionTarget] = useState<Issue | null>(null);
  const [fixSessionLoading, setFixSessionLoading] = useState(false);

  // Regression chat modal (resumes original clarifier session)
  const [chatTarget, setChatTarget] = useState<Issue | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatTmuxSession, setChatTmuxSession] = useState<string | null>(null);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Tabs: "issues" or "maintenance"
  const [activeTab, setActiveTab] = useState<"issues" | "maintenance">("issues");

  // Hide not-urgent toggle
  const [hideNotUrgent, setHideNotUrgent] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('feedback-issues-hide-not-urgent') !== 'false';
  });

  // Maintenance
  const [maintenanceLaunching, setMaintenanceLaunching] = useState<string | null>(null);

  // Distinct tab title & favicon for the issues page
  const originalTitleRef = useRef<string>('');

  useEffect(() => {
    originalTitleRef.current = document.title;

    // Remove all existing favicon links — just changing href doesn't force Chrome to re-fetch
    const existingLinks = document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']");
    const savedLinks: { rel: string; href: string; type: string; sizes: string }[] = [];
    existingLinks.forEach(el => {
      const l = el as HTMLLinkElement;
      savedLinks.push({ rel: l.rel, href: l.href, type: l.type, sizes: l.sizes?.toString() || '' });
      l.remove();
    });

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#7c3aed"/><circle cx="16" cy="24" r="2" fill="white"/><rect x="14" y="6" width="4" height="14" rx="2" fill="white"/></svg>'
    );
    document.head.appendChild(link);

    return () => {
      document.title = originalTitleRef.current;
      link.remove();
      savedLinks.forEach(s => {
        const restored = document.createElement('link');
        restored.rel = s.rel;
        restored.href = s.href;
        if (s.type) restored.type = s.type;
        if (s.sizes) restored.sizes = s.sizes;
        document.head.appendChild(restored);
      });
    };
  }, []);

  useEffect(() => {
    document.title = appName ? `${appName} — ${labels.pageTitle}` : labels.pageTitle;
  }, [appName, labels.pageTitle]);

  const [overrideApp] = useState(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('app');
  });

  const fetchIssues = useCallback(async () => {
    try {
      setError(null);
      const qs = overrideApp ? `?app=${overrideApp}` : '';
      const res = await fetch(`/api/feedback/issues${qs}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      if (data.appName) setAppName(data.appName);
      const all: Issue[] = Array.isArray(data.issues) ? data.issues : [];
      // Only show user-reported issues, sorted: open by createdAt newest-first, closed by updatedAt newest-first
      const list = all
        .filter(i => i.labels?.includes("user-reported"))
        .sort((a, b) => {
          const aIsClosed = a.status === "closed";
          const bIsClosed = b.status === "closed";
          // Open issues before closed
          if (aIsClosed !== bIsClosed) return aIsClosed ? 1 : -1;
          // Within group: open by createdAt, closed by updatedAt
          const aDate = aIsClosed ? a.updatedAt : a.createdAt;
          const bDate = bIsClosed ? b.updatedAt : b.createdAt;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
      setIssues(list);
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }, [labels.error]);

  useEffect(() => {
    fetchIssues();
    const interval = setInterval(fetchIssues, 15_000);
    return () => clearInterval(interval);
  }, [fetchIssues]);

  function toggleSelect(issueNumber: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(issueNumber)) next.delete(issueNumber);
      else next.add(issueNumber);
      return next;
    });
  }

  function startEdit(issue: Issue) {
    setEditingId(issue.issueNumber);
    setEditTitle(issue.title);
    setEditDesc(issue.description || "");
    setExpandedIds(prev => new Set(prev).add(issue.issueNumber));
  }

  async function handleSaveEdit(issueNumber: number) {
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", issueNumber, title: editTitle, description: editDesc }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(issue =>
          issue.issueNumber === issueNumber ? { ...issue, title: editTitle, description: editDesc } : issue
        ));
        setEditingId(null);
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function toggleNotUrgent(issue: Issue) {
    const hasLabel = issue.labels?.includes("not-urgent");
    const newLabels = hasLabel
      ? issue.labels.filter(l => l !== "not-urgent")
      : [...(issue.labels || []), "not-urgent"];
    // Optimistic update
    setIssues(prev => prev.map(i =>
      i.issueNumber === issue.issueNumber ? { ...i, labels: newLabels } : i
    ));
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", issueNumber: issue.issueNumber, labels: newLabels }),
      });
      if (!res.ok) {
        // Revert on failure
        setIssues(prev => prev.map(i =>
          i.issueNumber === issue.issueNumber ? { ...i, labels: issue.labels } : i
        ));
      }
    } catch {
      setIssues(prev => prev.map(i =>
        i.issueNumber === issue.issueNumber ? { ...i, labels: issue.labels } : i
      ));
    }
  }

  async function handleFixWithClaude() {
    const selected = issues.filter(i => selectedIds.has(i.issueNumber) && i.status !== "closed");
    if (selected.length === 0) return;
    setFixLoading(true);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix",
          issues: selected.map(i => ({
            number: i.issueNumber,
            title: i.title,
            ...(i.status === "regression" && {
              status: i.status,
              insights: i.insights,
              claudeSessionIds: i.claudeSessionIds,
            }),
          })),
        }),
      });
      if (res.ok) {
        // Optimistically mark as in_progress
        setIssues(prev => prev.map(i =>
          selectedIds.has(i.issueNumber) ? { ...i, status: "in_progress" } : i
        ));
        setSelectedIds(new Set());
      }
    } catch { /* ignore */ }
    setFixLoading(false);
  }

  async function handleFixSingleIssue(issue: Issue, resumeSessionId?: string) {
    setFixSessionLoading(true);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix",
          issues: [{
            number: issue.issueNumber,
            title: issue.title,
            status: issue.status,
            insights: issue.insights,
            claudeSessionIds: issue.claudeSessionIds,
          }],
          ...(resumeSessionId && { resumeSessionId }),
        }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issue.issueNumber ? { ...i, status: "in_progress" } : i
        ));
        setFixSessionTarget(null);
      }
    } catch { /* ignore */ }
    setFixSessionLoading(false);
  }

  function openReviewDialog(issue: Issue) {
    // Find other review-status issues with the same claudeSessionId
    const related = issue.claudeSessionId
      ? issues.filter(i =>
          i.issueNumber !== issue.issueNumber &&
          i.status === "review" &&
          i.claudeSessionId === issue.claudeSessionId
        )
      : [];

    const allNumbers = new Set([issue.issueNumber, ...related.map(i => i.issueNumber)]);
    setReviewDialog({
      trigger: issue,
      relatedIssues: related,
      selectedNumbers: allNumbers,
      conclude: true,
    });
  }

  async function handleDirectReview(issue: Issue) {
    setActionLoading(issue.issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewed",
          issueNumbers: [issue.issueNumber],
          conclude: true,
          claudeSessionId: issue.claudeSessionId,
          claudeLaunchDir: issue.claudeLaunchDir,
        }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issue.issueNumber ? { ...i, status: "closed" } : i
        ));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  function toggleReviewIssue(issueNumber: number) {
    if (!reviewDialog) return;
    // Don't allow deselecting the trigger issue
    if (issueNumber === reviewDialog.trigger.issueNumber) return;
    setReviewDialog(prev => {
      if (!prev) return null;
      const next = new Set(prev.selectedNumbers);
      if (next.has(issueNumber)) next.delete(issueNumber);
      else next.add(issueNumber);
      return { ...prev, selectedNumbers: next };
    });
  }

  async function handleConfirmReview() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewed",
          issueNumbers: Array.from(reviewDialog.selectedNumbers),
          conclude: reviewDialog.conclude,
          claudeSessionId: reviewDialog.trigger.claudeSessionId,
          claudeLaunchDir: reviewDialog.trigger.claudeLaunchDir,
        }),
      });
      if (res.ok) {
        // Optimistically mark as closed
        setIssues(prev => prev.map(i =>
          reviewDialog.selectedNumbers.has(i.issueNumber) ? { ...i, status: "closed" } : i
        ));
        setReviewDialog(null);
      }
    } catch { /* ignore */ }
    setReviewLoading(false);
  }

  async function handleMarkRegression() {
    if (!regressionTarget) return;
    setRegressionLoading(true);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          issueNumber: regressionTarget.issueNumber,
          status: "regression",
          ...(regressionDesc.trim() && { insights: regressionDesc.trim() }),
        }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === regressionTarget.issueNumber
            ? { ...i, status: "regression", ...(regressionDesc.trim() && { insights: regressionDesc.trim() }) }
            : i
        ));
        setRegressionTarget(null);
        setRegressionDesc("");
      }
    } catch { /* ignore */ }
    setRegressionLoading(false);
  }

  async function handleClearRegression(issueNumber: number) {
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", issueNumber, status: "closed" }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issueNumber ? { ...i, status: "closed" } : i
        ));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  // --- Regression chat modal functions ---

  async function openRegressionChat(issue: Issue) {
    setChatTarget(issue);
    setChatMessages([]);
    setChatInput("");
    setChatSessionId(null);
    setChatTmuxSession(null);
    setChatHistoryLoading(true);
    try {
      const res = await fetch(`/api/feedback/session-history?sessionId=${encodeURIComponent(issue.clarifierSessionId!)}`);
      const data = await res.json();
      if (data.found && data.messages.length > 0) {
        setChatMessages(data.messages);
      }
    } catch { /* ignore — will show empty chat */ }
    setChatHistoryLoading(false);
  }

  function closeRegressionChat() {
    if (chatTmuxSession) {
      fetch("/api/feedback/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmuxSession: chatTmuxSession }),
      }).catch(() => {});
    }
    setChatTarget(null);
    setChatMessages([]);
    setChatInput("");
    setChatSessionId(null);
    setChatTmuxSession(null);
    setChatLoading(false);
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatLoading || !chatTarget) return;

    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          ...(chatSessionId && chatTmuxSession
            ? { sessionId: chatSessionId, tmuxSession: chatTmuxSession }
            : { resumeSessionId: chatTarget.clarifierSessionId }),
          pagePath: "/issues",
          pageContext: "Issues",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'session_expired') {
          setChatMessages(prev => [...prev, { role: "assistant", text: labels.noSessionHistory }]);
          setChatLoading(false);
          return;
        }
        throw new Error(data.message || "Request failed");
      }

      const data = await res.json();
      setChatSessionId(data.sessionId);
      setChatTmuxSession(data.tmuxSession);

      let displayText = data.response || "";
      if (data.issues) {
        displayText = displayText.replace(/```json\s*\n[\s\S]*?\n```\s*/g, "").trim();
      }
      if (displayText) {
        setChatMessages(prev => [...prev, { role: "assistant", text: displayText }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    }
    setChatLoading(false);
  }

  async function handleCloseIssue(issueNumber: number) {
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", issueNumber }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issueNumber ? { ...i, status: "closed" } : i
        ));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleDeleteIssue(issueNumber: number) {
    if (!window.confirm(labels.deleteConfirm)) return;
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", issueNumber }),
      });
      if (res.ok) {
        setIssues(prev => prev.filter(i => i.issueNumber !== issueNumber));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleMaintenanceLaunch(mp: MaintenancePrompt) {
    setMaintenanceLaunching(mp.id);
    try {
      await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "maintenance", prompt: mp.prompt }),
      });
    } catch { /* ignore */ }
    setMaintenanceLaunching(null);
  }

  const selectedCount = issues.filter(i => selectedIds.has(i.issueNumber) && i.status !== "closed" && i.status !== "review").length;
  const notUrgentCount = issues.filter(i => i.labels?.includes("not-urgent")).length;
  const displayIssues = hideNotUrgent ? issues.filter(i => !i.labels?.includes("not-urgent")) : issues;

  const bgClass = isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-900";
  const cardClass = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
  const btnClass = isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700";
  const btnPrimaryClass = isDark ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-500 hover:bg-indigo-600 text-white";
  const dialogBgClass = isDark ? "bg-slate-800 border-slate-600" : "bg-white border-slate-300";

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{appName ? `${appName} — ${labels.pageTitle}` : labels.pageTitle}</h1>
          <div className="flex items-center gap-2">
          <button
            data-id="refresh-issues"
            onClick={() => fetchIssues()}
            title={labels.refresh}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          </button>
          <button
            data-id="toggle-not-urgent"
            onClick={() => {
              const next = !hideNotUrgent;
              setHideNotUrgent(next);
              localStorage.setItem('feedback-issues-hide-not-urgent', String(next));
            }}
            disabled={notUrgentCount === 0}
            className={`text-xs px-3 py-2 rounded-lg transition-colors ${
              notUrgentCount === 0
                ? `${isDark ? "text-slate-500" : "text-slate-400"} cursor-not-allowed`
                : !hideNotUrgent
                  ? "text-yellow-500 bg-yellow-500/10 cursor-pointer"
                  : `${btnClass} cursor-pointer`
            } active:scale-95`}
          >
            {notUrgentCount === 0
              ? "No not-urgent issues"
              : hideNotUrgent
                ? `Include not urgent (${notUrgentCount})`
                : "Hide not urgent"}
          </button>
          <button
            data-id="fix-with-claude"
            onClick={handleFixWithClaude}
            disabled={selectedCount === 0 || fixLoading}
            className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              selectedCount > 0
                ? isDark ? "bg-purple-700 hover:bg-purple-600 text-white cursor-pointer" : "bg-purple-500 hover:bg-purple-600 text-white cursor-pointer"
                : isDark ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            } disabled:opacity-50 active:scale-95`}
          >
            {fixLoading ? (
              <>{labels.launching}</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                {labels.fixWithClaude}{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </>
            )}
          </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className={`flex gap-1 mb-4 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
          <button
            data-id="tab-issues"
            onClick={() => setActiveTab("issues")}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer -mb-px ${
              activeTab === "issues"
                ? isDark ? "border-b-2 border-indigo-400 text-indigo-400" : "border-b-2 border-indigo-500 text-indigo-600"
                : isDark ? "text-slate-400 hover:text-slate-300" : "text-slate-500 hover:text-slate-700"
            }`}
            {...(activeTab === "issues" ? { "data-active-tab": labels.pageTitle } : {})}
          >
            {labels.pageTitle}
          </button>
          <button
            data-id="tab-maintenance"
            onClick={() => setActiveTab("maintenance")}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer -mb-px ${
              activeTab === "maintenance"
                ? isDark ? "border-b-2 border-indigo-400 text-indigo-400" : "border-b-2 border-indigo-500 text-indigo-600"
                : isDark ? "text-slate-400 hover:text-slate-300" : "text-slate-500 hover:text-slate-700"
            }`}
            {...(activeTab === "maintenance" ? { "data-active-tab": labels.maintenance } : {})}
          >
            {labels.maintenance}
          </button>
        </div>

        {activeTab === "issues" && <>
        {loading && <p className={isDark ? "text-slate-400" : "text-slate-500"}>{labels.loading}</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && !error && displayIssues.length === 0 && (
          <p className={isDark ? "text-slate-400" : "text-slate-500"}>{labels.noIssues}</p>
        )}

        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-12rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {displayIssues.map((issue) => {
            const isExpanded = expandedIds.has(issue.issueNumber);
            const isEditing = editingId === issue.issueNumber;
            const hasLongDesc = issue.description && issue.description.length > 120;
            const isClosed = issue.status === "closed";
            const canSelect = !isClosed && issue.status !== "review";
            const isReview = issue.status === "review";
            const isRegression = issue.status === "regression";

            return (
              <div key={issue.issueNumber} className={`border rounded-lg p-4 ${cardClass} transition-colors ${
                isRegression
                  ? (isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200")
                  : isReview
                    ? (isDark ? "border-purple-700/50" : "border-purple-200")
                    : ""
              }`}>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
                      {statusBadge(issue.status, labels, isDark)}
                    </div>
                    <input
                      data-id="edit-title"
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded-md border text-sm font-medium ${isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-900"}`}
                    />
                    <textarea
                      data-id="edit-description"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      rows={4}
                      className={`w-full px-3 py-1.5 rounded-md border text-sm ${isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-900"} whitespace-pre-wrap`}
                    />
                    <div className="flex gap-2">
                      <button
                        data-id="save-edit"
                        onClick={() => handleSaveEdit(issue.issueNumber)}
                        disabled={actionLoading === issue.issueNumber}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnPrimaryClass} disabled:opacity-50 active:scale-95`}
                      >
                        {labels.save}
                      </button>
                      <button
                        data-id="cancel-edit"
                        onClick={() => setEditingId(null)}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} active:scale-95`}
                      >
                        {labels.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Checkbox for selectable issues */}
                    {canSelect && (
                      <div className="pt-1 flex-shrink-0">
                        <input
                          data-id={`select-issue-${issue.issueNumber}`}
                          type="checkbox"
                          checked={selectedIds.has(issue.issueNumber)}
                          onChange={() => toggleSelect(issue.issueNumber)}
                          className="w-4 h-4 accent-purple-500 cursor-pointer"
                        />
                      </div>
                    )}

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => { if (window.getSelection()?.toString()) return; setExpandedIds(prev => { const next = new Set(prev); if (next.has(issue.issueNumber)) next.delete(issue.issueNumber); else next.add(issue.issueNumber); return next; }); }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
                        {statusBadge(issue.status, labels, isDark)}
                        {issue.labels?.map((label, i) => (
                          <span key={`${label}-${i}`} className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                      <h3 className="font-medium">{issue.title}</h3>
                      {issue.description && (
                        <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-600"} ${!isExpanded && hasLongDesc ? "line-clamp-2" : ""} whitespace-pre-wrap`}>
                          {issue.description}
                        </p>
                      )}
                      {issue.insights && isExpanded && (
                        <p className={`text-sm mt-2 italic ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {issue.insights}
                        </p>
                      )}
                      <p className={`text-xs mt-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        {formatDate(issue.createdAt)}
                      </p>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {/* Mark as Reviewed button for review-status issues */}
                      {isReview && (
                        <button
                          data-id={`mark-reviewed-${issue.issueNumber}`}
                          onClick={() => handleDirectReview(issue)}
                          onContextMenu={(e) => { e.preventDefault(); openReviewDialog(issue); }}
                          disabled={actionLoading === issue.issueNumber}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            isDark ? "bg-purple-800 hover:bg-purple-700 text-purple-200" : "bg-purple-100 hover:bg-purple-200 text-purple-700"
                          } disabled:opacity-50`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                          {actionLoading === issue.issueNumber ? labels.reviewing : labels.markReviewed}
                        </button>
                      )}
                      {/* Not Working button for closed issues — default opens clarifier chat, pencil icon for direct dialog */}
                      {isClosed && (
                        <div className="flex items-center gap-1">
                          <button
                            data-id={`not-working-${issue.issueNumber}`}
                            onClick={() => {
                              if (issue.clarifierSessionId) {
                                openRegressionChat(issue);
                              } else {
                                setRegressionTarget(issue);
                                setRegressionDesc("");
                              }
                            }}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} hover:text-red-500 active:scale-95`}
                          >
                            {labels.notWorking}
                          </button>
                          <button
                            data-id={`not-working-direct-${issue.issueNumber}`}
                            onClick={() => { setRegressionTarget(issue); setRegressionDesc(""); }}
                            title={labels.markRegressionDirect}
                            className={`text-xs px-1.5 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} hover:text-red-500 active:scale-95 opacity-60 hover:opacity-100`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                        </div>
                      )}
                      {/* Fix with Claude button for regression issues */}
                      {isRegression && (
                        <button
                          data-id={`fix-regression-${issue.issueNumber}`}
                          onClick={() => {
                            if (issue.claudeSessionIds?.length) {
                              setFixSessionTarget(issue);
                            } else {
                              handleFixSingleIssue(issue);
                            }
                          }}
                          disabled={fixSessionLoading}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                          } disabled:opacity-50`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" /></svg>
                          {fixSessionLoading ? labels.launching : labels.fixWithClaude}
                        </button>
                      )}
                      {/* Clear Regression button for regression issues */}
                      {isRegression && (
                        <button
                          data-id={`clear-regression-${issue.issueNumber}`}
                          onClick={() => handleClearRegression(issue.issueNumber)}
                          disabled={actionLoading === issue.issueNumber}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            isDark ? "bg-green-900 hover:bg-green-800 text-green-200" : "bg-green-100 hover:bg-green-200 text-green-700"
                          } disabled:opacity-50`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
                          {labels.clearRegression}
                        </button>
                      )}
                      {/* Close button for open/in_progress issues */}
                      {(issue.status === "open" || issue.status === "in_progress") && (
                        <button
                          data-id={`close-issue-${issue.issueNumber}`}
                          onClick={() => handleCloseIssue(issue.issueNumber)}
                          disabled={actionLoading === issue.issueNumber}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} active:scale-95 disabled:opacity-50`}
                        >
                          {actionLoading === issue.issueNumber ? labels.closing : labels.close}
                        </button>
                      )}
                      <button
                        data-id={`toggle-urgent-${issue.issueNumber}`}
                        onClick={() => toggleNotUrgent(issue)}
                        title={issue.labels?.includes("not-urgent") ? "Mark as urgent" : "Set as not urgent"}
                        className={`text-xs px-2 py-1.5 rounded-md transition-colors cursor-pointer active:scale-95 ${
                          issue.labels?.includes("not-urgent")
                            ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                            : btnClass
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></svg>
                      </button>
                      <button
                        data-id={`edit-issue-${issue.issueNumber}`}
                        onClick={() => startEdit(issue)}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} active:scale-95`}
                      >
                        {labels.edit}
                      </button>
                      <button
                        data-id={`delete-issue-${issue.issueNumber}`}
                        onClick={() => handleDeleteIssue(issue.issueNumber)}
                        disabled={actionLoading === issue.issueNumber}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          isDark ? "bg-slate-700 hover:bg-red-900 hover:text-red-300 text-slate-300" : "bg-slate-100 hover:bg-red-100 hover:text-red-700 text-slate-700"
                        } active:scale-95 disabled:opacity-50`}
                      >
                        {labels.delete}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>}

        {activeTab === "maintenance" && (
          <div className="space-y-2">
            {MAINTENANCE_PROMPTS.map(mp => (
              <div key={mp.id} className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${cardClass}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{mp.title}</p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{mp.description}</p>
                </div>
                <button
                  data-id={`maintenance-launch-${mp.id}`}
                  onClick={() => handleMaintenanceLaunch(mp)}
                  disabled={maintenanceLaunching !== null}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    isDark ? "bg-slate-600 hover:bg-slate-500 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  } disabled:opacity-50 active:scale-95`}
                >
                  {maintenanceLaunching === mp.id ? labels.maintenanceLaunching : labels.maintenanceLaunch}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Dialog Overlay */}
      {reviewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !reviewLoading && setReviewDialog(null)}>
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
                <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{reviewDialog.trigger.issueNumber}</span>
                {" "}{reviewDialog.trigger.title}
              </span>
            </label>

            {/* Related issues from same session */}
            {reviewDialog.relatedIssues.length > 0 && (
              <div className="mt-3">
                <p className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {labels.alsoInSession}
                </p>
                {reviewDialog.relatedIssues.map(ri => (
                  <label key={ri.issueNumber} className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      data-id={`review-related-${ri.issueNumber}`}
                      type="checkbox"
                      checked={reviewDialog.selectedNumbers.has(ri.issueNumber)}
                      onChange={() => toggleReviewIssue(ri.issueNumber)}
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
                checked={reviewDialog.conclude}
                onChange={() => setReviewDialog(prev => prev ? { ...prev, conclude: !prev.conclude } : null)}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
              <span className="text-sm">{labels.conclude}</span>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                data-id="review-cancel"
                onClick={() => setReviewDialog(null)}
                disabled={reviewLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
              >
                {labels.cancel}
              </button>
              <button
                data-id="review-confirm"
                onClick={handleConfirmReview}
                disabled={reviewLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                  isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                } disabled:opacity-50 active:scale-95`}
              >
                {reviewLoading ? (
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
      )}

      {/* Regression Dialog Overlay */}
      {regressionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !regressionLoading && (setRegressionTarget(null), setRegressionDesc(""))}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className={`relative border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 ${dialogBgClass}`}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2">{labels.markRegression}</h2>
            <p className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{regressionTarget.issueNumber}</span>
              {" "}{regressionTarget.title}
            </p>
            {regressionTarget.description && (
              <p className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {regressionTarget.description}
              </p>
            )}
            <div className="mb-3" />
            <textarea
              data-id="regression-description"
              value={regressionDesc}
              onChange={e => setRegressionDesc(e.target.value)}
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
                onClick={() => { setRegressionTarget(null); setRegressionDesc(""); }}
                disabled={regressionLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
              >
                {labels.cancel}
              </button>
              <button
                data-id="regression-confirm"
                onClick={handleMarkRegression}
                disabled={regressionLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                  isDark ? "bg-red-700 hover:bg-red-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
                } disabled:opacity-50 active:scale-95`}
              >
                {regressionLoading ? (
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
      )}

      {/* Fix Session Choice Dialog */}
      {fixSessionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !fixSessionLoading && setFixSessionTarget(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className={`relative border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 ${dialogBgClass}`}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2">{labels.fixWithClaude}</h2>
            <p className={`text-sm mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <span className={`font-mono text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{fixSessionTarget.issueNumber}</span>
              {" "}{fixSessionTarget.title}
            </p>
            {fixSessionTarget.description && (
              <p className={`text-xs mb-1 whitespace-pre-wrap ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {fixSessionTarget.description}
              </p>
            )}
            {fixSessionTarget.status === "regression" && fixSessionTarget.insights && (
              <p className={`text-xs mb-1 px-2 py-1 rounded ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
                Regression: {fixSessionTarget.insights}
              </p>
            )}
            <div className="mb-4" />

            {/* Previous sessions */}
            {fixSessionTarget.claudeSessionIds && fixSessionTarget.claudeSessionIds.length > 0 && (
              <div className="mb-4">
                <p className={`text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {labels.previousSessions}
                </p>
                <div className="space-y-2">
                  {fixSessionTarget.claudeSessionIds.map(sid => (
                    <div key={sid} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-slate-50"}`}>
                      <span className={`font-mono text-xs break-all ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sid}</span>
                      <button
                        data-id={`resume-session-${sid.slice(0, 8)}`}
                        onClick={() => handleFixSingleIssue(fixSessionTarget, sid)}
                        disabled={fixSessionLoading}
                        className={`text-xs px-3 py-1 rounded-md transition-colors cursor-pointer active:scale-95 ${
                          isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                        } disabled:opacity-50`}
                      >
                        {fixSessionLoading ? labels.launching : labels.resumeSession}
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
                onClick={() => setFixSessionTarget(null)}
                disabled={fixSessionLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer ${btnClass} active:scale-95`}
              >
                {labels.cancel}
              </button>
              <button
                data-id="fix-session-new"
                onClick={() => handleFixSingleIssue(fixSessionTarget)}
                disabled={fixSessionLoading}
                className={`text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                  isDark ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                } disabled:opacity-50 active:scale-95`}
              >
                {fixSessionLoading ? (
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
      )}

      {/* Regression Chat Modal — resumes original clarifier session */}
      {chatTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !chatLoading && closeRegressionChat()}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className={`relative border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden ${dialogBgClass}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold truncate">{labels.resumeChat}</h2>
                <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  <span className="font-mono">#{chatTarget.issueNumber}</span>{" "}{chatTarget.title}
                </p>
              </div>
              <button
                data-id="chat-modal-close"
                onClick={closeRegressionChat}
                disabled={chatLoading}
                className={`ml-3 p-1.5 rounded-md transition-colors cursor-pointer ${btnClass} active:scale-95`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Messages area */}
            <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[16rem] max-h-[50vh] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
              {chatHistoryLoading && (
                <p className={`text-sm text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>{labels.loadingHistory}</p>
              )}
              {!chatHistoryLoading && chatMessages.length === 0 && (
                <p className={`text-sm text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>{labels.noSessionHistory}</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? (isDark ? "bg-indigo-700 text-white" : "bg-indigo-500 text-white")
                      : (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-800")
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className={`px-3 py-2 rounded-lg text-sm ${isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                    {labels.chatThinking}
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Input area */}
            <div className={`border-t px-3 py-2 flex gap-2 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <textarea
                data-id="chat-modal-input"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder={labels.chatPlaceholder}
                rows={1}
                autoFocus
                disabled={chatLoading}
                className={`flex-1 px-3 py-2 rounded-md border text-sm resize-none ${
                  isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500" : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
                } disabled:opacity-50`}
              />
              <button
                data-id="chat-modal-send"
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer active:scale-95 ${
                  isDark ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-indigo-500 hover:bg-indigo-600 text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {labels.sendMessage}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
