package com.automatelinux.feedbacklib.ui.chat

import com.automatelinux.feedbacklib.data.model.FeedbackIssue
import com.automatelinux.feedbacklib.data.model.FeedbackSubmitResult

data class ChatMessage(
    val role: String, // "user" | "assistant" | "system"
    val text: String,
)

data class FeedbackChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val inputText: String = "",
    val isSending: Boolean = false,
    val isSubmitting: Boolean = false,
    val sessionId: String? = null,
    val tmuxSession: String? = null,
    val resumeSessionId: String? = null,
    val proposedIssues: List<FeedbackIssue>? = null,
    val checkedIssues: List<Boolean> = emptyList(),
    val submitResults: List<FeedbackSubmitResult>? = null,
    val error: String? = null,
    val serverFound: Boolean = false,
    val hookWarning: String? = null,
    val directMode: Boolean = false,
    val directTitle: String = "",
    val directDescription: String = "",
    val directLoading: Boolean = false,
    val showPostSubmitPrompt: Boolean = false,
    val restoringSession: Boolean = false,
)
