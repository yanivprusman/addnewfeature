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
export function StaleIssueList({ issues, isDark, label, onResend, resendLabel }: { issues: ChatIssue[]; isDark: boolean; label: string; onResend?: (issues: ChatIssue[]) => void; resendLabel?: string }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <div data-id="stale-issue-list" className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2 opacity-50`}>
      <p data-id="stale-issue-list-label" className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</p>
      {issues.map((issue, j) => (
        <div data-id={`stale-issue-item-${j}`} key={j} className="flex items-start gap-2 p-2">
          <input data-id={`stale-issue-checkbox-${j}`} type="checkbox" checked disabled className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600" />
          <div data-id={`stale-issue-content-${j}`} className="flex-1 min-w-0">
            <p data-id={`stale-issue-title-${j}`} className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
            <p
              data-id={`stale-issue-description-${j}`}
              className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} ${expanded[j] ? '' : 'line-clamp-2'} cursor-pointer whitespace-pre-wrap`}
              onMouseDown={(e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; }}
              onClick={(e) => { const s = mouseRef.current; if (s && (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3)) return; if (window.getSelection()?.toString()) return; setExpanded(prev => ({ ...prev, [j]: !prev[j] })); }}
            >
              {issue.description}
            </p>
          </div>
        </div>
      ))}
      {onResend && (
        <button
          data-id="stale-issue-resend"
          onClick={() => onResend(issues)}
          className={`w-full mt-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
        >
          {resendLabel ?? "Re-send"}
        </button>
      )}
    </div>
  );
}

/** Auto-resize a textarea to fit content (max 120px). */
export function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/** Copy-to-clipboard icon button for a chat message bubble. */
function CopyMessageButton({ text, isUser, isDark, label, copiedLabel }: {
  text: string;
  isUser: boolean;
  isDark: boolean;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore
    }
  };
  const tone = isUser
    ? 'text-white/70 hover:text-white hover:bg-white/10'
    : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200');
  const visibility = copied
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100';
  return (
    <button
      type="button"
      data-id="chat-msg-copy"
      onClick={handleCopy}
      aria-label={label}
      title={copied ? copiedLabel : label}
      className={`shrink-0 self-end -mb-0.5 -mr-1 p-1 rounded-md transition-opacity transition-colors ${visibility} ${tone}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M16.704 5.29a.75.75 0 010 1.06l-8.25 8.25a.75.75 0 01-1.06 0l-3.75-3.75a.75.75 0 111.06-1.06L7.96 13.04l7.72-7.75a.75.75 0 011.024 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h5A1.5 1.5 0 0115 3.5v9a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 017 12.5v-9z" />
          <path d="M5 6.5A1.5 1.5 0 016.5 5H7v7.5A2.5 2.5 0 009.5 15H13v.5A1.5 1.5 0 0111.5 17h-5A1.5 1.5 0 015 15.5v-9z" />
        </svg>
      )}
    </button>
  );
}

/** Chat message list — renders user/assistant bubbles with inline stale issues. */
export function ChatMessages({ messages, isDark, accentBg = 'bg-indigo-600', selectIssuesLabel, onResendStale, resendLabel, copyLabel = 'Copy', copiedLabel = 'Copied' }: {
  messages: { role: string; text: string; staleIssues?: ChatIssue[] }[];
  isDark: boolean;
  accentBg?: string;
  selectIssuesLabel: string;
  onResendStale?: (issues: ChatIssue[]) => void;
  resendLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  return (
    <>
      {messages.map((msg, i) => (
        <Fragment key={i}>
          {msg.text && (
            <div data-id={`chat-msg-row-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div data-id={`chat-msg-bubble-${i}`} className={`group max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap flex items-start gap-2 ${
                msg.role === "user"
                  ? `${accentBg} text-white`
                  : (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-800")
              }`}>
                <span data-id={`chat-msg-text-${i}`} className="min-w-0 flex-1">{msg.text}</span>
                <CopyMessageButton text={msg.text} isUser={msg.role === "user"} isDark={isDark} label={copyLabel} copiedLabel={copiedLabel} />
              </div>
            </div>
          )}
          {msg.staleIssues && (
            <StaleIssueList issues={msg.staleIssues} isDark={isDark} label={selectIssuesLabel} onResend={onResendStale} resendLabel={resendLabel} />
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
    <div data-id="chat-issue-checklist" className={`${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3 space-y-2`}>
      <p data-id="chat-issue-checklist-label" className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{selectLabel}</p>
      {issues.map((issue, i) => (
        <label data-id={`chat-issue-label-${i}`} key={i} className={`flex items-start gap-2 cursor-pointer p-2 rounded-lg ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'} transition-colors`}>
          <input
            data-id={`chat-issue-checkbox-${i}`}
            type="checkbox"
            checked={checkedIssues[i] ?? true}
            onChange={() => onToggle(i)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div data-id={`chat-issue-content-${i}`} className="flex-1 min-w-0">
            <p data-id={`chat-issue-title-${i}`} className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{issue.title}</p>
            <p
              data-id={`chat-issue-description-${i}`}
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
        data-id="chat-issue-submit"
        onClick={onSubmit}
        disabled={submitting || !checkedIssues.some(Boolean)}
        className={`w-full mt-1 px-3 py-2 ${accentClass} ${isDark ? 'disabled:bg-slate-600' : 'disabled:bg-slate-300'} text-white text-sm font-medium rounded-lg transition-colors`}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

// Issue submission moved into FeedbackBackend.submitChatIssues — callers
// now invoke `backend.submitChatIssues(selected, { ... })` directly instead
// of importing a helper here.

/** Submit results display (green box). */
export function ChatSubmitResults({ results, isDark, issuePrefix = 'Issue #' }: {
  results: ChatSubmitResult[];
  isDark: boolean;
  issuePrefix?: string;
}) {
  return (
    <div data-id="chat-submit-results" className={`${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border rounded-xl p-3 space-y-1`}>
      {results.map((result, i) => (
        <p data-id={`chat-submit-result-${i}`} key={i} className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
          {result.success ? `${issuePrefix}${result.issueNumber ?? "?"} — ${result.title}` : `Failed: ${result.title}`}
        </p>
      ))}
    </div>
  );
}

/** Thinking indicator bubble. */
export function ChatThinking({ isDark, label }: { isDark: boolean; label: string }) {
  return (
    <div data-id="chat-thinking" className="flex justify-start">
      <div data-id="chat-thinking-bubble" className={`${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'} px-3 py-2 rounded-xl text-sm`}>{label}</div>
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
    <div data-id="chat-input-area" className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-200'} px-3 py-2 flex gap-2`}>
      <textarea
        data-id="chat-input-textarea"
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
        data-id="chat-input-send"
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
