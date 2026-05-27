package com.automatelinux.feedbacklib.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.model.FeedbackIssue
import com.automatelinux.feedbacklib.data.model.Issue
import com.automatelinux.feedbacklib.data.model.PriorIssueContext
import com.automatelinux.feedbacklib.data.model.SessionHistoryMessage
import com.automatelinux.feedbacklib.data.repository.FeedbackRepository
import com.automatelinux.feedbacklib.data.repository.FeedbackSessionStore
import com.automatelinux.feedbacklib.data.repository.PersistedMessage
import com.automatelinux.feedbacklib.data.repository.PersistedSession
import com.automatelinux.feedbacklib.data.repository.SessionSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class FeedbackChatViewModel @Inject constructor(
    private val feedbackRepository: FeedbackRepository,
    private val sessionStore: FeedbackSessionStore,
    private val config: FeedbackConfig,
) : ViewModel() {

    val appName: String = config.appName

    private val _uiState = MutableStateFlow(FeedbackChatUiState())
    val uiState: StateFlow<FeedbackChatUiState> = _uiState.asStateFlow()

    private var healthCheckJob: Job? = null
    private var restoreJob: Job? = null
    private var _currentStorageId: String? = null

    init {
        sessionStore.migrateIfNeeded()
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
                priorIssue = current.priorIssue,
            ).onSuccess { data ->
                val displayText = stripJsonBlocks(data.response)
                _uiState.update {
                    it.copy(
                        messages = it.messages + ChatMessage("assistant", displayText),
                        sessionId = data.sessionId,
                        tmuxSession = data.tmuxSession,
                        resumeSessionId = null,
                        priorIssue = null,
                        proposedIssues = data.issues,
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
                            priorIssue = null,
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
                priorIssue = current.priorIssue,
            ).onSuccess { data ->
                val displayText = stripJsonBlocks(data.response)
                _uiState.update {
                    it.copy(
                        messages = it.messages + ChatMessage("assistant", displayText),
                        sessionId = data.sessionId,
                        tmuxSession = data.tmuxSession,
                        resumeSessionId = null,
                        priorIssue = null,
                        proposedIssues = data.issues,
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

    fun submitOneIssue(index: Int) {
        val state = _uiState.value
        val issues = state.proposedIssues ?: return
        val issue = issues.getOrNull(index) ?: return
        if (state.submittingIndex != null) return

        _uiState.update { it.copy(submittingIndex = index, error = null) }

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
                        val remaining = it.proposedIssues?.toMutableList()
                        remaining?.removeAt(index)
                        it.copy(
                            submitResults = (it.submitResults ?: emptyList()) + data.results,
                            proposedIssues = remaining?.ifEmpty { null },
                            submittingIndex = null,
                            showPostSubmitPrompt = remaining.isNullOrEmpty(),
                        )
                    }
                    persistSession()
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(error = e.message ?: "Failed to submit issue", submittingIndex = null)
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
        _currentStorageId?.let { sessionStore.removeMulti(it) }
        _currentStorageId = null
        sessionStore.setActiveSessionId(null)
        sessionStore.clear()
        _uiState.value = FeedbackChatUiState(serverFound = true, savedSessions = sessionStore.getSessions())
    }

    fun refreshSession() {
        val state = _uiState.value
        if (state.isSending) return
        val sid = state.sessionId
            ?: state.resumeSessionId
            ?: sessionStore.load()?.sessionId?.takeIf { it != PENDING_SESSION_SENTINEL }
        if (sid == null) {
            if (state.lastSendFailed) {
                retryLastMessage()
            } else {
                _uiState.update { it.copy(error = "No session to refresh") }
            }
            return
        }

        _uiState.update { it.copy(restoringSession = true) }
        viewModelScope.launch {
            feedbackRepository.getSessionHistory(sid)
                .onSuccess { data ->
                    if (data.found && data.messages.isNotEmpty()) {
                        val (msgs, issues) = extractMessagesAndProposedIssues(data.messages)
                        _uiState.update { it.copy(messages = msgs, proposedIssues = issues) }
                        persistSession()
                    }
                }
            val tmux = state.tmuxSession ?: sessionStore.load()?.tmuxSession
            val alive = tmux != null && feedbackRepository.checkSessionAlive(tmux)
            if (alive) {
                _uiState.update { it.copy(sessionId = sid, tmuxSession = tmux, restoringSession = false) }
                startHealthCheck(tmux!!)
            } else {
                resumeDeadSession(sid)
            }
        }
    }

    private suspend fun resumeDeadSession(sid: String) {
        feedbackRepository.sendMessage(
            message = " ",
            resumeSessionId = sid,
        ).onSuccess { data ->
            _uiState.update {
                it.copy(
                    sessionId = data.sessionId,
                    tmuxSession = data.tmuxSession,
                    resumeSessionId = null,
                    restoringSession = false,
                )
            }
            persistSession()
            startHealthCheck(data.tmuxSession)
        }.onFailure { e ->
            _uiState.update { it.copy(
                resumeSessionId = sid,
                sessionId = null,
                tmuxSession = null,
                restoringSession = false,
                error = e.message ?: "Resume failed",
            ) }
        }
    }

    fun newChat() {
        val state = _uiState.value
        if (state.messages.isNotEmpty() || state.inputText.isNotBlank()) {
            persistOnPause()
        }
        stopHealthCheck()
        _currentStorageId = null
        sessionStore.setActiveSessionId(null)
        _uiState.value = FeedbackChatUiState(serverFound = true, savedSessions = sessionStore.getSessions())
    }

    fun resumeClarifierSession(clarifierSessionId: String, issue: Issue? = null) {
        restoreJob?.cancel()
        restoreJob = null
        val state = _uiState.value
        if (state.messages.isNotEmpty() || state.inputText.isNotBlank()) {
            persistOnPause()
        }
        stopHealthCheck()
        _currentStorageId = null
        _uiState.value = FeedbackChatUiState(
            serverFound = true,
            resumeSessionId = clarifierSessionId,
            restoringSession = true,
            savedSessions = sessionStore.getSessions(),
            priorIssue = issue?.let {
                PriorIssueContext(
                    issueNumber = it.issueNumber,
                    title = it.title,
                    description = it.description,
                    status = it.status,
                    insights = it.insights,
                )
            },
        )
        viewModelScope.launch {
            feedbackRepository.getSessionHistory(clarifierSessionId)
                .onSuccess { data ->
                    if (data.found && data.messages.isNotEmpty()) {
                        val (msgs, issues) = extractMessagesAndProposedIssues(data.messages)
                        _uiState.update {
                            it.copy(
                                messages = msgs,
                                proposedIssues = issues,
                                restoringSession = false,
                            )
                        }
                    } else {
                        _uiState.update { it.copy(restoringSession = false) }
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(restoringSession = false) }
                }
        }
    }

    var savedScrollPosition: Pair<Int, Int>? = null
        private set

    fun saveScrollPosition(firstVisibleItemIndex: Int, firstVisibleItemScrollOffset: Int) {
        savedScrollPosition = Pair(firstVisibleItemIndex, firstVisibleItemScrollOffset)
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

    // ── Multi-session management (#66) ─────────────────────────────────

    fun toggleSessionSwitcher() {
        refreshSessionList()
        _uiState.update { it.copy(showSessionSwitcher = !it.showSessionSwitcher) }
    }

    fun hideSessionSwitcher() {
        _uiState.update { it.copy(showSessionSwitcher = false) }
    }

    fun switchToSession(storageId: String) {
        if (storageId == _currentStorageId) {
            _uiState.update { it.copy(showSessionSwitcher = false) }
            return
        }
        persistOnPause()
        stopHealthCheck()
        restoreJob?.cancel()

        val persisted = sessionStore.loadMulti(storageId) ?: return
        _currentStorageId = storageId
        sessionStore.setActiveSessionId(storageId)

        _uiState.value = FeedbackChatUiState(
            serverFound = _uiState.value.serverFound,
            savedSessions = sessionStore.getSessions(),
            currentStorageId = storageId,
        )
        restoreFromPersisted(persisted)
    }

    fun deleteStoredSession(storageId: String) {
        if (storageId == _currentStorageId) {
            closeSession()
            return
        }
        sessionStore.removeMulti(storageId)
        refreshSessionList()
    }

    private fun updateSessionIndex(storageId: String, state: FeedbackChatUiState) {
        val preview = state.messages.firstOrNull { it.role == "user" }?.text?.take(50)
            ?: state.inputText.take(50).ifBlank { "New conversation" }
        val sessions = sessionStore.getSessions().toMutableList()
        val idx = sessions.indexOfFirst { it.id == storageId }
        val summary = SessionSummary(storageId, preview, state.messages.size, System.currentTimeMillis())
        if (idx >= 0) sessions[idx] = summary else sessions.add(0, summary)
        sessionStore.saveSessions(sessions)
    }

    private fun refreshSessionList() {
        _uiState.update { it.copy(savedSessions = sessionStore.getSessions(), currentStorageId = _currentStorageId) }
    }

    // ── Session persistence (#26) ────────────────────────────────────────

    private fun persistSession() {
        val state = _uiState.value
        val sid = state.sessionId ?: state.resumeSessionId ?: return
        val storageId = _currentStorageId ?: UUID.randomUUID().toString().also { _currentStorageId = it }

        sessionStore.saveMulti(storageId, PersistedSession(
            sessionId = sid,
            tmuxSession = state.tmuxSession,
            messages = state.messages.map { PersistedMessage(it.role, it.text, it.staleIssues) },
            inputText = state.inputText.ifBlank { null },
            directTitle = state.directTitle.ifBlank { null },
            directDescription = state.directDescription.ifBlank { null },
        ))
        updateSessionIndex(storageId, state)
        sessionStore.setActiveSessionId(storageId)
        refreshSessionList()
    }

    fun persistOnPause() {
        val state = _uiState.value
        val hasDraft = state.inputText.isNotBlank() || state.directTitle.isNotBlank() || state.directDescription.isNotBlank()
        if (state.messages.isEmpty() && !hasDraft) return
        val sid = state.sessionId ?: state.resumeSessionId
        val storageId = _currentStorageId ?: UUID.randomUUID().toString().also { _currentStorageId = it }

        sessionStore.saveMultiSync(storageId, PersistedSession(
            sessionId = sid ?: PENDING_SESSION_SENTINEL,
            tmuxSession = state.tmuxSession,
            messages = state.messages.map { PersistedMessage(it.role, it.text, it.staleIssues) },
            inputText = state.inputText.ifBlank { null },
            directTitle = state.directTitle.ifBlank { null },
            directDescription = state.directDescription.ifBlank { null },
        ))
        updateSessionIndex(storageId, state)
        sessionStore.setActiveSessionId(storageId)
    }

    private fun restoreSession() {
        refreshSessionList()
        val activeId = sessionStore.getActiveSessionId()
        val persisted = if (activeId != null) {
            _currentStorageId = activeId
            sessionStore.loadMulti(activeId)
        } else {
            sessionStore.load()
        } ?: return

        restoreFromPersisted(persisted)
    }

    private fun restoreFromPersisted(persisted: PersistedSession) {
        val allMessages = persisted.messages.map { m -> ChatMessage(m.role, m.text, m.staleIssues) }
        val (restoredMessages, restoredIssues) = extractProposedIssuesFromChat(allMessages)
        val restoredInput = persisted.inputText ?: ""
        val restoredDirectTitle = persisted.directTitle ?: ""
        val restoredDirectDesc = persisted.directDescription ?: ""

        if (persisted.sessionId == PENDING_SESSION_SENTINEL) {
            _uiState.update { it.copy(
                messages = restoredMessages,
                inputText = restoredInput,
                directTitle = restoredDirectTitle,
                directDescription = restoredDirectDesc,
                proposedIssues = restoredIssues,
                currentStorageId = _currentStorageId,
            ) }
            return
        }

        if (persisted.tmuxSession == null) {
            _uiState.update {
                it.copy(
                    resumeSessionId = persisted.sessionId,
                    messages = restoredMessages,
                    inputText = restoredInput,
                    directTitle = restoredDirectTitle,
                    directDescription = restoredDirectDesc,
                    proposedIssues = restoredIssues,
                    currentStorageId = _currentStorageId,
                )
            }
            if (restoredIssues == null) {
                fetchProposedIssuesFromServer(persisted.sessionId)
            }
            return
        }

        _uiState.update {
            it.copy(
                sessionId = persisted.sessionId,
                tmuxSession = persisted.tmuxSession,
                messages = restoredMessages,
                inputText = restoredInput,
                directTitle = restoredDirectTitle,
                directDescription = restoredDirectDesc,
                proposedIssues = restoredIssues,
                restoringSession = true,
                currentStorageId = _currentStorageId,
            )
        }
        restoreJob = viewModelScope.launch {
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

    private fun fetchProposedIssuesFromServer(sessionId: String) {
        viewModelScope.launch {
            feedbackRepository.getSessionHistory(sessionId)
                .onSuccess { data ->
                    if (!data.found || data.messages.isEmpty()) return@onSuccess
                    val (serverMsgs, proposedIssues) = extractMessagesAndProposedIssues(data.messages)
                    val staleByText = serverMsgs
                        .filter { it.role == "assistant" && !it.staleIssues.isNullOrEmpty() }
                        .associateBy({ it.text.take(80) }, { it.staleIssues!! })
                    _uiState.update { state ->
                        val enriched = state.messages.map { local ->
                            if (local.role == "assistant" && local.staleIssues == null) {
                                val match = staleByText[local.text.take(80)]
                                if (match != null) local.copy(staleIssues = match) else local
                            } else local
                        }
                        state.copy(
                            messages = enriched,
                            proposedIssues = proposedIssues ?: state.proposedIssues,
                        )
                    }
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

        fun extractMessagesAndProposedIssues(
            history: List<SessionHistoryMessage>,
        ): Pair<List<ChatMessage>, List<FeedbackIssue>?> {
            if (history.isEmpty()) return Pair(emptyList(), null)
            val last = history.last()
            val proposedIssues = if (last.role == "assistant") last.staleIssues?.ifEmpty { null } else null
            val msgs = if (proposedIssues != null) {
                history.dropLast(1).map { ChatMessage(it.role, it.text, it.staleIssues) } +
                    ChatMessage(last.role, last.text)
            } else {
                history.map { ChatMessage(it.role, it.text, it.staleIssues) }
            }
            return Pair(msgs, proposedIssues)
        }

        fun extractProposedIssuesFromChat(
            messages: List<ChatMessage>,
        ): Pair<List<ChatMessage>, List<FeedbackIssue>?> {
            if (messages.isEmpty()) return Pair(emptyList(), null)
            val last = messages.last()
            val proposedIssues = if (last.role == "assistant") last.staleIssues?.ifEmpty { null } else null
            val msgs = if (proposedIssues != null) {
                messages.dropLast(1) + last.copy(staleIssues = null)
            } else {
                messages
            }
            return Pair(msgs, proposedIssues)
        }
    }
}
