import { MAINTENANCE_PROMPTS } from '@automate/feedback-lib/launcher';
import FeedbackIssuesClient from './feedback-issues-client';

export { generateFeedbackIssuesMetadata as generateMetadata } from '@automate/feedback-lib/core';

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  return (
    <FeedbackIssuesClient
      initialAppName={app ?? null}
      maintenancePrompts={MAINTENANCE_PROMPTS}
    />
  );
}
