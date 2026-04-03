import { handleFeedbackSessionHistory, getAppConfig } from '@automate/feedback-lib';
const { appName, workDir } = getAppConfig();
export const GET = handleFeedbackSessionHistory(appName, workDir);
