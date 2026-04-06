import crypto from 'crypto';
import { execFile, execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { getSessionEnv } from './session-env';

export interface LaunchConfig {
  appName: string;
  workDir: string;
  firstMessage: string;
  /** User to run Claude as (default: 'root') */
  user?: string;
  /** Dashboard dev port for session registration (default: 3007) */
  dashboardPort?: number;
  /** Port the app's Next.js server is running on (for global Stop hook routing) */
  appPort?: number;
}

export interface LaunchResult {
  claudeSessionId: string;
  tmuxSession: string;
  scriptLogFile: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Check if Claude Code auth is valid. Returns null if OK, error string if not. */
export function checkClaudeAuth(): string | null {
  try {
    const home = process.env.HOME || '/root';
    const creds = JSON.parse(readFileSync(`${home}/.claude/.credentials.json`, 'utf-8'));
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken || !oauth?.expiresAt || oauth.expiresAt < Date.now()) return 'auth_expired';
    return null;
  } catch {
    return 'auth_expired';
  }
}

/** Escape a prompt string for bash $'...' syntax. */
function escapeBashPrompt(prompt: string): string {
  return prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

interface TmuxLaunchConfig {
  appName: string;
  workDir: string;
  /** Prefix for the tmux session name (e.g. "feedback", "fix", "maint", "conclude") */
  tmuxPrefix: string;
  claudeSessionId: string;
  /** Full bash command to execute inside the tmux session */
  bashCmd: string;
  user?: string;
  appPort?: number;
  dashboardPort?: number;
  /** Extra fields merged into the dashboard registration body */
  dashboardExtra?: Record<string, unknown>;
}

/**
 * Shared tmux launch logic used by all launch* functions.
 * Handles: env setup, script file creation, tmux session creation via systemd-run,
 * and dashboard registration.
 */
function launchInTmux(config: TmuxLaunchConfig): LaunchResult {
  const authErr = checkClaudeAuth();
  if (authErr) throw new Error(authErr);

  const { appName, workDir, tmuxPrefix, claudeSessionId, bashCmd, user = 'root', appPort, dashboardPort = 3007, dashboardExtra } = config;

  const tmuxSession = `${appName}-${tmuxPrefix}-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${claudeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);
  if (appPort) envArgs.push(`FEEDBACK_APP_PORT=${appPort}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  // Kill existing tmux session if any
  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  // Launch in tmux — use -e flags so env vars reach the session.
  // systemd-run --scope escapes the calling service's cgroup so the tmux
  // server survives service restarts.
  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} ${tmuxPrefix} launch failed:`, err.message);
  });

  // Register with dashboard (fire-and-forget)
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-${tmuxPrefix}-${claudeSessionId.slice(0, 8)}`,
      claudeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
      ...dashboardExtra,
    }),
  }).catch(() => {});

  return { claudeSessionId, tmuxSession, scriptLogFile };
}

// ---------------------------------------------------------------------------
// Public launch functions
// ---------------------------------------------------------------------------

export function launchFeedback(config: LaunchConfig): LaunchResult {
  const { appName, workDir, firstMessage, user, dashboardPort, appPort } = config;

  const claudeSessionId = crypto.randomUUID();
  const claudeCmd = `claude --session-id ${claudeSessionId} --agent issue-clarifier-agent --dangerously-skip-permissions --tools=Read,Grep,Glob`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${escapeBashPrompt(firstMessage)}'; exec bash`;

  return launchInTmux({ appName, workDir, tmuxPrefix: 'feedback', claudeSessionId, bashCmd, user, appPort, dashboardPort });
}

export interface ResumeConfig {
  appName: string;
  workDir: string;
  resumeSessionId: string;
  firstMessage: string;
  user?: string;
  dashboardPort?: number;
  appPort?: number;
}

/**
 * Resume a previous feedback Claude session in a new tmux.
 * Throws if the session file no longer exists on disk.
 */
export function resumeFeedback(config: ResumeConfig): LaunchResult {
  const { appName, workDir, resumeSessionId, firstMessage, user, dashboardPort, appPort } = config;

  const home = process.env.HOME || '/root';
  const projectKey = workDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${resumeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) {
    throw new Error('session_expired');
  }

  const claudeCmd = `claude -r ${resumeSessionId} --dangerously-skip-permissions --tools=Read,Grep,Glob`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${escapeBashPrompt(firstMessage)}'; exec bash`;

  return launchInTmux({ appName, workDir, tmuxPrefix: 'feedback', claudeSessionId: resumeSessionId, bashCmd, user, appPort, dashboardPort });
}

export function sendMessage(tmuxSession: string, message: string, user = 'root'): void {
  // Send text literally (no special key parsing)
  execFileSync('tmux', [
    'send-keys', '-t', tmuxSession, '-l', message,
  ], { timeout: 5000 });

  // Send Enter to submit
  execFileSync('tmux', [
    'send-keys', '-t', tmuxSession, 'Enter',
  ], { timeout: 5000 });
}

export function killFeedback(tmuxSession: string, appName?: string, user = 'root'): boolean {
  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch {
    // Session may already be dead — still clean up tmp files
  }

  // Clean up tmp files
  if (appName) {
    for (const prefix of ['launch', 'claude']) {
      try { unlinkSync(`/tmp/${appName}-${prefix}-${tmuxSession}.sh`); } catch {}
      try { unlinkSync(`/tmp/${appName}-${prefix}-${tmuxSession}.log`); } catch {}
    }
  }

  return true;
}

/**
 * Check if a tmux session is still alive.
 */
export function isTmuxAlive(tmuxSession: string, user = 'root'): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', tmuxSession], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export interface FixIssue {
  number: number;
  title: string;
  status?: string;
  insights?: string;
  claudeSessionIds?: string[];
  claudeLaunchDir?: string;
}

export interface FixConfig {
  appName: string;
  workDir: string;
  issues: FixIssue[];
  user?: string;
  dashboardPort?: number;
}

/**
 * Launch a Claude session to fix issues using /fix-issues-skill.
 */
export function launchFix(config: FixConfig): LaunchResult {
  const { appName, workDir, issues, user, dashboardPort } = config;

  const claudeSessionId = crypto.randomUUID();
  const issueLines = issues.map(i => {
    let line = `- #${i.number}: ${i.title} (repo:${appName})`;
    if (i.status === 'regression') {
      line += `\n  REGRESSION — this issue was previously fixed but broke again.`;
      if (i.insights) line += `\n  User reported: ${i.insights}`;
      if (i.claudeSessionIds?.length) {
        line += `\n  Previous fix sessions: ${i.claudeSessionIds.join(', ')}`;
        line += `\n  Check ~/.claude/projects/ for these session files to understand what was tried before.`;
      }
    }
    return line;
  });
  const prompt = `/fix-issues-skill ${appName}\n\nIssues to fix:\n${issueLines.join('\n')}`;

  const claudeCmd = `claude --session-id ${claudeSessionId} --dangerously-skip-permissions`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${escapeBashPrompt(prompt)}'; exec bash`;

  const issueKeys = issues.map(i => `${appName}#${i.number}`);
  return launchInTmux({
    appName, workDir, tmuxPrefix: 'fix', claudeSessionId, bashCmd, user, dashboardPort,
    dashboardExtra: {
      issueKeys,
      issues: issues.map(i => ({ key: `${appName}#${i.number}`, number: i.number, title: i.title })),
    },
  });
}

export interface MaintenanceConfig {
  appName: string;
  workDir: string;
  prompt: string;
  issueNumber?: number;
  title?: string;
  user?: string;
  dashboardPort?: number;
}

/**
 * Launch a Claude session to run a maintenance prompt against the app.
 */
export function launchMaintenance(config: MaintenanceConfig): LaunchResult {
  const { appName, workDir, prompt, issueNumber, title, user, dashboardPort } = config;

  const claudeSessionId = crypto.randomUUID();

  // Append issue review instructions if tracking an issue
  let fullPrompt = prompt;
  if (issueNumber) {
    fullPrompt += `\n\nAfter completing the work and pushing, mark the maintenance issue as reviewed:\nd updateIssue --app ${appName} --issueNumber ${issueNumber} --status review --insights "describe what was done" --claudeSessionId "$CLAUDE_SESSION_ID" --claudeLaunchDir "$CLAUDE_LAUNCH_DIR"`;
  }

  const claudeCmd = `claude --session-id ${claudeSessionId} --dangerously-skip-permissions`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${escapeBashPrompt(fullPrompt)}'; exec bash`;

  const issueKeys = issueNumber ? [`${appName}#${issueNumber}`] : undefined;
  const issues = issueNumber && title ? [{ key: `${appName}#${issueNumber}`, number: issueNumber, title }] : undefined;
  return launchInTmux({
    appName, workDir, tmuxPrefix: 'maint', claudeSessionId, bashCmd, user, dashboardPort,
    dashboardExtra: {
      ...(issueKeys && { issueKeys }),
      ...(issues && { issues }),
    },
  });
}

export interface FixResumeConfig {
  appName: string;
  workDir: string;
  resumeSessionId: string;
  issue: FixIssue;
  user?: string;
  dashboardPort?: number;
}

/**
 * Resume a previous Claude session and run /fix-issues-skill for a regression issue.
 * Falls back to launchFix (new session) if the session file doesn't exist.
 */
export function launchFixResume(config: FixResumeConfig): LaunchResult {
  const { appName, workDir, resumeSessionId, issue, user, dashboardPort } = config;

  const resumeDir = issue.claudeLaunchDir || workDir;
  const home = process.env.HOME || '/root';
  const projectKey = resumeDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${resumeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) {
    return launchFix({ appName, workDir, issues: [issue], user, dashboardPort });
  }

  let issueDesc = `- #${issue.number}: ${issue.title} (repo:${appName})\n  REGRESSION — this issue was previously fixed but broke again.`;
  if (issue.insights) issueDesc += `\n  User reported: ${issue.insights}`;
  const prompt = `/fix-issues-skill ${appName}\n\nIssues to fix:\n${issueDesc}`;

  const claudeCmd = `claude -r ${resumeSessionId} --dangerously-skip-permissions`;
  const bashCmd = `cd '${resumeDir}' && ${claudeCmd} $'${escapeBashPrompt(prompt)}'; exec bash`;

  const issueKeys = [`${appName}#${issue.number}`];
  return launchInTmux({
    appName, workDir: resumeDir, tmuxPrefix: 'fix', claudeSessionId: resumeSessionId, bashCmd, user, dashboardPort,
    dashboardExtra: {
      issueKeys,
      issues: [{ key: `${appName}#${issue.number}`, number: issue.number, title: issue.title }],
    },
  });
}

// ---------------------------------------------------------------------------
// Conclude helpers
// ---------------------------------------------------------------------------

/**
 * Check if a Claude process with the given session ID is actually running.
 */
function isClaudeProcessAlive(claudeSessionId: string): boolean {
  try {
    execFileSync('pgrep', ['-f', claudeSessionId], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a live tmux session for the given Claude session ID.
 * Checks both the tmux environment variable and the session name pattern.
 */
function findLiveTmuxForSession(claudeSessionId: string): string | null {
  try {
    const sessions = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 3000 })
      .toString().trim().split('\n').filter(Boolean);
    for (const sess of sessions) {
      if (sess.includes(claudeSessionId)) return sess;
      try {
        const env = execFileSync('tmux', ['show-environment', '-t', sess, 'CLAUDE_SESSION_ID'], { timeout: 3000 })
          .toString().trim();
        if (env === `CLAUDE_SESSION_ID=${claudeSessionId}`) return sess;
      } catch { /* env var not set in this session */ }
    }
  } catch { /* no tmux server or no sessions */ }
  return null;
}

export interface ConcludeConfig {
  appName: string;
  workDir: string;
  claudeSessionId: string;
  user?: string;
  dashboardPort?: number;
}

/**
 * Resume a Claude session and run /conclude-issues-and-close-session-skill.
 * If the session already has a live tmux, sends the conclude prompt there.
 * Returns null if the session file doesn't exist (cleaned up).
 */
export function launchConclude(config: ConcludeConfig): { tmuxSession: string } | null {
  const { appName, workDir, claudeSessionId, user, dashboardPort } = config;

  const home = process.env.HOME || '/root';
  const projectKey = workDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${claudeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) return null;

  // Skip if the session's last user prompt was already /conclude-issues-and-close-session-skill.
  try {
    const lines = readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const obj = JSON.parse(lines[i]);
      if (obj.type === 'user' && typeof obj.message?.content === 'string') {
        const text = obj.message.content.trim();
        if (text === '/conclude-issues-and-close-session-skill' || text.includes('conclude-issues-and-close-session-skill</command-name>')) return null;
        break;
      }
    }
  } catch { /* parse error — proceed with launch */ }

  // If there's already a live tmux with Claude running, send the prompt directly.
  // If tmux is alive but Claude has exited, kill the stale tmux and launch fresh.
  const existingTmux = findLiveTmuxForSession(claudeSessionId);
  if (existingTmux) {
    if (isClaudeProcessAlive(claudeSessionId)) {
      sendMessage(existingTmux, '/conclude-issues-and-close-session-skill');
      return { tmuxSession: existingTmux };
    }
    try { execFileSync('tmux', ['kill-session', '-t', existingTmux], { timeout: 3000 }); } catch { /* already dead */ }
  } else if (isClaudeProcessAlive(claudeSessionId)) {
    // Claude is running outside tmux — don't launch a competing resume session.
    return null;
  }

  const claudeCmd = `claude -r ${claudeSessionId} --dangerously-skip-permissions`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'/conclude-issues-and-close-session-skill'; exec bash`;

  const result = launchInTmux({ appName, workDir, tmuxPrefix: 'conclude', claudeSessionId, bashCmd, user, dashboardPort });
  return { tmuxSession: result.tmuxSession };
}
