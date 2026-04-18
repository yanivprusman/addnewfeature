import { FeedbackIssuesPage } from '@automate/feedback-lib/FeedbackIssuesPage';
export { feedbackIssuesMetadata as metadata } from '@automate/feedback-lib/feedback-issues-metadata';

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  return <FeedbackIssuesPage initialAppName={app ?? null} />;
}
