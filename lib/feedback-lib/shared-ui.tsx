import { useState, useEffect, useRef, Fragment } from "react";
import type { IssuesPageLabels } from './issues-page-types';

export function useSystemDark() {
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

export function statusBadge(status: string, labels: IssuesPageLabels, isDark: boolean) {
  const map: Record<string, { label: string; bg: string }> = {
    open: { label: labels.open, bg: isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800" },
    closed: { label: labels.closed, bg: isDark ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-600" },
    in_progress: { label: labels.inProgress, bg: isDark ? "bg-yellow-900 text-yellow-300" : "bg-yellow-100 text-yellow-800" },
    review: { label: labels.review, bg: isDark ? "bg-purple-900 text-purple-300" : "bg-purple-100 text-purple-800" },
    regression: { label: labels.regression, bg: isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800" },
  };
  const entry = map[status] ?? map.open;
  return (
    <span data-id={`status-badge-${status}`} className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.bg}`}>
      {entry.label}
    </span>
  );
}

export function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// ---- Chat shared types and components ----

/** Simple issue with title and description, used in chat UI */
export interface ChatIssue {
  title: string;
  description: string;
}

/** Result of submitting an issue from chat */
export interface ChatSubmitResult {
  title: string;
  issueNumber?: number;
  success: boolean;
}

/** Grayed-out issue checklist for previously-proposed issues in chat history. */
export function StaleIssueList({ issues, isDark, label }: { issues: ChatIssue[]; isDark: boolean; label: string }) {
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

/** Auto-resize a textarea to fit content (max 120px). */
export function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/** Chat message list — renders user/assistant bubbles with inline stale issues. */
export function ChatMessages({ messages, isDark, accentBg = 'bg-indigo-600', selectIssuesLabel }: {
  messages: { role: string; text: string; staleIssues?: ChatIssue[] }[];
  isDark: boolean;
  accentBg?: string;
  selectIssuesLabel: string;
}) {
  return (
    <>
      {messages.map((msg, i) => (
        <Fragment key={i}>
          {msg.text && (
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? `${accentBg} text-white`
                  : (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-800")
              }`}>
                {msg.text}
              </div>
            </div>
          )}
          {msg.staleIssues && (
            <StaleIssueList issues={msg.staleIssues} isDark={isDark} label={selectIssuesLabel} />
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Active issue checklist with checkboxes and submit button. */
export function ChatIssueChecklist({ issues, checkedIssues, onToggle, onSubmit, submitting, isDark, accentClass = 'bg-indigo-600 hover:bg-indigo-700', selectLabel, submitLabel, submittingLabel, expandable = false }: {
  issues: ChatIssue[];
  checkedIssues: boolean[];
  onToggle: (i: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  isDark: boolean;
  accentClass?: string;
  selectLabel: string;
  submitLabel: string;
  submittingLabel: string;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2`}>
      <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{selectLabel}</p>
      {issues.map((issue, i) => (
        <label key={i} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'} transition-colors`}>
          <input
            type="checkbox"
            checked={checkedIssues[i] ?? true}
            onChange={() => onToggle(i)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
            <p
              className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} ${expandable ? 'cursor-pointer' : ''} ${expandable && !expanded[i] ? 'line-clamp-2' : ''} whitespace-pre-wrap`}
              {...(expandable ? {
                onMouseDown: (e: React.MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; },
                onClick: (e: React.MouseEvent) => { e.preventDefault(); const s = mouseRef.current; if (s && (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3)) return; if (window.getSelection()?.toString()) return; setExpanded(prev => ({ ...prev, [i]: !prev[i] })); }
              } : {})}
            >
              {issue.description}
            </p>
          </div>
        </label>
      ))}
      <button
        onClick={onSubmit}
        disabled={submitting || !checkedIssues.some(Boolean)}
        className={`w-full mt-1 px-3 py-2 ${accentClass} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white text-sm font-medium rounded-lg transition-colors`}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

/** Submit results display (green box). */
export function ChatSubmitResults({ results, isDark, issuePrefix = 'Issue #' }: {
  results: ChatSubmitResult[];
  isDark: boolean;
  issuePrefix?: string;
}) {
  return (
    <div className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
      {results.map((result, i) => (
        <p key={i} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
          {result.success ? `${issuePrefix}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
        </p>
      ))}
    </div>
  );
}

/** Thinking indicator bubble. */
export function ChatThinking({ isDark, label }: { isDark: boolean; label: string }) {
  return (
    <div className="flex justify-start">
      <div className={`${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'} px-3 py-2 rounded-xl text-sm`}>{label}</div>
    </div>
  );
}

/** Chat input area with auto-resizing textarea and send button. */
export function ChatInput({ input, onInputChange, onSend, sendDisabled, inputDisabled, isDark, accentClass = 'bg-indigo-600 hover:bg-indigo-700', placeholder, inputRef: externalRef, autoFocus }: {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sendDisabled?: boolean;
  inputDisabled?: boolean;
  isDark: boolean;
  accentClass?: string;
  placeholder: string;
  inputRef?: { current: HTMLTextAreaElement | null };
  autoFocus?: boolean;
}) {
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const ref = externalRef || fallbackRef;

  return (
    <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-200'} px-3 py-2 flex gap-2`}>
      <textarea
        ref={ref}
        value={input}
        onChange={e => { onInputChange(e.target.value); autoResizeTextarea(e.target); }}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        disabled={inputDisabled}
        className={`flex-1 resize-none rounded-lg border ${isDark ? 'border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50`}
      />
      <button
        onClick={onSend}
        disabled={sendDisabled || !input.trim()}
        className={`px-3 py-2 ${accentClass} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white rounded-lg transition-colors`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
        </svg>
      </button>
    </div>
  );
}
