import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getApkPath } from '@/lib/tenant-provisioner';
import { existsSync, statSync, createReadStream } from 'fs';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  const app = await prisma.tenantApp.findUnique({
    where: { appSlug: slug },
  });

  if (!app || app.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (app.appType !== 'android') {
    return NextResponse.json({ error: 'Not an Android app' }, { status: 400 });
  }

  const apkPath = getApkPath(slug);

  if (!existsSync(apkPath)) {
    return NextResponse.json({ error: 'APK not built yet. Build the APK first.' }, { status: 404 });
  }

  const stat = statSync(apkPath);
  const stream = createReadStream(apkPath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${slug}.apk"`,
      'Content-Length': String(stat.size),
    },
  });
}
