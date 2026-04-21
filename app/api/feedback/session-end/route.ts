import { handleFeedbackSessionEnd, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName } = getAppConfig();
export const POST = handleFeedbackSessionEnd(appName);
