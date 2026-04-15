package com.automatelinux.feedbacklib.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.automatelinux.feedbacklib.data.repository.FeedbackRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class FeedbackChatViewModel @Inject constructor(
    private val feedbackRepository: FeedbackRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackChatUiState())
    val uiState: StateFlow<FeedbackChatUiState> = _uiState.asStateFlow()

    private var healthCheckJob: Job? = null

    fun setServerFound(found: Boolean) {
        _uiState.update { it.copy(serverFound = found) }
    }

    fun updateInput(text: String) {
        _uiState.update { it.copy(inputText = text) }
    }

    fun sendMessage() {
        val state = _uiState.value
        val text = state.inputText.trim()
        if (text.isBlank() || state.isSending) return

        _uiState.update {
            it.copy(
                messages = it.messages + ChatMessage("user", text),
                inputText = "",
                isSending = true,
                error = null,
                proposedIssues = null,
                checkedIssues = emptyList(),
                submitResults = null,
            )
        }

        viewModelScope.launch {
            val current = _uiState.value
            feedbackRepository.sendMessage(
                message = text,
                sessionId = current.sessionId,
                tmuxSession = current.tmuxSession,
                resumeSessionId = current.resumeSessionId,
            ).onSuccess { data ->
                val displayText = stripJsonBlocks(data.response)
                _uiState.update {
                    it.copy(
                        messages = it.messages + ChatMessage("assistant", displayText),
                        sessionId = data.sessionId,
                        tmuxSession = data.tmuxSession,
                        resumeSessionId = null,
                        proposedIssues = data.issues,
                        checkedIssues = data.issues?.map { true } ?: emptyList(),
                        isSending = false,
                    )
                }
                startHealthCheck(data.tmuxSession)
            }.onFailure { e ->
                val msg = e.message ?: "Failed to send message"
                if (msg.contains("session_expired", ignoreCase = true)) {
                    _uiState.update {
                        it.copy(
                            messages = it.messages + ChatMessage("system", "Session expired. Your next message will start a new conversation."),
                            resumeSessionId = it.sessionId,
                            sessionId = null,
                            tmuxSession = null,
                            isSending = false,
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(error = msg, isSending = false)
                    }
                }
            }
        }
    }

    fun toggleIssueChecked(index: Int) {
        _uiState.update {
            val mutable = it.checkedIssues.toMutableList()
            if (index in mutable.indices) mutable[index] = !mutable[index]
            it.copy(checkedIssues = mutable)
        }
    }

    fun submitSelectedIssues() {
        val state = _uiState.value
        val issues = state.proposedIssues ?: return
        val selected = issues.filterIndexed { i, _ -> state.checkedIssues.getOrElse(i) { false } }
        if (selected.isEmpty()) return

        _uiState.update { it.copy(isSubmitting = true, error = null) }

        viewModelScope.launch {
            feedbackRepository.submitIssues(selected, state.sessionId)
                .onSuccess { data ->
                    _uiState.update {
                        it.copy(
                            submitResults = data.results,
                            proposedIssues = null,
                            checkedIssues = emptyList(),
                            isSubmitting = false,
                        )
                    }
                    concludeAfterSubmit()
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(error = e.message ?: "Failed to submit issues", isSubmitting = false)
                    }
                }
        }
    }

    fun closeSession() {
        val tmux = _uiState.value.tmuxSession
        if (tmux != null) {
            viewModelScope.launch { feedbackRepository.closeSession(tmux) }
        }
        stopHealthCheck()
    }

    fun newChat() {
        closeSession()
        _uiState.value = FeedbackChatUiState(serverFound = true)
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun concludeAfterSubmit() {
        val results = _uiState.value.submitResults
        closeSession()
        _uiState.value = FeedbackChatUiState(
            serverFound = true,
            submitResults = results,
        )
    }

    fun dismissSubmitResults() {
        _uiState.update { it.copy(submitResults = null) }
    }

    private fun startHealthCheck(tmuxSession: String) {
        healthCheckJob?.cancel()
        healthCheckJob = viewModelScope.launch {
            while (true) {
                delay(15_000)
                if (!feedbackRepository.checkSessionAlive(tmuxSession)) {
                    _uiState.update {
                        if (it.tmuxSession == tmuxSession) {
                            it.copy(
                                resumeSessionId = it.sessionId,
                                sessionId = null,
                                tmuxSession = null,
                            )
                        } else it
                    }
                    break
                }
            }
        }
    }

    private fun stopHealthCheck() {
        healthCheckJob?.cancel()
        healthCheckJob = null
    }

    override fun onCleared() {
        super.onCleared()
        closeSession()
    }

    companion object {
        private val jsonBlockRegex = Regex("```json\\s*\\n.*?\\n```", RegexOption.DOT_MATCHES_ALL)
        private val rawJsonArrayRegex = Regex("\\[\\s*\\{\\s*\"title\".*?\\}\\s*\\]", RegexOption.DOT_MATCHES_ALL)

        fun stripJsonBlocks(text: String): String {
            return text
                .replace(jsonBlockRegex, "")
                .replace(rawJsonArrayRegex, "")
                .trim()
        }
    }
}
