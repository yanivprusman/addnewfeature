import { handleFeedbackClose, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName } = getAppConfig();
export const POST = handleFeedbackClose(appName);
