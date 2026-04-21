import { handleFeedbackIssues, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName, workDir } = getAppConfig();
const { GET, POST } = handleFeedbackIssues(appName, { workDir });
export { GET, POST };
