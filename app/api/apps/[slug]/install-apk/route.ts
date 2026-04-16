import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildApk, installApk } from '@/lib/tenant-provisioner';
import { NextResponse } from 'next/server';

export async function POST(
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

  try {
    await buildApk(slug);
    const result = await installApk(slug);
    return NextResponse.json({ message: 'APK installed successfully', result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Install failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
