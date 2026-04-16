import type { MaintenancePrompt } from './issues-page-types';

// Each entry points to a Claude Code skill under ~/.claude/skills/<skill>/SKILL.md.
// The launcher invokes it as `/<skill>`, so these prompts are also callable from
// the terminal: `claude /refactor-large-files-skill`.
export const MAINTENANCE_PROMPTS: MaintenancePrompt[] = [
  {
    id: "feedback-context",
    title: "Add feedback context tracking",
    description: "Ensure tab/section navigation sets data-active-tab on the active element so the feedback widget tracks which view the user is on.",
    skill: "add-feedback-context-skill",
  },
  {
    id: "assign-data-ids",
    title: "Assign data-id to all significant UI elements",
    description: "Scan for interactive elements AND significant non-interactive UI sections missing a data-id attribute and add appropriate values.",
    skill: "assign-data-ids-skill",
  },
  {
    id: "refactor-large-files",
    title: "Refactor large files",
    description: "Scan for large code files and refactor them by splitting into smaller files or extracting shared utilities.",
    skill: "refactor-large-files-skill",
  },
];
