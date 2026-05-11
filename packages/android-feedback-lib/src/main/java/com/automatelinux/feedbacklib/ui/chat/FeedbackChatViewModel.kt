package com.automatelinux.feedbacklib.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.repository.FeedbackRepository
import com.automatelinux.feedbacklib.data.repository.FeedbackSessionStore
import com.automatelinux.feedbacklib.data.repository.PersistedMessage
import com.automatelinux.feedbacklib.data.repository.PersistedSession
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
    private val sessionStore: FeedbackSessionStore,
    private val config: FeedbackConfig,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackChatUiState())
    val uiState: StateFlow<FeedbackChatUiState> = _uiState.asStateFlow()

    private var healthCheckJob: Job? = null

    init {
        restoreSession()
    }

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

        val existingIssues = state.proposedIssues
        val newMessages = buildList {
            addAll(state.messages)
            if (!existingIssues.isNullOrEmpty()) {
                add(ChatMessage("assistant", "", staleIssues = existingIssues))
            }
            add(ChatMessage("user", text))
        }

        _uiState.update {
            it.copy(
                messages = newMessages,
                inputText = "",
                isSending = true,
                error = null,
                lastSendFailed = false,
                proposedIssues = null,
                checkedIssues = emptyList(),
                submitResults = null,
                showPostSubmitPrompt = false,
            )
        }

        val screenContext = feedbackRepository.getScreenContext()

        viewModelScope.launch {
            val current = _uiState.value
            feedbackRepository.sendMessage(
                message = text,
                sessionId = current.sessionId,
                tmuxSession = current.tmuxSession,
                resumeSessionId = current.resumeSessionId,
                pagePath = screenContext,
                pageContext = screenContext,
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
                        hookWarning = data.hookWarning ?: it.hookWarning,
                        isSending = false,
                    )
                }
                persistSession()
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
                    persistSession()
                } else {
                    _uiState.update {
                        it.copy(error = msg, isSending = false, lastSendFailed = true)
                    }
                }
            }
        }
    }

    fun retryLastMessage() {
        val state = _uiState.value
        if (state.isSending || !state.lastSendFailed) return
        val lastUserMsg = state.messages.lastOrNull { it.role == "user" } ?: return

        _uiState.update {
            it.copy(
                isSending = true,
                error = null,
                lastSendFailed = false,
            )
        }

        val screenContext = feedbackRepository.getScreenContext()

        viewModelScope.launch {
            val current = _uiState.value
            feedbackRepository.sendMessage(
                message = lastUserMsg.text,
                sessionId = current.sessionId,
                tmuxSession = current.tmuxSession,
                resumeSessionId = current.resumeSessionId,
                pagePath = screenContext,
                pageContext = screenContext,
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
                        hookWarning = data.hookWarning ?: it.hookWarning,
                        isSending = false,
                    )
                }
                persistSession()
                startHealthCheck(data.tmuxSession)
            }.onFailure { e ->
                val msg = e.message ?: "Failed to send message"
                _uiState.update {
                    it.copy(error = msg, isSending = false, lastSendFailed = true)
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

        val screenContext = feedbackRepository.getScreenContext()

        viewModelScope.launch {
            feedbackRepository.submitIssues(
                selected,
                state.sessionId,
                pagePath = screenContext,
                pageContext = screenContext,
            )
                .onSuccess { data ->
                    _uiState.update {
                        it.copy(
                            submitResults = data.results,
                            proposedIssues = null,
                            checkedIssues = emptyList(),
                            isSubmitting = false,
                            showPostSubmitPrompt = true,
                        )
                    }
                    persistSession()
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(error = e.message ?: "Failed to submit issues", isSubmitting = false)
                    }
                }
        }
    }

    fun submitStaleIssue(issue: com.automatelinux.feedbacklib.data.model.FeedbackIssue) {
        val state = _uiState.value
        val screenContext = feedbackRepository.getScreenContext()

        viewModelScope.launch {
            feedbackRepository.submitIssues(
                listOf(issue),
                state.sessionId,
                pagePath = screenContext,
                pageContext = screenContext,
            )
                .onSuccess { data ->
                    _uiState.update {
                        it.copy(
                            messages = it.messages.map { msg ->
                                val stale = msg.staleIssues ?: return@map msg
                                val filtered = stale.filter { si -> si.title != issue.title }
                                msg.copy(staleIssues = filtered.ifEmpty { null })
                            },
                            submitResults = (it.submitResults ?: emptyList()) + data.results,
                        )
                    }
                    persistSession()
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(error = e.message ?: "Failed to submit issue")
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
        sessionStore.clear()
    }

    fun refreshSession() {
        val persisted = sessionStore.load() ?: return
        val restoredMessages = persisted.messages.map { m -> ChatMessage(m.role, m.text, m.staleIssues) }
        if (restoredMessages.isEmpty()) return

        _uiState.update {
            it.copy(messages = restoredMessages)
        }

        val sid = persisted.sessionId.takeIf { it != PENDING_SESSION_SENTINEL }
        if (sid != null && persisted.tmuxSession != null) {
            viewModelScope.launch {
                val alive = feedbackRepository.checkSessionAlive(persisted.tmuxSession)
                if (alive) {
                    _uiState.update { it.copy(sessionId = sid, tmuxSession = persisted.tmuxSession) }
                    startHealthCheck(persisted.tmuxSession)
                } else {
                    _uiState.update { it.copy(resumeSessionId = sid, sessionId = null, tmuxSession = null) }
                }
            }
        } else if (sid != null) {
            _uiState.update { it.copy(resumeSessionId = sid) }
        }
    }

    fun newChat() {
        closeSession()
        _uiState.value = FeedbackChatUiState(serverFound = true)
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun dismissSubmitResults() {
        _uiState.update { it.copy(submitResults = null, showPostSubmitPrompt = false) }
    }

    fun dismissPostSubmitPrompt() {
        _uiState.update { it.copy(showPostSubmitPrompt = false) }
    }

    // ── Direct mode (#30) ────────────────────────────────────────────────

    fun toggleDirectMode() {
        _uiState.update { it.copy(directMode = !it.directMode) }
    }

    fun updateDirectTitle(text: String) {
        _uiState.update { it.copy(directTitle = text) }
    }

    fun updateDirectDescription(text: String) {
        _uiState.update { it.copy(directDescription = text) }
    }

    fun submitDirectIssue() {
        val state = _uiState.value
        val title = state.directTitle.trim()
        if (title.isBlank() || state.directLoading) return

        _uiState.update { it.copy(directLoading = true, error = null) }

        val screenContext = feedbackRepository.getScreenContext()

        viewModelScope.launch {
            feedbackRepository.createDirectIssue(
                title = title,
                description = state.directDescription.trim().ifBlank { null },
                pagePath = screenContext,
                pageContext = screenContext,
            )
                .onSuccess { data ->
                    _uiState.update {
                        it.copy(
                            directTitle = "",
                            directDescription = "",
                            directLoading = false,
                            submitResults = listOf(
                                com.automatelinux.feedbacklib.data.model.FeedbackSubmitResult(
                                    title = title,
                                    issueNumber = data.issueNumber,
                                    success = true,
                                )
                            ),
                            showPostSubmitPrompt = true,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            directLoading = false,
                            submitResults = listOf(
                                com.automatelinux.feedbacklib.data.model.FeedbackSubmitResult(
                                    title = title,
                                    success = false,
                                    error = e.message,
                                )
                            ),
                        )
                    }
                }
        }
    }

    // ── Session persistence (#26) ────────────────────────────────────────

    private fun persistSession() {
        val state = _uiState.value
        val sid = state.sessionId ?: state.resumeSessionId ?: return
        sessionStore.save(
            PersistedSession(
                sessionId = sid,
                tmuxSession = state.tmuxSession,
                messages = state.messages.map { PersistedMessage(it.role, it.text, it.staleIssues) },
            )
        )
    }

    fun persistOnPause() {
        val state = _uiState.value
        if (state.messages.isEmpty()) return
        val sid = state.sessionId ?: state.resumeSessionId
        sessionStore.saveSync(
            PersistedSession(
                sessionId = sid ?: PENDING_SESSION_SENTINEL,
                tmuxSession = state.tmuxSession,
                messages = state.messages.map { PersistedMessage(it.role, it.text, it.staleIssues) },
            )
        )
    }

    private fun restoreSession() {
        val persisted = sessionStore.load() ?: return
        val restoredMessages = persisted.messages.map { m -> ChatMessage(m.role, m.text, m.staleIssues) }

        if (persisted.sessionId == PENDING_SESSION_SENTINEL) {
            _uiState.update { it.copy(messages = restoredMessages) }
            return
        }

        if (persisted.tmuxSession == null) {
            _uiState.update {
                it.copy(
                    resumeSessionId = persisted.sessionId,
                    messages = restoredMessages,
                )
            }
            return
        }

        _uiState.update {
            it.copy(
                sessionId = persisted.sessionId,
                tmuxSession = persisted.tmuxSession,
                messages = restoredMessages,
                restoringSession = true,
            )
        }
        viewModelScope.launch {
            val alive = feedbackRepository.checkSessionAlive(persisted.tmuxSession)
            if (alive) {
                _uiState.update { it.copy(restoringSession = false) }
                startHealthCheck(persisted.tmuxSession)
            } else {
                _uiState.update {
                    it.copy(
                        resumeSessionId = persisted.sessionId,
                        sessionId = null,
                        tmuxSession = null,
                        restoringSession = false,
                    )
                }
                persistSession()
            }
        }
    }

    // ── Health check ─────────────────────────────────────────────────────

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
                    persistSession()
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
        persistOnPause()
        stopHealthCheck()
    }

    companion object {
        internal const val PENDING_SESSION_SENTINEL = "__pending__"
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
