import type { MaintenancePrompt } from './issues-page-types';

export const MAINTENANCE_PROMPTS: MaintenancePrompt[] = [
  {
    id: "feedback-context",
    title: "Add feedback context tracking",
    description: "Ensure tab/section navigation sets data-active-tab on the active element so the feedback widget tracks which view the user is on.",
    prompt: "Scan this app for tab or section navigation (tab bars, sidebars, segmented controls). For each one, ensure the currently active element has a `data-active-tab` attribute set to the visible label text. This attribute must move with the active state — only the active element should have it at any given time. The feedback-lib widget reads this via `document.querySelector('[data-active-tab]')` at issue-report time. Do not remove any existing attributes. Commit and push when done.",
  },
  {
    id: "assign-data-ids",
    title: "Assign data-id to all significant UI elements",
    description: "Scan for interactive elements AND significant non-interactive UI sections missing a data-id attribute and add appropriate values.",
    prompt: "Scan all React components in this app for elements missing a `data-id` attribute. Cover TWO categories:\n\n1. **Interactive elements**: buttons, links, inputs, toggles, checkboxes, selects, textareas, and other clickable/focusable elements.\n2. **Significant non-interactive sections**: page containers, cards, summary boxes, info panels, feature grids, nav bars, headers, footers, form containers, dialog/modal overlays, tab bars, list containers, status indicators, loading/error/empty states, and any visually distinct section a user might reference when reporting an issue.\n\n**IMPORTANT — scan at every nesting level.** Do NOT stop after tagging top-level page containers. After tagging a component's outer wrapper, look INSIDE it for nested subsections that are themselves significant (e.g. a summary box inside a guide page, an info card inside a dashboard panel, a stats grid inside a settings section). Each visually distinct nested section should get its own `data-id`. Work depth-first: open each component file, tag the outermost significant element, then continue scanning its children for further significant elements before moving to the next file.\n\nFor each element found, add a `data-id` with a descriptive kebab-case value (e.g. `data-id=\"save-settings\"`, `data-id=\"billing-summary\"`, `data-id=\"feature-instant-setup\"`). For elements rendered in a loop, include a dynamic identifier (e.g. `data-id={\\`app-card-${slug}\\`}`). Do not modify elements that already have a `data-id`. Commit and push when done.",
  },
  {
    id: "refactor-large-files",
    title: "Refactor large files",
    description: "Scan for large code files and refactor them by splitting into smaller files or extracting shared utilities.",
    prompt: "Scan all source files in this app (TypeScript, TSX, JS, JSX) and identify files that are excessively large (roughly 300+ lines). For each large file, use your judgment to refactor it in one or more of these ways:\n\n1. **Split into smaller files**: If the file contains multiple distinct components, functions, or logical sections, extract them into separate files and update imports.\n2. **Extract shared utilities**: If you find repeated logic across the file (or across multiple files), extract it into a shared utility module.\n3. **Separate types/interfaces**: If the file has large type definitions, move them to a dedicated types file.\n\nPrioritize readability and maintainability. Do not refactor files that are large but cohesive (e.g. a single complex component that would be harder to understand if split). Skip test files, generated files, and config files. Commit and push when done.",
  },
];
