import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAppStatus } from '@/lib/tenant-provisioner';
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

  const daemonStatus = await getAppStatus(slug);

  return NextResponse.json({
    ...app,
    daemonStatus,
  });
}
