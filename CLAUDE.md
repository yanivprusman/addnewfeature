@AGENTS.md

## feedback-lib rules

### Widget "View Issues" navigation

When the user clicks "View Issues" in the FeedbackChat widget on any app's issues page, it should open/focus the addnewfeature issues page in a named tab — never navigate in-place.

### Issues page targets addnewfeature — by design

The issues page is a feedback-lib feature owned by addnewfeature. FeedbackChat detects when it's on the issues page (`isOnIssuesPage`) and automatically targets addnewfeature — no DOM attributes or props needed. On all other pages, the API route's `appName` determines the target app. Do not add an `app` prop to `<FeedbackChat />` in any app's layout.
