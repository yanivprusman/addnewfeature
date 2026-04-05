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

export function launchFeedback(config: LaunchConfig): LaunchResult {
  const { appName, workDir, firstMessage, user = 'root', dashboardPort = 3007, appPort } = config;

  const claudeSessionId = crypto.randomUUID();
  const tmuxSession = `${appName}-feedback-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  const claudeFlags = [
    `--session-id ${claudeSessionId}`,
    '--agent issue-clarifier-agent',
    '--dangerously-skip-permissions',
    '--tools=Read,Grep,Glob',
  ];
  const claudeCmd = ['claude', ...claudeFlags].join(' ');

  // Escape prompt for bash $'...' syntax
  const bashEscapedPrompt = firstMessage
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${bashEscapedPrompt}'; exec bash`;

  // Get session env vars for runuser
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

  // Launch in tmux — use -e flags so env vars reach the session
  // (env prefix only sets vars on the tmux client, not the session)
  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  // Use systemd-run --scope to escape the calling service's cgroup.
  // Without this, the tmux server inherits the app service's cgroup and gets
  // killed when the service restarts (taking down ALL tmux sessions).
  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} claude launch failed:`, err.message);
  });

  // Register with dashboard (fire-and-forget)
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-feedback-${claudeSessionId.slice(0, 8)}`,
      claudeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
    }),
  }).catch(() => {});

  return { claudeSessionId, tmuxSession, scriptLogFile };
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
  const { appName, workDir, resumeSessionId, firstMessage, user = 'root', dashboardPort = 3007, appPort } = config;

  const home = process.env.HOME || '/root';
  const projectKey = workDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${resumeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) {
    throw new Error('session_expired');
  }

  const tmuxSession = `${appName}-feedback-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  const claudeCmd = `claude -r ${resumeSessionId} --dangerously-skip-permissions --tools=Read,Grep,Glob`;

  const bashEscapedPrompt = firstMessage
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${bashEscapedPrompt}'; exec bash`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${resumeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);
  if (appPort) envArgs.push(`FEEDBACK_APP_PORT=${appPort}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} claude resume failed:`, err.message);
  });

  // Register with dashboard (fire-and-forget)
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-feedback-${resumeSessionId.slice(0, 8)}`,
      claudeSessionId: resumeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
    }),
  }).catch(() => {});

  return { claudeSessionId: resumeSessionId, tmuxSession, scriptLogFile };
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
  const { appName, workDir, issues, user = 'root', dashboardPort = 3007 } = config;

  const claudeSessionId = crypto.randomUUID();
  const tmuxSession = `${appName}-fix-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

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

  const claudeFlags = [
    `--session-id ${claudeSessionId}`,
    '--dangerously-skip-permissions',
  ];
  const claudeCmd = ['claude', ...claudeFlags].join(' ');

  const bashEscapedPrompt = prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${bashEscapedPrompt}'; exec bash`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${claudeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} fix launch failed:`, err.message);
  });

  // Register with dashboard (fire-and-forget)
  const issueKeys = issues.map(i => `${appName}#${i.number}`);
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-fix-${claudeSessionId.slice(0, 8)}`,
      claudeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
      issueKeys,
      issues: issues.map(i => ({ number: i.number, title: i.title })),
    }),
  }).catch(() => {});

  return { claudeSessionId, tmuxSession, scriptLogFile };
}

export interface MaintenanceConfig {
  appName: string;
  workDir: string;
  prompt: string;
  user?: string;
  dashboardPort?: number;
}

/**
 * Launch a Claude session to run a maintenance prompt against the app.
 */
export function launchMaintenance(config: MaintenanceConfig): LaunchResult {
  const { appName, workDir, prompt, user = 'root', dashboardPort = 3007 } = config;

  const claudeSessionId = crypto.randomUUID();
  const tmuxSession = `${appName}-maint-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  const claudeFlags = [
    `--session-id ${claudeSessionId}`,
    '--dangerously-skip-permissions',
  ];
  const claudeCmd = ['claude', ...claudeFlags].join(' ');

  const bashEscapedPrompt = prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${bashEscapedPrompt}'; exec bash`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${claudeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} maintenance launch failed:`, err.message);
  });

  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-maint-${claudeSessionId.slice(0, 8)}`,
      claudeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
    }),
  }).catch(() => {});

  return { claudeSessionId, tmuxSession, scriptLogFile };
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
  const { appName, workDir, resumeSessionId, issue, user = 'root', dashboardPort = 3007 } = config;

  const home = process.env.HOME || '/root';
  const projectKey = workDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${resumeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) {
    return launchFix({ appName, workDir, issues: [issue], user, dashboardPort });
  }

  const tmuxSession = `${appName}-fix-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  let issueDesc = `- #${issue.number}: ${issue.title} (repo:${appName})\n  REGRESSION — this issue was previously fixed but broke again.`;
  if (issue.insights) issueDesc += `\n  User reported: ${issue.insights}`;
  const prompt = `/fix-issues-skill ${appName}\n\nIssues to fix:\n${issueDesc}`;

  const claudeCmd = `claude -r ${resumeSessionId} --dangerously-skip-permissions`;

  const bashEscapedPrompt = prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'${bashEscapedPrompt}'; exec bash`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${resumeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} fix-resume launch failed:`, err.message);
  });

  const issueKeys = [`${appName}#${issue.number}`];
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-fix-${resumeSessionId.slice(0, 8)}`,
      claudeSessionId: resumeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
      issueKeys,
      issues: [{ number: issue.number, title: issue.title }],
    }),
  }).catch(() => {});

  return { claudeSessionId: resumeSessionId, tmuxSession, scriptLogFile };
}

/**
 * Check if a Claude process with the given session ID is actually running.
 * Searches for both --session-id and -r (resume) patterns.
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
 * Find a live tmux session that has CLAUDE_SESSION_ID set to the given value.
 * Returns the tmux session name, or null if none found.
 */
function findLiveTmuxForSession(claudeSessionId: string): string | null {
  try {
    const sessions = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { timeout: 3000 })
      .toString().trim().split('\n').filter(Boolean);
    for (const sess of sessions) {
      try {
        const env = execFileSync('tmux', ['show-environment', '-t', sess, 'CLAUDE_SESSION_ID'], { timeout: 3000 })
          .toString().trim();
        // Format: CLAUDE_SESSION_ID=<value>
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
 * Resume a Claude session and run /conclude-issues-skill-and-close-session.
 * If the session already has a live tmux, sends the conclude prompt there.
 * Returns null if the session file doesn't exist (cleaned up).
 */
export function launchConclude(config: ConcludeConfig): { tmuxSession: string } | null {
  const { appName, workDir, claudeSessionId, user = 'root', dashboardPort = 3007 } = config;

  const home = process.env.HOME || '/root';
  const projectKey = workDir.replace(/\//g, '-');
  const sessionFile = `${home}/.claude/projects/${projectKey}/${claudeSessionId}.jsonl`;
  if (!existsSync(sessionFile)) return null;

  // Skip if the session's last user prompt was already /conclude-issues-skill-and-close-session.
  // The CLI stores skill invocations wrapped in XML tags, so check for both raw and tagged forms.
  try {
    const lines = readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const obj = JSON.parse(lines[i]);
      if (obj.type === 'user' && typeof obj.message?.content === 'string') {
        const text = obj.message.content.trim();
        if (text === '/conclude-issues-skill-and-close-session' || text.includes('conclude-issues-skill-and-close-session</command-name>')) return null;
        break;
      }
    }
  } catch { /* parse error — proceed with launch */ }

  // If there's already a live tmux session for this Claude session AND Claude
  // is still running inside it, send the conclude prompt directly.
  // If the tmux is alive but Claude has exited (replaced by `exec bash`),
  // kill the stale tmux and fall through to launching a fresh resume session.
  const existingTmux = findLiveTmuxForSession(claudeSessionId);
  if (existingTmux) {
    if (isClaudeProcessAlive(claudeSessionId)) {
      sendMessage(existingTmux, '/conclude-issues-skill-and-close-session');
      return { tmuxSession: existingTmux };
    }
    // Claude has exited — kill stale tmux so we can launch a fresh resume
    try { execFileSync('tmux', ['kill-session', '-t', existingTmux], { timeout: 3000 }); } catch { /* already dead */ }
  } else if (isClaudeProcessAlive(claudeSessionId)) {
    // Claude is running outside tmux (e.g., dashboard embedded session).
    // Don't launch a competing resume session — skip conclude.
    return null;
  }

  const tmuxSession = `${appName}-conclude-${Date.now().toString(36)}`;
  const scriptLogFile = `/tmp/${appName}-claude-${tmuxSession}.log`;
  const launchScriptFile = `/tmp/${appName}-launch-${tmuxSession}.sh`;

  const claudeCmd = `claude -r ${claudeSessionId} --dangerously-skip-permissions`;
  const bashCmd = `cd '${workDir}' && ${claudeCmd} $'/conclude-issues-skill-and-close-session'; exec bash`;

  const sessionEnv = getSessionEnv(user);
  const envArgs = Object.entries(sessionEnv).map(([k, v]) => `${k}=${v}`);
  envArgs.push(`CLAUDE_SESSION_ID=${claudeSessionId}`);
  envArgs.push(`CLAUDE_LAUNCH_DIR=${workDir}`);

  writeFileSync(launchScriptFile, bashCmd + '\n', { mode: 0o755 });

  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxSession], { timeout: 3000 });
  } catch { /* no existing session */ }

  const tmuxArgs = ['new-session', '-d', '-s', tmuxSession];
  for (const e of envArgs) tmuxArgs.push('-e', e);
  tmuxArgs.push(`script -qf ${scriptLogFile} -c 'bash -l ${launchScriptFile}'`);

  execFile('systemd-run', ['--scope', '--quiet', '--', 'tmux', ...tmuxArgs], { timeout: 10000 }, (err) => {
    if (err) console.error(`${appName} conclude launch failed:`, err.message);
  });

  // Register with dashboard (fire-and-forget)
  fetch(`http://localhost:${dashboardPort}/api/claude-sessions/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `${appName}-conclude-${claudeSessionId.slice(0, 8)}`,
      claudeSessionId,
      appName,
      workDir,
      scriptFile: scriptLogFile,
      termTitle: tmuxSession,
      launchMethod: 'tmux',
      source: 'terminal',
    }),
  }).catch(() => {});

  return { tmuxSession };
}
