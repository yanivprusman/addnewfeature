package com.automatelinux.feedbacklib.data.repository

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.api.FeedbackApi
import com.automatelinux.feedbacklib.data.model.*
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FeedbackRepository @Inject constructor(
    private val api: FeedbackApi,
    private val config: FeedbackConfig,
    @ApplicationContext private val context: Context,
) {
    fun getScreenContext(): String? = config.currentScreenProvider?.invoke()

    val platformString: String by lazy {
        val versionName = try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
        } catch (_: Exception) { "?" }
        "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), ${Build.MANUFACTURER} ${Build.MODEL}, v$versionName"
    }

    suspend fun sendMessage(
        message: String,
        sessionId: String? = null,
        tmuxSession: String? = null,
        resumeSessionId: String? = null,
        pagePath: String? = null,
        pageContext: String? = null,
        priorIssue: PriorIssueContext? = null,
        requestId: String? = null,
        clarifierSessionId: String? = null,
    ): Result<FeedbackMessageResponse> = apiCall {
        api.sendFeedbackMessage(
            FeedbackMessageRequest(
                message = message,
                sessionId = sessionId,
                tmuxSession = tmuxSession,
                resumeSessionId = resumeSessionId,
                app = config.appName,
                pagePath = pagePath,
                pageContext = pageContext,
                platform = platformString,
                priorIssue = priorIssue,
                requestId = requestId,
                clarifierSessionId = clarifierSessionId,
            )
        )
    }

    suspend fun recoverSessionByRequestId(requestId: String): Result<SessionByRequestResponse> = apiCall {
        api.getSessionByRequestId(requestId)
    }

    suspend fun submitIssues(
        issues: List<FeedbackIssue>,
        sessionId: String? = null,
        pagePath: String? = null,
        pageContext: String? = null,
    ): Result<FeedbackSubmitResponse> = apiCall {
        api.submitFeedbackIssues(
            FeedbackSubmitRequest(
                issues = issues,
                sessionId = sessionId,
                app = config.appName,
                pagePath = pagePath,
                pageContext = pageContext,
                platform = platformString,
            )
        )
    }

    suspend fun createDirectIssue(
        title: String,
        description: String? = null,
        pagePath: String? = null,
        pageContext: String? = null,
    ): Result<CreateIssueResponse> = apiCall {
        api.createIssue(
            CreateIssueRequest(
                title = title,
                description = description,
                pagePath = pagePath,
                pageContext = pageContext,
                platform = platformString,
                app = config.appName,
            )
        )
    }

    suspend fun closeSession(tmuxSession: String): Result<OkResponse> = apiCall {
        api.closeFeedbackSession(FeedbackCloseRequest(tmuxSession))
    }

    suspend fun checkSessionAlive(tmuxSession: String): Boolean {
        return apiCall { api.getFeedbackStatus(tmuxSession) }
            .getOrNull()?.alive ?: false
    }

    suspend fun listIssues(): Result<List<Issue>> {
        return apiCall { api.listIssues(config.appName) }
            .map { it.issues }
    }

    suspend fun closeIssue(issueNumber: Int): Result<OkResponse> = apiCall {
        api.issueAction(IssueActionRequest("close", issueNumber, config.appName))
    }

    suspend fun reopenIssue(issueNumber: Int): Result<OkResponse> = apiCall {
        api.issueAction(IssueActionRequest("reopen", issueNumber, config.appName))
    }

    suspend fun deleteIssue(issueNumber: Int): Result<OkResponse> = apiCall {
        api.issueAction(IssueActionRequest("delete", issueNumber, config.appName))
    }

    suspend fun reviewIssue(
        issueNumbers: List<Int>,
        conclude: Boolean,
        claudeSessionId: String? = null,
        claudeLaunchDir: String? = null,
    ): Result<OkResponse> = apiCall {
        api.reviewIssue(ReviewedIssueRequest(
            app = config.appName,
            issueNumbers = issueNumbers,
            conclude = conclude,
            claudeSessionId = claudeSessionId,
            claudeLaunchDir = claudeLaunchDir,
        ))
    }

    suspend fun updateIssueStatus(issueNumber: Int, status: String): Result<OkResponse> = apiCall {
        api.updateIssue(UpdateIssueRequest(
            app = config.appName,
            issueNumber = issueNumber,
            status = status,
        ))
    }

    suspend fun fixIssues(
        issues: List<FixIssueItem>,
        resumeSessionId: String? = null,
    ): Result<FixIssuesResponse> = apiCall {
        api.fixIssues(
            FixIssuesRequest(
                app = config.appName,
                issues = issues,
                resumeSessionId = resumeSessionId,
            )
        )
    }

    val versionName: String by lazy {
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
        } catch (_: Exception) { "?" }
    }

    /**
     * Stable per-device identity sent with install requests so the server can
     * route the new APK back to THIS physical phone — not whichever device
     * happens to be first on USB.
     *
     * The id is persisted once and mirrored into the app sandbox at
     * `filesDir/feedback_device_id`. The launcher reads it back per-device with
     * `adb -s <serial> shell run-as <pkg> cat files/feedback_device_id` (the dev
     * build is debuggable) and matches it against this value — so both sides
     * compare the exact same string. We deliberately do NOT rely on the server
     * reading `adb shell settings get secure android_id`: on Android 8+ the app's
     * `Settings.Secure.ANDROID_ID` is a per-signing-key SSAID that does not equal
     * the value adb returns, which made the old android_id match silently fail.
     */
    @Suppress("HardwareIds")
    val deviceId: String? by lazy {
        try {
            val prefs = context.getSharedPreferences("feedbacklib_device", Context.MODE_PRIVATE)
            val existing = prefs.getString("id", null)
            val id = if (!existing.isNullOrBlank()) existing else {
                val androidId = try {
                    Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                } catch (_: Exception) { null }
                // ANDROID_ID makes the id human-recognizable; reject only the known
                // buggy emulator constant. Otherwise generate a random stable id.
                val generated = if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") androidId
                                else java.util.UUID.randomUUID().toString().replace("-", "")
                prefs.edit().putString("id", generated).apply()
                generated
            }
            try { java.io.File(context.filesDir, "feedback_device_id").writeText(id) } catch (_: Exception) {}
            id
        } catch (_: Exception) { null }
    }

    suspend fun buildApp(): Result<BuildAppResponse> = apiCall {
        api.buildApp(BuildAppRequest(app = config.appName))
    }

    suspend fun cleanBuildApp(): Result<BuildAppResponse> = apiCall {
        api.buildApp(BuildAppRequest(action = "cleanBuild", app = config.appName))
    }

    suspend fun installApp(force: Boolean = false): Result<InstallAppResponse> = apiCall {
        api.installApp(InstallAppRequest(
            app = config.appName,
            currentVersion = versionName,
            force = if (force) true else null,
            deviceId = deviceId,
        ))
    }

    suspend fun getInstallProgress(): Result<InstallProgressResponse> = apiCall {
        api.installProgress(InstallProgressRequest())
    }

    suspend fun cancelInstall(): Result<CancelInstallResponse> = apiCall {
        api.cancelInstall(CancelInstallRequest())
    }

    suspend fun pauseInstall(): Result<PauseResumeInstallResponse> = apiCall {
        api.pauseInstall(PauseInstallRequest())
    }

    suspend fun resumeInstall(): Result<PauseResumeInstallResponse> = apiCall {
        api.resumeInstall(ResumeInstallRequest())
    }

    suspend fun getSessionHistory(sessionId: String): Result<SessionHistoryResponse> = apiCall {
        api.getSessionHistory(sessionId)
    }

    suspend fun checkHealth(): Result<HealthResponse> = apiCall { api.getHealth(app = config.appName) }

    suspend fun checkFeedbackLibVersion(): Result<FeedbackLibVersionResponse> = apiCall { api.getFeedbackLibVersion() }

    suspend fun getCommitLog(from: String): Result<FeedbackLibVersionResponse> = apiCall { api.getFeedbackLibVersion(from = from) }
}
