import { auth } from '@/lib/auth';
import { createAndroidApp } from '@/lib/tenant-provisioner';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description } = await req.json();
  if (!name) {
    return NextResponse.json({ error: 'App name is required' }, { status: 400 });
  }

  // Generate slug from name: lowercase, alphanumeric, no spaces
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: 'App name must contain at least 2 alphanumeric characters' }, { status: 400 });
  }

  try {
    const result = await createAndroidApp(session.user.id, name, slug, description);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create app';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
