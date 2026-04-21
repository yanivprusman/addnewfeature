import { handleFeedbackSessionHistory, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName, workDir } = getAppConfig();
export const GET = handleFeedbackSessionHistory(appName, workDir);
