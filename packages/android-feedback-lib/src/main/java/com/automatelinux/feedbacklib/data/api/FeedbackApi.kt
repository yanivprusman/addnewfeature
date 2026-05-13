package com.automatelinux.feedbacklib.data.api

import com.automatelinux.feedbacklib.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface FeedbackApi {

    // ── Chat ─────────────────────────────────────────────────────────────

    @POST("api/feedback")
    suspend fun sendFeedbackMessage(
        @Body request: FeedbackMessageRequest,
    ): Response<FeedbackMessageResponse>

    @POST("api/feedback/submit")
    suspend fun submitFeedbackIssues(
        @Body request: FeedbackSubmitRequest,
    ): Response<FeedbackSubmitResponse>

    @POST("api/feedback/close")
    suspend fun closeFeedbackSession(
        @Body request: FeedbackCloseRequest,
    ): Response<OkResponse>

    @GET("api/feedback/status")
    suspend fun getFeedbackStatus(
        @Query("tmuxSession") tmuxSession: String,
    ): Response<FeedbackStatusResponse>

    // ── Issues ───────────────────────────────────────────────────────────

    @GET("api/feedback/issues")
    suspend fun listIssues(
        @Query("app") app: String,
    ): Response<IssuesListResponse>

    @POST("api/feedback/issues")
    suspend fun issueAction(
        @Body request: IssueActionRequest,
    ): Response<OkResponse>

    @POST("api/feedback/issues")
    suspend fun createIssue(
        @Body request: CreateIssueRequest,
    ): Response<CreateIssueResponse>

    @POST("api/feedback/issues")
    suspend fun reviewIssue(
        @Body request: ReviewedIssueRequest,
    ): Response<OkResponse>

    @POST("api/feedback/issues")
    suspend fun updateIssue(
        @Body request: UpdateIssueRequest,
    ): Response<OkResponse>

    @POST("api/feedback/issues")
    suspend fun fixIssues(
        @Body request: FixIssuesRequest,
    ): Response<FixIssuesResponse>

    @POST("api/feedback/issues")
    suspend fun buildApp(
        @Body request: BuildAppRequest,
    ): Response<BuildAppResponse>

    @POST("api/feedback/issues")
    suspend fun installApp(
        @Body request: InstallAppRequest,
    ): Response<InstallAppResponse>

    @GET("api/feedback/session-history")
    suspend fun getSessionHistory(
        @Query("sessionId") sessionId: String,
        @Query("app") app: String? = null,
    ): Response<SessionHistoryResponse>

    @GET("api/health")
    suspend fun getHealth(): Response<HealthResponse>

    @GET("api/feedback/version")
    suspend fun getFeedbackLibVersion(): Response<FeedbackLibVersionResponse>
}
