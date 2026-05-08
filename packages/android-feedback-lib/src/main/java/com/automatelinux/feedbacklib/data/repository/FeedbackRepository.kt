package com.automatelinux.feedbacklib.data.repository

import android.content.Context
import android.os.Build
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
            )
        )
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

    suspend fun installApp(force: Boolean = false): Result<InstallAppResponse> = apiCall {
        api.installApp(InstallAppRequest(
            app = config.appName,
            currentVersion = versionName,
            force = if (force) true else null,
        ))
    }
}
