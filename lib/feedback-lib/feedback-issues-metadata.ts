import type { Metadata } from 'next';

// Static fallback kept for backwards-compat re-exports. New consumers should
// re-export `generateFeedbackIssuesMetadata` so the initial <title> reflects
// ?app=... from the URL (e.g. "addnewfeature — Issues") instead of the
// generic "Issues", avoiding a tab-title flicker before the client-side
// useEffect in FeedbackIssuesPage takes over.
export const feedbackIssuesMetadata: Metadata = { title: 'Issues' };

export async function generateFeedbackIssuesMetadata({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}): Promise<Metadata> {
  const { app } = await searchParams;
  return { title: app ? `${app} — Issues` : 'Issues' };
}
