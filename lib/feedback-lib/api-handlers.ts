import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { launchFeedback, resumeFeedback, sendMessage, killFeedback, isTmuxAlive, launchFix, launchFixResume, launchConclude, launchMaintenance } from './claude-launcher';
import { waitForResponse, resolveResponse } from './pending-responses';

/** Track last activity timestamp per tmux session for auto-cleanup.
 *  Use globalThis to avoid Turbopack module duplication (same fix as pending-responses). */
const SESSION_ACTIVITY_KEY = Symbol.for('feedback-lib:session-last-activity');
const CLEANUP_STARTED_KEY = Symbol.for('feedback-lib:cleanup-interval-started');
const SESSION_ID_MAP_KEY = Symbol.for('feedback-lib:session-id-to-tmux');
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** The /issues page is feedback-lib code owned by addnewfeature.
 *  Issues reported via the widget from that page should go to addnewfeature, not the host app. */
const FEEDBACK_LIB_APP = 'addnewfeature';
const FEEDBACK_LIB_WORKDIR = '/opt/dev/addnewfeature';
const FEEDBACK_LIB_PAGES = ['/issues'];

type SessionInfo = { timestamp: number; appName: string };

function getSessionActivityMap(): Map<string, SessionInfo> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SESSION_ACTIVITY_KEY]) {
    g[SESSION_ACTIVITY_KEY] = new Map<string, SessionInfo>();
  }
  return g[SESSION_ACTIVITY_KEY] as Map<string, SessionInfo>;
}

function isCleanupStarted(): boolean {
  return !!(globalThis as Record<symbol, unknown>)[CLEANUP_STARTED_KEY];
}

function markCleanupStarted(): void {
  (globalThis as Record<symbol, unknown>)[CLEANUP_STARTED_KEY] = true;
}

function startSessionCleanupInterval() {
  if (isCleanupStarted()) return;
  markCleanupStarted();

  setInterval(() => {
    const sessionLastActivity = getSessionActivityMap();
    const now = Date.now();
    for (const [tmux, info] of sessionLastActivity.entries()) {
      if (now - info.timestamp > SESSION_TIMEOUT_MS) {
        killFeedback(tmux, info.appName);
        sessionLastActivity.delete(tmux);
      }
    }
  }, 60_000); // Check every minute
}

function touchSession(tmuxSession: string, appName: string) {
  getSessionActivityMap().set(tmuxSession, { timestamp: Date.now(), appName });
}

function removeSession(tmuxSession: string) {
  getSessionActivityMap().delete(tmuxSession);
  // Also remove from sessionId→tmux map
  const idMap = getSessionIdMap();
  for (const [sid, tmux] of idMap.entries()) {
    if (tmux.tmuxSession === tmuxSession) { idMap.delete(sid); break; }
  }
}

/** Map Claude sessionId → { tmuxSession, appName } for SessionEnd hook lookup */
function getSessionIdMap(): Map<string, { tmuxSession: string; appName: string }> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SESSION_ID_MAP_KEY]) {
    g[SESSION_ID_MAP_KEY] = new Map<string, { tmuxSession: string; appName: string }>();
  }
  return g[SESSION_ID_MAP_KEY] as Map<string, { tmuxSession: string; appName: string }>;
}

function trackSessionId(sessionId: string, tmuxSession: string, appName: string) {
  getSessionIdMap().set(sessionId, { tmuxSession, appName });
}

/** Build a location tag like [Page: /path | Tab: Design & 3D] from pagePath + pageContext */
function buildLocationTag(pagePath?: string, pageContext?: string): string | null {
  const parts: string[] = [];
  if (pagePath) parts.push(`Page: ${pagePath}`);
  if (pageContext) parts.push(`Tab: ${pageContext}`);
  return parts.length > 0 ? `[${parts.join(' | ')}]` : null;
}

/**
 * Returns a POST handler for /api/feedback
 * Launches or messages the Claude issue-clarifier session.
 */
export function handleFeedbackMessage(appName: string, workDir: string) {
  startSessionCleanupInterval();

  return async function POST(request: NextRequest) {
    try {
      const { message, sessionId, tmuxSession, resumeSessionId, pagePath, pageContext } = await request.json();

      if (!message || typeof message !== 'string' || !message.trim()) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
      }

      let csid: string;
      let tmux: string;

      if (sessionId && tmuxSession) {
        // Active session — send to existing tmux
        csid = sessionId;
        tmux = tmuxSession;
        sendMessage(tmux, message.trim());
      } else {
        // Detect the app's port: try request URL, then Host header, then PORT env.
        // Behind a reverse proxy (nginx), request headers lose the port, so
        // process.env.PORT (set by the daemon's generated systemd service) is the
        // reliable fallback.
        const appPort = parseInt(request.nextUrl.port)
          || parseInt(request.headers.get('host')?.split(':')[1] || '')
          || parseInt(process.env.PORT || '')
          || undefined;

        // If reporting from a feedback-lib page (e.g. /issues), redirect to addnewfeature
        // Extract pathname only (pagePath may include search/hash)
        const pathOnly = pagePath?.split(/[?#]/)[0];
        const isFeedbackLibPage = pathOnly && FEEDBACK_LIB_PAGES.includes(pathOnly);
        const effectiveApp = isFeedbackLibPage ? FEEDBACK_LIB_APP : appName;
        const effectiveWorkDir = isFeedbackLibPage ? FEEDBACK_LIB_WORKDIR : workDir;

        const locationTag = buildLocationTag(pagePath, pageContext);
        const firstMessage = locationTag
          ? `${locationTag}\n\n${message.trim()}`
          : message.trim();

        if (resumeSessionId) {
          // Resume a previous session in a new tmux
          try {
            const result = resumeFeedback({ appName: effectiveApp, workDir: effectiveWorkDir, resumeSessionId, firstMessage, appPort });
            csid = result.claudeSessionId;
            tmux = result.tmuxSession;
            trackSessionId(csid, tmux, effectiveApp);
          } catch (err) {
            if (err instanceof Error && err.message === 'session_expired') {
              return NextResponse.json(
                { error: 'session_expired', message: 'Previous session could not be restored.' },
                { status: 410 },
              );
            }
            throw err;
          }
        } else {
          // New session
          const result = launchFeedback({ appName: effectiveApp, workDir: effectiveWorkDir, firstMessage, appPort });
          csid = result.claudeSessionId;
          tmux = result.tmuxSession;
          trackSessionId(csid, tmux, effectiveApp);
        }
      }

      touchSession(tmux, appName);

      let response: string;
      try {
        response = await waitForResponse(csid, 300_000);
      } catch (err) {
        const isTimeout = err instanceof Error && err.message.includes('Timeout');
        if (isTimeout) {
          return NextResponse.json(
            { error: 'timeout', message: 'Claude did not respond in time. Check ~/.claude/hooks/feedback-response-hook.sh and FEEDBACK_APP_PORT env var.', sessionId: csid, tmuxSession: tmux },
            { status: 504 },
          );
        }
        throw err;
      }

      // Check if the response contains a fenced JSON block with issues
      const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
      let issues: { title: string; description: string }[] | undefined;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsed) && parsed.every((item: Record<string, unknown>) => item.title && item.description)) {
            issues = parsed;
          }
        } catch { /* Not valid JSON — ignore */ }
      }

      return NextResponse.json({
        response,
        sessionId: csid,
        tmuxSession: tmux,
        ...(issues && { issues }),

      });
    } catch (err) {
      console.error(`${appName} feedback API error:`, err);
      return NextResponse.json(
        { error: 'server', message: 'Failed to process feedback. Please try again.' },
        { status: 500 },
      );
    }
  };
}


/**
 * Returns a POST handler for /api/feedback/response
 * Called by the Claude Code Stop hook.
 */
export function handleFeedbackResponse() {
  return async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const { session_id, last_assistant_message } = body;

      console.log(`[feedback-lib] handleFeedbackResponse received: session_id=${session_id}, has_message=${!!last_assistant_message}`);

      if (session_id && last_assistant_message) {
        const resolved = resolveResponse(session_id, last_assistant_message);
        console.log(`[feedback-lib] handleFeedbackResponse resolve result: ${resolved}`);
      }

      return NextResponse.json({});
    } catch {
      return NextResponse.json({});
    }
  };
}

/**
 * Returns a POST handler for /api/feedback/submit
 * Creates issues in the daemon tracker for the given app.
 */
export function handleFeedbackSubmit(appName: string) {
  return async function POST(request: NextRequest) {
    try {
      const { issues, pagePath, pageContext, sessionId } = await request.json();

      if (!Array.isArray(issues) || issues.length === 0) {
        return NextResponse.json({ error: 'At least one issue is required' }, { status: 400 });
      }

      const pathOnly = pagePath?.split(/[?#]/)[0];
      const isFeedbackLibPage = pathOnly && FEEDBACK_LIB_PAGES.includes(pathOnly);
      const effectiveApp = isFeedbackLibPage ? FEEDBACK_LIB_APP : appName;

      const results = await Promise.all(
        issues.map(async (issue: { title: string; description: string }) => {
          try {
            const output = await new Promise<string>((resolve, reject) => {
              const locationTag = buildLocationTag(pagePath, pageContext);
              const description = locationTag
                ? `${locationTag}\n\n${issue.description}`
                : issue.description;
              const args = [
                  'send', 'createIssue',
                  '--app', effectiveApp,
                  '--title', issue.title,
                  '--description', description,
                  '--labels', '["user-reported"]',
              ];
              if (sessionId) {
                args.push('--clarifierSessionId', sessionId);
              }
              execFile(
                '/usr/local/bin/daemon',
                args,
                { timeout: 10_000, maxBuffer: 64 * 1024 },
                (error, stdout, stderr) => {
                  if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                  }
                  resolve(stdout.trim());
                },
              );
            });

            const data = JSON.parse(output);
            return {
              title: issue.title,
              issueNumber: data.issueNumber,
              success: true,
            };
          } catch (err) {
            return {
              title: issue.title,
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            };
          }
        }),
      );

      return NextResponse.json({ results });
    } catch (err) {
      console.error(`${appName} feedback submit error:`, err);
      return NextResponse.json({ error: 'Failed to submit issues' }, { status: 500 });
    }
  };
}

/**
 * Returns a POST handler for /api/feedback/close
 * Kills the tmux session and cleans up tmp files.
 */
export function handleFeedbackClose(appName: string, dashboardPort = 3007) {
  return async function POST(request: NextRequest) {
    try {
      const { tmuxSession } = await request.json();
      if (tmuxSession) {
        // Extract claudeSessionId before removeSession clears the map
        let claudeSessionId: string | undefined;
        const idMap = getSessionIdMap();
        for (const [sid, entry] of idMap.entries()) {
          if (entry.tmuxSession === tmuxSession) {
            claudeSessionId = sid;
            break;
          }
        }

        killFeedback(tmuxSession, appName);
        removeSession(tmuxSession);

        // Unregister from dashboard session registry
        if (claudeSessionId) {
          const dashboardKey = `${appName}-feedback-${claudeSessionId.slice(0, 8)}`;
          fetch(`http://localhost:${dashboardPort}/api/claude-sessions/${dashboardKey}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Failed to close session' }, { status: 500 });
    }
  };
}

/**
 * Returns a GET handler for /api/feedback/status
 * Checks if a tmux session is still alive.
 */
export function handleFeedbackStatus() {
  return async function GET(request: NextRequest) {
    try {
      const tmuxSession = request.nextUrl.searchParams.get('tmuxSession');
      if (!tmuxSession) {
        return NextResponse.json({ error: 'tmuxSession parameter required' }, { status: 400 });
      }
      const alive = isTmuxAlive(tmuxSession);
      return NextResponse.json({ alive });
    } catch {
      return NextResponse.json({ alive: false });
    }
  };
}

/**
 * Returns a POST handler for /api/feedback/session-end
 * Called by the Claude Code SessionEnd hook when a session exits.
 * Kills the associated tmux session and cleans up tracking state.
 */
export function handleFeedbackSessionEnd(appName: string, dashboardPort = 3007) {
  return async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const { session_id } = body;

      if (!session_id) {
        return NextResponse.json({ ok: true }); // Nothing to do
      }

      const idMap = getSessionIdMap();
      const entry = idMap.get(session_id);

      if (entry) {
        killFeedback(entry.tmuxSession, entry.appName);
        removeSession(entry.tmuxSession);
        // Unregister from dashboard session registry
        const dashboardKey = `${appName}-feedback-${session_id.slice(0, 8)}`;
        fetch(`http://localhost:${dashboardPort}/api/claude-sessions/${dashboardKey}`, {
          method: 'DELETE',
        }).catch(() => {});
        console.log(`[feedback-lib] SessionEnd: killed tmux=${entry.tmuxSession} for session=${session_id}`);
      } else {
        console.log(`[feedback-lib] SessionEnd: no tracked tmux for session=${session_id}`);
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(`[feedback-lib] SessionEnd error:`, err);
      return NextResponse.json({ ok: true }); // Don't fail the hook
    }
  };
}

/**
 * Returns a handler for /api/feedback/issues
 * GET: list issues for the app
 * POST: close, reopen, update, fix, or reviewed action
 */
export function handleFeedbackIssues(appName: string, opts?: { workDir?: string; dashboardPort?: number }) {
  const workDir = opts?.workDir;
  const dashboardPort = opts?.dashboardPort ?? 3007;

  function daemonExec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        '/usr/local/bin/daemon',
        args,
        { timeout: 10_000, maxBuffer: 256 * 1024 },
        (error, stdout, stderr) => {
          if (error) { reject(new Error(stderr || error.message)); return; }
          resolve(stdout.trim());
        },
      );
    });
  }

  async function GET(request: NextRequest) {
    try {
      const overrideApp = request.nextUrl.searchParams.get('app');
      const effectiveApp = overrideApp || appName;
      const output = await daemonExec(['send', 'listIssues', '--app', effectiveApp]);
      const issues = JSON.parse(output);
      return NextResponse.json({ issues, appName: effectiveApp });
    } catch (err) {
      console.error(`${appName} issues list error:`, err);
      return NextResponse.json({ error: 'Failed to list issues' }, { status: 500 });
    }
  }

  async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const { action } = body;

      // --- Create issue directly (bypass clarifier) ---
      if (action === 'create') {
        const { title, description, pagePath, pageContext } = body;
        if (!title || typeof title !== 'string' || !title.trim()) {
          return NextResponse.json({ error: 'title is required' }, { status: 400 });
        }
        const pathOnly = pagePath?.split(/[?#]/)[0];
        const isFeedbackLibPage = pathOnly && FEEDBACK_LIB_PAGES.includes(pathOnly);
        const effectiveApp = isFeedbackLibPage ? FEEDBACK_LIB_APP : appName;
        const locationTag = buildLocationTag(pagePath, pageContext);
        const fullDesc = locationTag
          ? `${locationTag}\n\n${(description || '').trim()}`
          : (description || '').trim();
        const args = [
          'send', 'createIssue',
          '--app', effectiveApp,
          '--title', title.trim(),
          '--description', fullDesc,
          '--labels', '["user-reported"]',
        ];
        const output = await daemonExec(args);
        const data = JSON.parse(output);
        return NextResponse.json({ ok: true, issueNumber: data.issueNumber, effectiveApp });
      }

      // --- Fix with Claude ---
      if (action === 'fix') {
        if (!workDir) {
          return NextResponse.json({ error: 'Fix not configured — workDir not set' }, { status: 400 });
        }
        const issues: { number: number; title: string; status?: string; insights?: string; claudeSessionIds?: string[] }[] = body.issues;
        if (!Array.isArray(issues) || issues.length === 0) {
          return NextResponse.json({ error: 'issues array required' }, { status: 400 });
        }

        const result = body.resumeSessionId && issues.length === 1
          ? launchFixResume({ appName, workDir, resumeSessionId: body.resumeSessionId, issue: issues[0], dashboardPort })
          : launchFix({ appName, workDir, issues, dashboardPort });

        // Mark issues as in_progress (fire-and-forget)
        for (const issue of issues) {
          daemonExec([
            'send', 'updateIssue', '--app', appName,
            '--issueNumber', String(issue.number),
            '--status', 'in_progress',
            '--claudeSessionId', result.claudeSessionId,
            '--claudeLaunchDir', workDir,
          ]).catch(err => console.error(`${appName} mark in_progress #${issue.number}:`, err.message));
        }

        return NextResponse.json({ ok: true, claudeSessionId: result.claudeSessionId, tmuxSession: result.tmuxSession });
      }

      // --- Run maintenance prompt ---
      if (action === 'maintenance') {
        if (!workDir) {
          return NextResponse.json({ error: 'Maintenance not configured — workDir not set' }, { status: 400 });
        }
        const { prompt } = body;
        if (!prompt || typeof prompt !== 'string') {
          return NextResponse.json({ error: 'prompt string required' }, { status: 400 });
        }
        const result = launchMaintenance({ appName, workDir, prompt, dashboardPort });
        return NextResponse.json({ ok: true, claudeSessionId: result.claudeSessionId, tmuxSession: result.tmuxSession });
      }

      // --- Mark as Reviewed (close + optional conclude) ---
      if (action === 'reviewed') {
        const issueNumbers: number[] = body.issueNumbers;
        if (!Array.isArray(issueNumbers) || issueNumbers.length === 0) {
          return NextResponse.json({ error: 'issueNumbers array required' }, { status: 400 });
        }

        // Launch conclude if requested (fire-and-forget)
        if (body.conclude && body.claudeSessionId) {
          const concludeDir = body.claudeLaunchDir || workDir;
          if (concludeDir) {
            const concluded = launchConclude({
              appName,
              workDir: concludeDir,
              claudeSessionId: body.claudeSessionId,
              dashboardPort,
            });
            if (!concluded) {
              console.log(`[feedback-lib] conclude: session file not found for ${body.claudeSessionId}, closing without conclude`);
            }
          }
        }

        // Close all specified issues
        const results = await Promise.all(
          issueNumbers.map(async (num) => {
            try {
              await daemonExec(['send', 'closeIssue', '--app', appName, '--issueNumber', String(num)]);
              return { issueNumber: num, ok: true };
            } catch (err) {
              return { issueNumber: num, ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
            }
          }),
        );

        return NextResponse.json({ ok: true, results });
      }

      // --- Standard actions: close, reopen, update, delete ---
      const { issueNumber } = body;

      if (action === 'delete') {
        if (!issueNumber) {
          return NextResponse.json({ error: 'issueNumber required for delete' }, { status: 400 });
        }
        const output = await daemonExec(['send', 'deleteIssue', '--app', appName, '--issueNumber', String(issueNumber)]);
        return NextResponse.json({ ok: true, output });
      }

      if (!issueNumber || !['close', 'reopen', 'update'].includes(action)) {
        return NextResponse.json({ error: 'action (close|reopen|update|create|fix|reviewed|maintenance|delete) and issueNumber required' }, { status: 400 });
      }

      let args: string[];
      if (action === 'update') {
        args = ['send', 'updateIssue', '--app', appName, '--issueNumber', String(issueNumber)];
        if (body.title) args.push('--title', body.title);
        if (body.description !== undefined) args.push('--description', body.description);
        if (body.status) args.push('--status', body.status);
        if (body.insights !== undefined) args.push('--insights', body.insights);
        if (body.labels !== undefined) args.push('--labels', JSON.stringify(body.labels));
      } else {
        const command = action === 'close' ? 'closeIssue' : 'reopenIssue';
        args = ['send', command, '--app', appName, '--issueNumber', String(issueNumber)];
      }

      const output = await daemonExec(args);
      return NextResponse.json({ ok: true, output });
    } catch (err) {
      console.error(`${appName} issue action error:`, err);
      return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
    }
  }

  return { GET, POST };
}

/**
 * Returns a GET handler for /api/feedback/session-history
 * Reads a Claude session JSONL file and extracts user/assistant messages for UI display.
 */
export function handleFeedbackSessionHistory(_appName: string, workDir: string) {
  return async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId || !/^[a-f0-9-]+$/i.test(sessionId)) {
      return NextResponse.json({ error: 'Valid sessionId required' }, { status: 400 });
    }

    const home = process.env.HOME || '/root';
    const projectKey = workDir.replace(/\//g, '-');
    const sessionFile = `${home}/.claude/projects/${projectKey}/${sessionId}.jsonl`;

    if (!existsSync(sessionFile)) {
      return NextResponse.json({ messages: [], found: false });
    }

    try {
      const raw = readFileSync(sessionFile, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      const messages: { role: string; text: string }[] = [];

      for (const line of lines) {
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(line); } catch { continue; }
        const type = obj.type as string;

        if (type === 'user') {
          const msg = obj.message as { content: unknown } | undefined;
          if (!msg) continue;
          // Only include text messages, not tool results (which are arrays)
          if (typeof msg.content === 'string' && msg.content.trim()) {
            messages.push({ role: 'user', text: msg.content });
          }
        } else if (type === 'assistant') {
          const msg = obj.message as { content: unknown } | undefined;
          if (!msg || !Array.isArray(msg.content)) continue;
          const texts = (msg.content as Array<{ type?: string; text?: string }>)
            .filter(b => b.type === 'text' && b.text)
            .map(b => b.text!);
          const combined = texts.join('\n').trim();
          if (combined) {
            messages.push({ role: 'assistant', text: combined });
          }
        }
      }

      // Return last 50 message turns
      const trimmed = messages.slice(-50);
      return NextResponse.json({ messages: trimmed, found: true });
    } catch (err) {
      console.error('session-history read error:', err);
      return NextResponse.json({ messages: [], found: false });
    }
  };
}
