package com.automatelinux.feedbacklib.ui.issues

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.automatelinux.feedbacklib.data.model.FixIssueItem
import com.automatelinux.feedbacklib.data.model.Issue
import com.automatelinux.feedbacklib.data.repository.FeedbackRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FeedbackIssuesUiState(
    val issues: List<Issue> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val actionLoadingIssue: Int? = null,
    val expandedIds: Set<Int> = emptySet(),
    val selectedIds: Set<Int> = emptySet(),
    val fixLoading: Boolean = false,
    val installLoading: Boolean = false,
    val showSameVersionDialog: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
)

@HiltViewModel
class FeedbackIssuesViewModel @Inject constructor(
    private val feedbackRepository: FeedbackRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackIssuesUiState())
    val uiState: StateFlow<FeedbackIssuesUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch { fetchIssues(initial = true) }
    }

    fun refresh() {
        viewModelScope.launch { fetchIssues(initial = false) }
    }

    private suspend fun fetchIssues(initial: Boolean) {
        _uiState.update {
            if (initial) it.copy(loading = true, error = null)
            else it.copy(refreshing = true, error = null)
        }
        feedbackRepository.listIssues()
            .onSuccess { all ->
                val sorted = all
                    .filter { it.labels.contains("user-reported") }
                    .sortedWith(
                        compareBy<Issue> { it.status == "closed" }
                            .thenByDescending {
                                if (it.status == "closed") it.updatedAt else it.createdAt
                            }
                    )
                _uiState.update {
                    it.copy(issues = sorted, loading = false, refreshing = false)
                }
            }
            .onFailure { e ->
                _uiState.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.message ?: "Failed to load issues",
                    )
                }
            }
    }

    fun toggleExpanded(issueNumber: Int) {
        _uiState.update {
            val next = it.expandedIds.toMutableSet()
            if (!next.add(issueNumber)) next.remove(issueNumber)
            it.copy(expandedIds = next)
        }
    }

    fun closeIssue(issueNumber: Int) {
        actOnIssue(issueNumber) { feedbackRepository.closeIssue(issueNumber) }
    }

    fun reopenIssue(issueNumber: Int) {
        actOnIssue(issueNumber) { feedbackRepository.reopenIssue(issueNumber) }
    }

    fun deleteIssue(issueNumber: Int) {
        actOnIssue(issueNumber) { feedbackRepository.deleteIssue(issueNumber) }
    }

    private fun actOnIssue(issueNumber: Int, block: suspend () -> Result<*>) {
        _uiState.update { it.copy(actionLoadingIssue = issueNumber, error = null) }
        viewModelScope.launch {
            block()
                .onSuccess {
                    fetchIssues(initial = false)
                    _uiState.update { it.copy(actionLoadingIssue = null) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            actionLoadingIssue = null,
                            error = e.message ?: "Action failed",
                        )
                    }
                }
        }
    }

    fun toggleSelected(issueNumber: Int) {
        _uiState.update {
            val next = it.selectedIds.toMutableSet()
            if (!next.add(issueNumber)) next.remove(issueNumber)
            it.copy(selectedIds = next)
        }
    }

    fun fixSelectedIssues() {
        val state = _uiState.value
        val selected = state.issues.filter {
            state.selectedIds.contains(it.issueNumber) && it.status != "closed"
        }
        if (selected.isEmpty()) return
        _uiState.update { it.copy(fixLoading = true, error = null) }
        viewModelScope.launch {
            val items = selected.map { issue ->
                FixIssueItem(
                    number = issue.issueNumber,
                    title = issue.title,
                    status = if (issue.status == "regression") issue.status else null,
                    insights = if (issue.status == "regression") issue.insights else null,
                    claudeSessionIds = if (issue.status == "regression") issue.claudeSessionIds else null,
                )
            }
            feedbackRepository.fixIssues(items)
                .onSuccess {
                    _uiState.update { st ->
                        st.copy(
                            issues = st.issues.map { i ->
                                if (st.selectedIds.contains(i.issueNumber)) i.copy(status = "in_progress") else i
                            },
                            selectedIds = emptySet(),
                            fixLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(fixLoading = false, error = e.message ?: "Fix failed")
                    }
                }
        }
    }

    fun fixSingleIssue(issue: Issue, resumeSessionId: String? = null) {
        _uiState.update { it.copy(fixLoading = true, error = null) }
        viewModelScope.launch {
            val item = FixIssueItem(
                number = issue.issueNumber,
                title = issue.title,
                status = issue.status,
                insights = issue.insights,
                claudeSessionIds = issue.claudeSessionIds,
                claudeLaunchDir = issue.claudeLaunchDir,
            )
            feedbackRepository.fixIssues(listOf(item), resumeSessionId)
                .onSuccess {
                    _uiState.update { st ->
                        st.copy(
                            issues = st.issues.map { i ->
                                if (i.issueNumber == issue.issueNumber) i.copy(status = "in_progress") else i
                            },
                            fixLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(fixLoading = false, error = e.message ?: "Fix failed")
                    }
                }
        }
    }

    fun installFixedVersion(force: Boolean = false) {
        _uiState.update { it.copy(installLoading = true, error = null, successMessage = null, showSameVersionDialog = false) }
        viewModelScope.launch {
            feedbackRepository.installApp(force = force)
                .onSuccess { response ->
                    if (response.sameVersion == true && !force) {
                        _uiState.update { it.copy(installLoading = false, showSameVersionDialog = true) }
                    } else {
                        _uiState.update { it.copy(installLoading = false, successMessage = "Installed successfully") }
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(installLoading = false, error = e.message ?: "Install failed")
                    }
                }
        }
    }

    fun dismissSameVersionDialog() {
        _uiState.update { it.copy(showSameVersionDialog = false) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(successMessage = null) }
    }
}
