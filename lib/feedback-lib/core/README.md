# @claudecontrol/feedback-lib

Generic React UI for an in-app feedback / issue-clarifier experience. Ships two
top-level components — a chat widget and an issues page — plus a small set of
helpers. The package is backend-agnostic: it describes what it needs via the
`FeedbackBackend` interface and leaves the implementation to the host app.

## Install

```bash
npm install @claudecontrol/feedback-lib
```

Peer-depends on `react@>=18 <20` and `next@>=14`.

## Quick start

```tsx
// 1. Implement FeedbackBackend once for your app
import type { FeedbackBackend } from '@claudecontrol/feedback-lib';

export const myBackend: FeedbackBackend = {
  async sendChatMessage(req) {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error('sendChatMessage failed');
    return res.json();
  },
  // ...all methods: submitChatIssues, getSessionStatus, closeSession,
  //                closeSessionOnUnload, listIssues, issueAction,
  //                getSessionHistory
};

// 2. Drop the chat widget into your layout
import { FeedbackChat } from '@claudecontrol/feedback-lib';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackChat backend={myBackend} />
      </body>
    </html>
  );
}

// 3. Add the issues page
import { FeedbackIssuesPage } from '@claudecontrol/feedback-lib';

export default function IssuesPage() {
  return <FeedbackIssuesPage backend={myBackend} />;
}
```

## FeedbackBackend contract

The backend must implement every method on `FeedbackBackend`. There are no
fallbacks — a missing method is a runtime setup error, not a graceful
degradation. Throw `BackendAuthExpiredError` or `BackendSessionExpiredError`
when the corresponding condition is detected so the UI can react correctly.

See `api-contract.ts` for the full type definitions.

## Addnewfeature reference implementation

The companion private package `@addnewfeature/feedback-lib-launcher` ships a
ready-made `createAddNewFeatureBackend()` that wires these UIs to a Claude
Code + tmux + daemon pipeline. It's the reference implementation for this
interface and lives alongside the core package in the addnewfeature repo.

## License

Proprietary-dep-only. See `LICENSE`.
