import { handleFeedbackSubmit, getAppConfig } from '@automate/feedback-lib';
const { appName, workDir } = getAppConfig();
export const POST = handleFeedbackSubmit(appName, workDir);
