"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Issue, IssuesPageLabels, MaintenancePrompt } from './issues-page-types';
import { issuesTranslations } from './issues-page-i18n';
import { MAINTENANCE_PROMPTS } from './maintenance-prompts';
import { useSystemDark, statusBadge, formatDate } from './shared-ui';
import { RegressionChatModal } from './issues-page-chat-modal';
import { ReviewDialog, FixSessionDialog } from './issues-page-dialogs';

export type { Issue, IssuesPageLabels } from './issues-page-types';

interface FeedbackIssuesPageProps {
  lang?: string;
  labels?: Partial<IssuesPageLabels>;
  colorScheme?: "system" | "light" | "dark";
}

export function FeedbackIssuesPage({ lang, labels: labelOverrides, colorScheme = "system" }: FeedbackIssuesPageProps) {
  const langLabels = lang ? (issuesTranslations[lang] ?? issuesTranslations.en) : issuesTranslations.en;
  const labels = { ...langLabels, ...labelOverrides };
  const systemDark = useSystemDark();
  const isDark = colorScheme === "dark" || (colorScheme !== "light" && systemDark);

  // Seed appName from ?app= so the tab title is correct synchronously on
  // mount, avoiding both the host-app root-metadata flash and the generic
  // "Issues"-only intermediate state before the API responds.
  const [appName, setAppName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('app');
  });
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
  const [reviewTrigger, setReviewTrigger] = useState<{ trigger: Issue; relatedIssues: Issue[]; hasNonClosedSibling: boolean } | null>(null);

  // Fix session choice dialog (for regression issues with previous sessions)
  const [fixSessionTarget, setFixSessionTarget] = useState<Issue | null>(null);
  const [fixSessionLoading, setFixSessionLoading] = useState(false);

  // Regression chat modal
  const [chatTarget, setChatTarget] = useState<Issue | null>(null);
  // Preserved (dismissed but not ended) chat sessions: clarifierSessionId → session data
  const [preservedSessions, setPreservedSessions] = useState<Map<string, { sessionId: string; tmuxSession: string }>>(new Map());
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null);

  // Tabs: "issues" or "maintenance"
  const [activeTab, setActiveTab] = useState<"issues" | "maintenance">("issues");

  // Hide not-urgent toggle
  const [hideNotUrgent, setHideNotUrgent] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('feedback-issues-hide-not-urgent') !== 'false';
  });

  // Maintenance
  const [maintenanceLaunching, setMaintenanceLaunching] = useState<string | null>(null);
  const [maintenanceLaunched, setMaintenanceLaunched] = useState<string | null>(null);
  const [maintenanceIssues, setMaintenanceIssues] = useState<Map<string, Issue>>(new Map());

  // Distinct tab title & favicon for the issues page
  const originalTitleRef = useRef<string>('');

  useEffect(() => {
    originalTitleRef.current = document.title;

    // Append our favicon last in <head>. Don't remove framework-inserted
    // favicons (Next.js metadata, etc.) — those nodes are tracked by React's
    // fiber tree, and removing them causes "Cannot read properties of null
    // (reading 'removeChild')" on the next reconciliation when React tries
    // to unmount a node whose parent is already null. Browsers pick the last
    // size-ambiguous `rel="icon"` link, so placing ours last is enough for it
    // to win visually without mutating any node React manages.
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#7c3aed"/><circle cx="16" cy="24" r="2" fill="white"/><rect x="14" y="6" width="4" height="14" rx="2" fill="white"/></svg>'
    );
    document.head.appendChild(link);

    // Keep our link last when the framework re-inserts its own favicon.
    // We re-append (which just moves it — no duplicates) rather than removing
    // the newcomer, which would desync React's fiber tree.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLLinkElement && node !== link && (node.rel === 'icon' || node.rel === 'shortcut icon')) {
            if (link.parentNode === document.head && document.head.lastElementChild !== link) {
              document.head.appendChild(link);
            }
            return;
          }
        }
      }
    });
    observer.observe(document.head, { childList: true });

    return () => {
      observer.disconnect();
      document.title = originalTitleRef.current;
      link.remove();
    };
  }, []);

  useEffect(() => {
    document.title = appName ? `${appName} — ${labels.pageTitle}` : labels.pageTitle;
  }, [appName, labels.pageTitle]);

  // Expose the currently-viewed app so FeedbackChat can tell whether it's
  // already showing addnewfeature's issues (refresh) or another app's (new tab).
  useEffect(() => {
    const w = window as Window & { __feedbackIssuesAppName?: string };
    if (appName) w.__feedbackIssuesAppName = appName;
    return () => { delete w.__feedbackIssuesAppName; };
  }, [appName]);

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

      // Extract maintenance issues — map prompt title to latest active (non-closed) issue
      const maintMap = new Map<string, Issue>();
      const maintIssues = all
        .filter(i => i.labels?.includes("maintenance"))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const mi of maintIssues) {
        if (!maintMap.has(mi.title) && mi.status !== "closed") {
          maintMap.set(mi.title, mi);
        }
      }
      setMaintenanceIssues(maintMap);
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }, [labels.error]);

  useEffect(() => {
    fetchIssues();
    const interval = setInterval(fetchIssues, 15_000);
    // Allow FeedbackChat to trigger an immediate refresh when on the issues page
    const onRefresh = () => fetchIssues();
    window.addEventListener('feedback-issues-refresh', onRefresh);
    return () => { clearInterval(interval); window.removeEventListener('feedback-issues-refresh', onRefresh); };
  }, [fetchIssues]);

  // Map: clarifierSessionId → { sessionIds, launchDir } from sibling issues that have fix sessions
  const siblingFixMap = useMemo(() => {
    const map = new Map<string, { sessionIds: string[]; launchDir?: string }>();
    for (const issue of issues) {
      if (issue.clarifierSessionId && issue.claudeSessionIds?.length) {
        const existing = map.get(issue.clarifierSessionId);
        const ids = existing?.sessionIds ?? [];
        for (const sid of issue.claudeSessionIds) {
          if (!ids.includes(sid)) ids.push(sid);
        }
        map.set(issue.clarifierSessionId, {
          sessionIds: ids,
          launchDir: existing?.launchDir || issue.claudeLaunchDir,
        });
      }
    }
    return map;
  }, [issues]);

  function getSiblingFixSessions(issue: Issue): string[] {
    if (!issue.clarifierSessionId) return [];
    const sibling = siblingFixMap.get(issue.clarifierSessionId);
    if (!sibling) return [];
    const own = new Set(issue.claudeSessionIds ?? []);
    return sibling.sessionIds.filter(sid => !own.has(sid));
  }

  function getSiblingLaunchDir(issue: Issue): string | undefined {
    if (!issue.clarifierSessionId) return undefined;
    return siblingFixMap.get(issue.clarifierSessionId)?.launchDir;
  }

  function handleChatModalClose() {
    if (chatTarget?.clarifierSessionId) {
      setPreservedSessions(prev => {
        const next = new Map(prev);
        next.delete(chatTarget.clarifierSessionId!);
        return next;
      });
    }
    setChatTarget(null);
  }

  function handleChatModalDismiss(data: { sessionId: string; tmuxSession: string }) {
    if (chatTarget?.clarifierSessionId) {
      setPreservedSessions(prev => {
        const next = new Map(prev);
        next.set(chatTarget.clarifierSessionId!, data);
        return next;
      });
    }
    setChatTarget(null);
  }

  function hasPreservedSession(issue: Issue): boolean {
    return !!issue.clarifierSessionId && preservedSessions.has(issue.clarifierSessionId);
  }

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
        body: JSON.stringify({ action: "update", issueNumber, title: editTitle, description: editDesc, ...(appName && { app: appName }) }),
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
        body: JSON.stringify({ action: "update", issueNumber: issue.issueNumber, labels: newLabels, ...(appName && { app: appName }) }),
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
          ...(appName && { app: appName }),
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
          ...(appName && { app: appName }),
          issues: [{
            number: issue.issueNumber,
            title: issue.title,
            status: issue.status,
            insights: issue.insights,
            claudeSessionIds: issue.claudeSessionIds,
            claudeLaunchDir: issue.claudeLaunchDir,
          }],
          ...(resumeSessionId && { resumeSessionId }),
        }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issue.issueNumber ? { ...i, status: "in_progress" } : i
        ));
        setFixSessionTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || data.error === 'auth_expired') {
          alert(labels.authExpired);
        }
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
    setReviewTrigger({ trigger: issue, relatedIssues: related, hasNonClosedSibling: hasNonClosedSibling(issue) });
  }

  function hasNonClosedSibling(issue: Issue): boolean {
    if (!issue.claudeSessionId) return false;
    return issues.some(i =>
      i.issueNumber !== issue.issueNumber &&
      i.status !== "closed" &&
      i.claudeSessionId === issue.claudeSessionId
    );
  }

  async function handleDirectReview(issue: Issue) {
    setActionLoading(issue.issueNumber);
    try {
      const shouldConclude = !hasNonClosedSibling(issue);
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewed",
          ...(appName && { app: appName }),
          issueNumbers: [issue.issueNumber],
          conclude: shouldConclude,
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

  async function handleCloseForNow(issue: Issue) {
    setActionLoading(issue.issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          ...(appName && { app: appName }),
          issueNumber: issue.issueNumber,
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

  async function handleConfirmReview(selectedNumbers: Set<number>, conclude: boolean) {
    if (!reviewTrigger) return;
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewed",
          ...(appName && { app: appName }),
          issueNumbers: Array.from(selectedNumbers),
          conclude,
          claudeSessionId: reviewTrigger.trigger.claudeSessionId,
          claudeLaunchDir: reviewTrigger.trigger.claudeLaunchDir,
        }),
      });
      if (res.ok) {
        // Optimistically mark as closed
        setIssues(prev => prev.map(i =>
          selectedNumbers.has(i.issueNumber) ? { ...i, status: "closed" } : i
        ));
        setReviewTrigger(null);
      }
    } catch { /* ignore */ }
  }

  async function handleClearRegression(issueNumber: number) {
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", issueNumber, status: "closed", ...(appName && { app: appName }) }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i =>
          i.issueNumber === issueNumber ? { ...i, status: "closed" } : i
        ));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleCloseIssue(issueNumber: number) {
    setActionLoading(issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", issueNumber, ...(appName && { app: appName }) }),
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
        body: JSON.stringify({ action: "delete", issueNumber, ...(appName && { app: appName }) }),
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
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "maintenance", skill: mp.skill, title: mp.title, ...(appName && { app: appName }) }),
      });
      if (res.ok) {
        const data = await res.json();
        // Optimistically add the maintenance issue as in_progress
        if (data.issueNumber) {
          setMaintenanceIssues(prev => {
            const next = new Map(prev);
            next.set(mp.title, {
              issueNumber: data.issueNumber,
              title: mp.title,
              description: "",
              status: "in_progress",
              labels: ["maintenance"],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              claudeSessionId: data.claudeSessionId,
            });
            return next;
          });
        }
        setMaintenanceLaunched(mp.id);
        setTimeout(() => setMaintenanceLaunched(null), 2000);
      }
    } catch { /* ignore */ }
    setMaintenanceLaunching(null);
  }

  async function handleMaintenanceReview(issue: Issue) {
    setActionLoading(issue.issueNumber);
    try {
      const res = await fetch("/api/feedback/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewed",
          ...(appName && { app: appName }),
          issueNumbers: [issue.issueNumber],
          conclude: true,
          claudeSessionId: issue.claudeSessionId,
          claudeLaunchDir: issue.claudeLaunchDir,
        }),
      });
      if (res.ok) {
        // Remove from active maintenance issues (closed)
        setMaintenanceIssues(prev => {
          const next = new Map(prev);
          for (const [title, mi] of next) {
            if (mi.issueNumber === issue.issueNumber) {
              next.delete(title);
              break;
            }
          }
          return next;
        });
      }
    } catch { /* ignore */ }
    setActionLoading(null);
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
    <div data-id="issues-page" className={`min-h-screen ${bgClass} p-6`}>
      <div data-id="issues-container" className="max-w-3xl mx-auto">
        {/* Header */}
        <div data-id="issues-header" className="mb-6 flex items-center justify-between gap-3">
          <h1 data-id="issues-title" className="text-2xl font-bold">{appName ? `${appName} — ${labels.pageTitle}` : labels.pageTitle}</h1>
          <div data-id="issues-header-actions" className="flex items-center gap-2">
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
        <div data-id="issues-tab-bar" className={`flex gap-1 mb-4 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
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
        {loading && <p data-id="issues-loading" className={isDark ? "text-slate-400" : "text-slate-500"}>{labels.loading}</p>}
        {error && <p data-id="issues-error" className="text-red-500">{error}</p>}

        {!loading && !error && displayIssues.length === 0 && (
          <p data-id="issues-empty" className={isDark ? "text-slate-400" : "text-slate-500"}>{labels.noIssues}</p>
        )}

        <div data-id="issues-list" className="space-y-3 overflow-y-auto max-h-[calc(100vh-12rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {displayIssues.map((issue) => {
            const isExpanded = expandedIds.has(issue.issueNumber);
            const isEditing = editingId === issue.issueNumber;
            const hasLongDesc = issue.description && issue.description.length > 120;
            const isClosed = issue.status === "closed";
            const canSelect = !isClosed && issue.status !== "review";
            const isReview = issue.status === "review";
            const isRegression = issue.status === "regression";

            return (
              <div key={issue.issueNumber} data-id={`issue-card-${issue.issueNumber}`} className={`border rounded-lg p-4 ${cardClass} transition-colors ${
                isRegression
                  ? (isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-200")
                  : isReview
                    ? (isDark ? "border-purple-700/50" : "border-purple-200")
                    : ""
              }`}>
                {isEditing ? (
                  <div data-id={`issue-edit-form-${issue.issueNumber}`} className="space-y-3">
                    <div data-id={`issue-edit-meta-${issue.issueNumber}`} className="flex items-center gap-2 mb-1">
                      <span data-id={`issue-edit-number-${issue.issueNumber}`} className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
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
                    <div data-id={`issue-edit-actions-${issue.issueNumber}`} className="flex gap-2">
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
                  <div data-id={`issue-content-${issue.issueNumber}`} className="flex items-start gap-3">
                    {/* Checkbox for selectable issues */}
                    {canSelect && (
                      <div data-id={`issue-checkbox-wrap-${issue.issueNumber}`} className="pt-1 flex-shrink-0">
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
                      data-id={`issue-body-${issue.issueNumber}`}
                      className="flex-1 min-w-0 cursor-pointer"
                      onMouseDown={(e) => { mouseDownRef.current = { x: e.clientX, y: e.clientY }; }}
                      onClick={(e) => { const s = mouseDownRef.current; if (s && (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3)) return; if (window.getSelection()?.toString()) return; setExpandedIds(prev => { const next = new Set(prev); if (next.has(issue.issueNumber)) next.delete(issue.issueNumber); else next.add(issue.issueNumber); return next; }); }}
                    >
                      <div data-id={`issue-meta-${issue.issueNumber}`} className="flex items-center gap-2 mb-1">
                        <span data-id={`issue-number-${issue.issueNumber}`} className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>#{issue.issueNumber}</span>
                        {statusBadge(issue.status, labels, isDark)}
                        {issue.labels?.map((label, i) => (
                          <span data-id={`issue-label-${issue.issueNumber}-${i}`} key={`${label}-${i}`} className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                      <h3 data-id={`issue-title-${issue.issueNumber}`} className="font-medium">{issue.title}</h3>
                      {issue.description && (
                        <p data-id={`issue-desc-${issue.issueNumber}`} className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-600"} ${!isExpanded && hasLongDesc ? "line-clamp-2" : ""} whitespace-pre-wrap`}>
                          {issue.description}
                        </p>
                      )}
                      {issue.insights && isExpanded && (
                        <p data-id={`issue-insights-${issue.issueNumber}`} className={`text-sm mt-2 italic ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {issue.insights}
                        </p>
                      )}
                      <p data-id={`issue-date-${issue.issueNumber}`} className={`text-xs mt-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        {formatDate(issue.createdAt)}
                      </p>
                      {(issue.clarifierSessionId || (issue.claudeSessionIds && issue.claudeSessionIds.length > 0)) && (
                        <div data-id={`issue-sessions-${issue.issueNumber}`} className={`text-xs font-mono mt-1 flex flex-col gap-y-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {issue.clarifierSessionId && (
                            <span data-id={`issue-clarifier-session-${issue.issueNumber}`} title={issue.clarifierSessionId}>
                              <span className="text-emerald-500/70 inline-block w-20">clarifier:</span>{issue.clarifierSessionId.slice(0, 8)}
                            </span>
                          )}
                          {issue.claudeSessionIds && issue.claudeSessionIds.length > 0 && (
                            <span data-id={`issue-fix-sessions-${issue.issueNumber}`} title={issue.claudeSessionIds.join('\n')}>
                              <span className="text-sky-500/70 inline-block w-20">fix:</span>{issue.claudeSessionIds.map(id => id.slice(0, 8)).join(' · ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div data-id={`issue-actions-${issue.issueNumber}`} className="flex-shrink-0 flex items-center gap-2">
                      {/* Review response buttons: Fixed / Resume Clarifier Session */}
                      {isReview && (
                        <>
                          <button
                            data-id={`review-fixed-${issue.issueNumber}`}
                            onClick={() => handleDirectReview(issue)}
                            onContextMenu={(e) => { e.preventDefault(); openReviewDialog(issue); }}
                            disabled={actionLoading === issue.issueNumber}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isDark ? "bg-green-900 hover:bg-green-800 text-green-200" : "bg-green-100 hover:bg-green-200 text-green-700"
                            } disabled:opacity-50`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                            {actionLoading === issue.issueNumber ? labels.reviewing : labels.fixed}
                          </button>
                          <button
                            data-id={`review-close-for-now-${issue.issueNumber}`}
                            onClick={() => handleCloseForNow(issue)}
                            disabled={actionLoading === issue.issueNumber}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isDark ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200" : "bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                            } disabled:opacity-50`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            {actionLoading === issue.issueNumber ? labels.closing : labels.closeForNow}
                          </button>
                          <button
                            data-id={`review-resume-clarifier-${issue.issueNumber}`}
                            onClick={() => setChatTarget(issue)}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isDark ? "bg-red-900 hover:bg-red-800 text-red-200" : "bg-red-100 hover:bg-red-200 text-red-700"
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            {labels.resumeClarifierSession}
                          </button>
                        </>
                      )}
                      {/* Closed issues — reopen the clarifier chat to report it's still broken */}
                      {isClosed && (
                        <button
                          data-id={`not-working-${issue.issueNumber}`}
                          onClick={() => setChatTarget(issue)}
                          title={labels.resumeClarifierSession}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${btnClass} hover:text-red-500 active:scale-95`}
                        >
                          {labels.notWorking}
                        </button>
                      )}
                      {/* Resume Chat button for preserved sessions (non-review, non-closed statuses) */}
                      {!isReview && !isClosed && hasPreservedSession(issue) && (
                        <button
                          data-id={`resume-chat-${issue.issueNumber}`}
                          onClick={() => setChatTarget(issue)}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            isDark ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-500 hover:bg-indigo-600 text-white"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                          {labels.resumeChat}
                        </button>
                      )}
                      {/* Fix with Claude button for regression issues */}
                      {isRegression && (
                        <button
                          data-id={`fix-regression-${issue.issueNumber}`}
                          onClick={() => {
                            const siblingIds = getSiblingFixSessions(issue);
                            const allSessionIds = [...(issue.claudeSessionIds || []), ...siblingIds];
                            if (allSessionIds.length > 0) {
                              setFixSessionTarget({
                                ...issue,
                                claudeSessionIds: allSessionIds,
                                claudeLaunchDir: issue.claudeLaunchDir || getSiblingLaunchDir(issue),
                              });
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
                      {/* Fix with Claude button for open/in_progress issues */}
                      {(issue.status === "open" || issue.status === "in_progress") && (
                        <button
                          data-id={`fix-issue-${issue.issueNumber}`}
                          onClick={() => {
                            const siblingIds = getSiblingFixSessions(issue);
                            const allSessionIds = [...(issue.claudeSessionIds || []), ...siblingIds];
                            if (allSessionIds.length > 0) {
                              setFixSessionTarget({
                                ...issue,
                                claudeSessionIds: allSessionIds,
                                claudeLaunchDir: issue.claudeLaunchDir || getSiblingLaunchDir(issue),
                              });
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
          <div data-id="maintenance-tab" className="space-y-2">
            {MAINTENANCE_PROMPTS.map(mp => {
              const activeIssue = maintenanceIssues.get(mp.title);
              const isInProgress = activeIssue?.status === "in_progress";
              const isReview = activeIssue?.status === "review";
              return (
                <div key={mp.id} data-id={`maintenance-card-${mp.id}`} className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${cardClass}`}>
                  <div data-id={`maintenance-info-${mp.id}`} className="min-w-0 flex items-center gap-2">
                    <div data-id={`maintenance-title-wrap-${mp.id}`} title={mp.description}>
                      <p data-id={`maintenance-title-${mp.id}`} className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{mp.title}</p>
                    </div>
                    {activeIssue && statusBadge(activeIssue.status, labels, isDark)}
                  </div>
                  {isReview ? (
                    <button
                      data-id={`maintenance-review-${mp.id}`}
                      onClick={() => handleMaintenanceReview(activeIssue)}
                      disabled={actionLoading === activeIssue.issueNumber}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        isDark ? "bg-green-900 hover:bg-green-800 text-green-200" : "bg-green-100 hover:bg-green-200 text-green-700"
                      } active:scale-95 disabled:opacity-50`}
                    >
                      {actionLoading === activeIssue.issueNumber ? labels.closing : labels.fixed}
                    </button>
                  ) : (
                    <button
                      data-id={`maintenance-launch-${mp.id}`}
                      onClick={() => handleMaintenanceLaunch(mp)}
                      disabled={maintenanceLaunching !== null || isInProgress}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        maintenanceLaunched === mp.id
                          ? (isDark ? "bg-green-800 text-green-200" : "bg-green-100 text-green-700")
                          : isInProgress
                            ? (isDark ? "bg-yellow-900 text-yellow-300" : "bg-yellow-100 text-yellow-800")
                            : (isDark ? "bg-slate-600 hover:bg-slate-500 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-700")
                      } disabled:opacity-50 active:scale-95`}
                    >
                      {maintenanceLaunched === mp.id ? labels.maintenanceLaunched : maintenanceLaunching === mp.id ? labels.maintenanceLaunching : isInProgress ? labels.inProgress : labels.maintenanceLaunch}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      {reviewTrigger && (
        <ReviewDialog
          trigger={reviewTrigger.trigger}
          relatedIssues={reviewTrigger.relatedIssues}
          labels={labels}
          isDark={isDark}
          dialogBgClass={dialogBgClass}
          btnClass={btnClass}
          hasNonClosedSibling={reviewTrigger.hasNonClosedSibling}
          onClose={() => setReviewTrigger(null)}
          onConfirm={handleConfirmReview}
        />
      )}

      {/* Fix Session Choice Dialog */}
      {fixSessionTarget && (
        <FixSessionDialog
          issue={fixSessionTarget}
          labels={labels}
          isDark={isDark}
          dialogBgClass={dialogBgClass}
          btnClass={btnClass}
          fixLoading={fixSessionLoading}
          onClose={() => setFixSessionTarget(null)}
          onFixSingleIssue={handleFixSingleIssue}
        />
      )}

      {/* Regression Chat Modal */}
      {chatTarget && (
        <RegressionChatModal
          issue={chatTarget}
          appName={appName}
          labels={labels}
          isDark={isDark}
          onClose={handleChatModalClose}
          onDismiss={handleChatModalDismiss}
          fetchIssues={fetchIssues}
          initialSessionId={chatTarget.clarifierSessionId ? preservedSessions.get(chatTarget.clarifierSessionId)?.sessionId : undefined}
          initialTmuxSession={chatTarget.clarifierSessionId ? preservedSessions.get(chatTarget.clarifierSessionId)?.tmuxSession : undefined}
        />
      )}
    </div>
  );
}
