import type { Metadata } from 'next';

// Route-level metadata consumer apps re-export from their /issues/page.tsx so
// the initial <title> is "Issues" rather than the host app's root-layout title
// (e.g. cad's "CAD Shed Generator"). The client-side useEffect in
// FeedbackIssuesPage later refines document.title to "{appName} — Issues"
// once the viewed app is known.
//
// Kept in its own server-safe module (no "use client") so Next.js treats it
// as route metadata — metadata exported from a client module is ignored.
export const feedbackIssuesMetadata: Metadata = { title: 'Issues' };
