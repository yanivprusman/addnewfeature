import { handleFeedbackSubmit, getAppConfig } from '@automate/feedback-lib/launcher';
const { appName } = getAppConfig();
export const POST = handleFeedbackSubmit(appName);
