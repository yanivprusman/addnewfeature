import { execFile } from 'child_process';

const DAEMON_BIN = '/usr/local/bin/daemon';

/**
 * Send an email notification via the NUC's msmtp + Brevo relay.
 * Executes on the leader peer where msmtp is installed.
 */
export async function sendNotification(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const message = `Subject: ${subject}\nTo: ${to}\nFrom: noreply@ya-niv.com\nContent-Type: text/plain; charset=utf-8\n\n${body}`;

  return new Promise((resolve, reject) => {
    execFile(
      DAEMON_BIN,
      [
        'send', 'execOnPeer',
        '--peer', 'leader',
        '--directory', '/root',
        '--shellCmd', `printf '${message.replace(/'/g, "'\\''")}' | msmtp ${to}`,
      ],
      { timeout: 30000 },
      (error) => {
        if (error) {
          console.error('Email notification failed:', error.message);
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
}

/** Notify tenant that their app was created successfully */
export async function notifyAppCreated(email: string, appName: string, slug: string): Promise<void> {
  await sendNotification(
    email,
    `Your app "${appName}" is ready — addnewfeature`,
    `Your app "${appName}" has been created and is running.\n\nDev: https://${slug}.dev.ya-niv.com\nProd: https://${slug}.prod.ya-niv.com\nIssues: https://${slug}.dev.ya-niv.com/issues\n\nHappy building!\n— addnewfeature`,
  );
}

/** Notify tenant that deployment completed */
export async function notifyDeployComplete(email: string, appName: string, slug: string): Promise<void> {
  await sendNotification(
    email,
    `Deployed "${appName}" to production — addnewfeature`,
    `Your app "${appName}" has been deployed to production.\n\nProd: https://${slug}.prod.ya-niv.com\n\n— addnewfeature`,
  );
}
