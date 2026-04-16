import { execFile } from 'child_process';
import { prisma } from './prisma';

const DAEMON_BIN = '/usr/local/bin/daemon';

function daemonCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(DAEMON_BIN, ['send', ...args], { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function createTenantApp(
  userId: string,
  name: string,
  slug: string,
  description?: string,
): Promise<{ id: string; devPort: number; prodPort: number }> {
  // Create DB record first with "creating" status
  const app = await prisma.tenantApp.create({
    data: {
      userId,
      name,
      appSlug: slug,
      description,
      status: 'creating',
    },
  });

  try {
    // Call daemon to create the app
    const result = await daemonCommand([
      'createApp',
      '--app', slug,
      '--description', description || name,
      '--icon', 'AppWindow',
    ]);

    // Parse the daemon response for ports
    const parsed = JSON.parse(result);
    const devPort = parsed.devPort;
    const prodPort = parsed.prodPort;

    // Update DB with ports and running status
    await prisma.tenantApp.update({
      where: { id: app.id },
      data: { devPort, prodPort, status: 'running' },
    });

    return { id: app.id, devPort, prodPort };
  } catch (error) {
    // Mark as error if creation failed
    await prisma.tenantApp.update({
      where: { id: app.id },
      data: { status: 'error' },
    });
    throw error;
  }
}

export async function createAndroidApp(
  userId: string,
  name: string,
  slug: string,
  description?: string,
): Promise<{ id: string; devPort: number; prodPort: number }> {
  const app = await prisma.tenantApp.create({
    data: {
      userId,
      name,
      appSlug: slug,
      description,
      appType: 'android',
      status: 'creating',
    },
  });

  try {
    const result = await daemonCommand([
      'createAndroidApp',
      '--app', slug,
      '--description', description || name,
      '--icon', 'Smartphone',
    ]);

    const parsed = JSON.parse(result);
    const devPort = parsed.devPort;
    const prodPort = parsed.prodPort;

    await prisma.tenantApp.update({
      where: { id: app.id },
      data: { devPort, prodPort, status: 'running' },
    });

    return { id: app.id, devPort, prodPort };
  } catch (error) {
    await prisma.tenantApp.update({
      where: { id: app.id },
      data: { status: 'error' },
    });
    throw error;
  }
}

export async function getAppStatus(slug: string): Promise<string> {
  try {
    const result = await daemonCommand(['appStatus', '--app', slug]);
    return result;
  } catch {
    return 'unknown';
  }
}

export async function deployApp(slug: string): Promise<string> {
  return daemonCommand(['deployToProd', '--app', slug]);
}

export async function buildApk(slug: string): Promise<void> {
  await daemonCommand(['buildApp', '--app', slug, '--component', 'native-client']);
}

export function getApkPath(slug: string): string {
  return `/opt/dev/${slug}/android/app/build/outputs/apk/debug/app-debug.apk`;
}

export async function installApk(slug: string): Promise<string> {
  const apkPath = getApkPath(slug);
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/adb', ['install', '-r', apkPath], { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function deleteApp(slug: string, appId: string): Promise<void> {
  await daemonCommand(['removeApp', '--app', slug]);
  await prisma.tenantApp.delete({ where: { id: appId } });
}
