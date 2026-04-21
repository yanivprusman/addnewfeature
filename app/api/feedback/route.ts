import { handleFeedbackMessage, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName, workDir } = getAppConfig();
export const POST = handleFeedbackMessage(appName, workDir);
