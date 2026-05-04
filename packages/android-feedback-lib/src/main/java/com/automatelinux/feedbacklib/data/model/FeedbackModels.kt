package com.automatelinux.feedbacklib.data.model

import com.google.gson.annotations.SerializedName

// ── Shared ───────────────────────────────────────────────────────────────

data class FeedbackIssue(
    val title: String,
    val description: String,
)

data class Issue(
    @SerializedName("issueNumber") val issueNumber: Int,
    val title: String,
    val description: String,
    val status: String, // open | in_progress | review | closed | regression
    val labels: List<String>,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
    val insights: String?,
    @SerializedName("claudeSessionId") val claudeSessionId: String? = null,
    @SerializedName("claudeSessionIds") val claudeSessionIds: List<String>? = null,
    @SerializedName("claudeLaunchDir") val claudeLaunchDir: String? = null,
)

// ── Requests ─────────────────────────────────────────────────────────────

data class FeedbackMessageRequest(
    val message: String,
    @SerializedName("sessionId") val sessionId: String? = null,
    @SerializedName("tmuxSession") val tmuxSession: String? = null,
    @SerializedName("resumeSessionId") val resumeSessionId: String? = null,
    val app: String,
    val pagePath: String? = null,
    val pageContext: String? = null,
)

data class FeedbackSubmitRequest(
    val issues: List<FeedbackIssue>,
    @SerializedName("sessionId") val sessionId: String? = null,
    val app: String,
    val pagePath: String? = null,
    val pageContext: String? = null,
    val labels: List<String> = listOf("android"),
)

data class FeedbackCloseRequest(
    @SerializedName("tmuxSession") val tmuxSession: String,
)

data class IssueActionRequest(
    val action: String, // "close" | "reopen" | "delete"
    @SerializedName("issueNumber") val issueNumber: Int,
    val app: String,
)

data class CreateIssueRequest(
    val action: String = "create",
    val title: String,
    val description: String? = null,
    val pagePath: String? = null,
    val pageContext: String? = null,
    val app: String,
    val labels: List<String> = listOf("android"),
)

data class FixIssueItem(
    val number: Int,
    val title: String,
    val status: String? = null,
    val insights: String? = null,
    @SerializedName("claudeSessionIds") val claudeSessionIds: List<String>? = null,
    @SerializedName("claudeLaunchDir") val claudeLaunchDir: String? = null,
)

data class FixIssuesRequest(
    val action: String = "fix",
    val app: String,
    val issues: List<FixIssueItem>,
    @SerializedName("resumeSessionId") val resumeSessionId: String? = null,
)

data class InstallAppRequest(
    val action: String = "install",
    val app: String,
)

data class FixIssuesResponse(
    val ok: Boolean? = null,
    @SerializedName("claudeSessionId") val claudeSessionId: String? = null,
    @SerializedName("tmuxSession") val tmuxSession: String? = null,
    val error: String? = null,
)

// ── Responses ────────────────────────────────────────────────────────────

data class FeedbackMessageResponse(
    val response: String,
    @SerializedName("sessionId") val sessionId: String,
    @SerializedName("tmuxSession") val tmuxSession: String,
    val issues: List<FeedbackIssue>? = null,
    val hookWarning: String? = null,
)

data class FeedbackSubmitResponse(
    val results: List<FeedbackSubmitResult>,
)

data class FeedbackSubmitResult(
    val title: String,
    @SerializedName("issueNumber") val issueNumber: Int? = null,
    val success: Boolean,
    val error: String? = null,
)

data class FeedbackStatusResponse(
    val alive: Boolean,
)

data class IssuesListResponse(
    val issues: List<Issue>,
)

data class OkResponse(
    val ok: Boolean? = null,
)

data class CreateIssueResponse(
    val ok: Boolean? = null,
    @SerializedName("issueNumber") val issueNumber: Int? = null,
    val effectiveApp: String? = null,
)
