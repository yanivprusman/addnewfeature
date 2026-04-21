"use client";

import { FeedbackIssuesPage } from '@automate/feedback-lib/core';
import type { MaintenancePrompt } from '@automate/feedback-lib/core';
import { feedbackBackend } from '@/lib/feedback-backend';

export default function FeedbackIssuesClient({
  initialAppName,
  maintenancePrompts,
}: {
  initialAppName: string | null;
  maintenancePrompts: MaintenancePrompt[];
}) {
  return (
    <FeedbackIssuesPage
      backend={feedbackBackend}
      maintenancePrompts={maintenancePrompts}
      initialAppName={initialAppName}
    />
  );
}
