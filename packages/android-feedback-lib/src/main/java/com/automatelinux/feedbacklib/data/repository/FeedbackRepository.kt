package com.automatelinux.feedbacklib.data.repository

import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.api.FeedbackApi
import com.automatelinux.feedbacklib.data.model.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FeedbackRepository @Inject constructor(
    private val api: FeedbackApi,
    private val config: FeedbackConfig,
) {
    fun getScreenContext(): String? = config.currentScreenProvider?.invoke()
    fun getPlatformContext(): String? = config.platformContextProvider?.invoke()

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

    suspend fun installApp(): Result<OkResponse> = apiCall {
        api.installApp(InstallAppRequest(app = config.appName))
    }
}
