package com.automatelinux.feedbacklib.ui.issues

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.automatelinux.feedbacklib.data.model.FixIssueItem
import com.automatelinux.feedbacklib.data.model.Issue
import com.automatelinux.feedbacklib.data.repository.FeedbackRepository
import com.automatelinux.feedbacklib.data.repository.FeedbackSessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BatchFixTarget(
    val issues: List<Issue>,
    val sessionIds: List<String>,
)

data class FeedbackIssuesUiState(
    val issues: List<Issue> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val actionLoadingIssue: Int? = null,
    val expandedIds: Set<Int> = emptySet(),
    val selectedIds: Set<Int> = emptySet(),
    val fixLoading: Boolean = false,
    val buildLoading: Boolean = false,
    val installLoading: Boolean = false,
    val showSameVersionDialog: Boolean = false,
    val showUpdateDetails: Boolean = false,
    val hasUpdate: Boolean = false,
    val needsBuild: Boolean = false,
    val buildFailed: Boolean = false,
    val newVersion: String? = null,
    val newFlVersion: String? = null,
    val flVersion: String? = null,
    val flStale: Boolean = false,
    val vStale: Boolean = false,
    val installedCommit: String? = null,
    val serverGitCommit: String? = null,
    val serverApkCommit: String? = null,
    val error: String? = null,
    val successMessage: String? = null,
    val batchFixTarget: BatchFixTarget? = null,
)

@HiltViewModel
class FeedbackIssuesViewModel @Inject constructor(
    private val feedbackRepository: FeedbackRepository,
    private val sessionStore: FeedbackSessionStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackIssuesUiState())
    val uiState: StateFlow<FeedbackIssuesUiState> = _uiState.asStateFlow()

    init {
        if (sessionStore.isInstallInProgress()) {
            _uiState.update { it.copy(installLoading = true, hasUpdate = true) }
            pollInstallCompletion()
        }
        viewModelScope.launch {
            fetchIssues(initial = true)
            checkVersions()
        }
    }

    private fun pollInstallCompletion() {
        viewModelScope.launch {
            while (sessionStore.isInstallInProgress()) {
                delay(3000)
                val health = feedbackRepository.checkHealth().getOrNull() ?: continue
                val installedCommit = Regex("\\(([^)]+)\\)").find(
                    feedbackRepository.versionName
                )?.groupValues?.get(1) ?: ""
                val apkCommit = health.apkCommit ?: ""
                if (apkCommit.isNotBlank() && installedCommit.isNotBlank() && apkCommit == installedCommit) {
                    sessionStore.clearInstallStarted()
                    _uiState.update { it.copy(installLoading = false, hasUpdate = false, successMessage = "Installed successfully") }
                    return@launch
                }
            }
            _uiState.update { it.copy(installLoading = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            fetchIssues(initial = false)
            checkVersions()
        }
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

    fun markFixed(issue: Issue) {
        val hasNonClosedSibling = issue.claudeSessionId?.let { sessionId ->
            _uiState.value.issues.any {
                it.issueNumber != issue.issueNumber &&
                    it.status != "closed" &&
                    it.claudeSessionId == sessionId
            }
        } ?: false
        actOnIssue(issue.issueNumber) {
            feedbackRepository.reviewIssue(
                issueNumbers = listOf(issue.issueNumber),
                conclude = !hasNonClosedSibling,
                claudeSessionId = issue.claudeSessionId,
                claudeLaunchDir = issue.claudeLaunchDir,
            )
        }
    }

    fun clearRegression(issueNumber: Int) {
        actOnIssue(issueNumber) { feedbackRepository.updateIssueStatus(issueNumber, "closed") }
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
            state.selectedIds.contains(it.issueNumber) && it.status != "closed" && it.status != "review"
        }
        if (selected.isEmpty()) return

        val seen = mutableSetOf<String>()
        val mergedSessions = mutableListOf<String>()
        for (issue in selected) {
            val own = issue.claudeSessionIds ?: emptyList()
            val siblings = getSiblingFixSessions(issue, state.issues)
            for (sid in own + siblings) {
                if (seen.add(sid)) mergedSessions.add(sid)
            }
        }

        if (mergedSessions.isNotEmpty()) {
            _uiState.update { it.copy(batchFixTarget = BatchFixTarget(selected, mergedSessions)) }
            return
        }

        executeBatchFix(selected)
    }

    fun executeBatchFix(issues: List<Issue>, resumeSessionId: String? = null) {
        _uiState.update { it.copy(batchFixTarget = null, fixLoading = true, error = null) }
        viewModelScope.launch {
            val items = issues.map { issue ->
                FixIssueItem(
                    number = issue.issueNumber,
                    title = issue.title,
                    status = if (issue.status == "regression") issue.status else null,
                    insights = if (issue.status == "regression") issue.insights else null,
                    claudeSessionIds = if (issue.status == "regression") issue.claudeSessionIds else null,
                )
            }
            feedbackRepository.fixIssues(items, resumeSessionId)
                .onSuccess {
                    val issueNumbers = issues.map { it.issueNumber }.toSet()
                    _uiState.update { st ->
                        st.copy(
                            issues = st.issues.map { i ->
                                if (issueNumbers.contains(i.issueNumber)) i.copy(status = "in_progress") else i
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

    fun dismissBatchFixDialog() {
        _uiState.update { it.copy(batchFixTarget = null) }
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

    private suspend fun checkVersions() {
        feedbackRepository.checkHealth()
            .onSuccess { health ->
                val installedCommit = Regex("\\(([^)]+)\\)").find(
                    feedbackRepository.versionName
                )?.groupValues?.get(1) ?: ""
                val gitCommit = health.gitCommit ?: ""
                val apkCommit = health.apkCommit ?: ""
                val appNeedsBuild = gitCommit.isNotBlank() && apkCommit.isNotBlank() && gitCommit != apkCommit
                val hasUpdate = apkCommit.isNotBlank() && installedCommit.isNotBlank() && apkCommit != installedCommit
                val newVersion = when {
                    hasUpdate && (health.apkVersion ?: 0) > 0 -> health.apkVersion.toString()
                    appNeedsBuild && (health.gitVersion ?: 0) > 0 -> health.gitVersion.toString()
                    else -> null
                }
                _uiState.update {
                    it.copy(
                        hasUpdate = hasUpdate,
                        needsBuild = appNeedsBuild,
                        newVersion = newVersion,
                        vStale = hasUpdate || appNeedsBuild,
                        installedCommit = installedCommit.ifBlank { null },
                        serverGitCommit = gitCommit.ifBlank { null },
                        serverApkCommit = apkCommit.ifBlank { null },
                    )
                }
            }
        checkFeedbackLibVersion()
    }

    private suspend fun checkFeedbackLibVersion() {
        val builtCommit = com.automatelinux.feedbacklib.BuildConfig.FEEDBACK_LIB_COMMIT
        val builtVersion = com.automatelinux.feedbacklib.BuildConfig.FEEDBACK_LIB_VERSION
        if (builtCommit.isBlank()) return
        feedbackRepository.checkFeedbackLibVersion()
            .onSuccess { data ->
                val serverCommit = data.feedbackLibCommit ?: return@onSuccess
                val serverVer = data.feedbackLibVersion?.toString()
                val stale = serverCommit != builtCommit
                _uiState.update {
                    it.copy(
                        needsBuild = if (stale) true else it.needsBuild,
                        newFlVersion = if (stale) serverVer else null,
                        flVersion = builtVersion.toString(),
                        flStale = stale,
                    )
                }
            }
    }

    fun buildApp(onComplete: () -> Unit = {}) {
        _uiState.update { it.copy(buildLoading = true, buildFailed = false, error = null, successMessage = null) }
        viewModelScope.launch {
            feedbackRepository.buildApp()
                .onSuccess {
                    _uiState.update { it.copy(buildLoading = false, needsBuild = false, hasUpdate = true, successMessage = "Build complete", flStale = false) }
                    onComplete()
                }
                .onFailure { e ->
                    _uiState.update { it.copy(buildLoading = false, buildFailed = true, error = e.message ?: "Build failed") }
                }
        }
    }

    fun cleanBuildApp() {
        _uiState.update { it.copy(buildLoading = true, buildFailed = false, error = null, successMessage = null) }
        viewModelScope.launch {
            feedbackRepository.cleanBuildApp()
                .onSuccess {
                    _uiState.update { it.copy(buildLoading = false, needsBuild = false, hasUpdate = true, successMessage = "Clean build complete", flStale = false) }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(buildLoading = false, buildFailed = true, error = e.message ?: "Clean build failed") }
                }
        }
    }

    fun installFixedVersion(force: Boolean = false) {
        _uiState.update { it.copy(installLoading = true, error = null, successMessage = null, showSameVersionDialog = false) }
        sessionStore.markInstallStarted()
        viewModelScope.launch {
            feedbackRepository.installApp(force = force)
                .onSuccess { response ->
                    sessionStore.clearInstallStarted()
                    if (response.sameVersion == true && !force) {
                        _uiState.update { it.copy(installLoading = false, showSameVersionDialog = true) }
                    } else {
                        _uiState.update { it.copy(installLoading = false, successMessage = "Installed successfully") }
                    }
                }
                .onFailure { e ->
                    sessionStore.clearInstallStarted()
                    _uiState.update {
                        it.copy(installLoading = false, error = e.message ?: "Install failed")
                    }
                }
        }
    }

    fun showUpdateDetails() {
        _uiState.update { it.copy(showUpdateDetails = true) }
    }

    fun dismissUpdateDetails() {
        _uiState.update { it.copy(showUpdateDetails = false) }
    }

    fun dismissSameVersionDialog() {
        _uiState.update { it.copy(showSameVersionDialog = false) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null, buildFailed = false) }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(successMessage = null) }
    }
}

fun getSiblingFixSessions(issue: Issue, allIssues: List<Issue>): List<String> {
    val clarifierId = issue.clarifierSessionId ?: return emptyList()
    val own = issue.claudeSessionIds?.toSet() ?: emptySet()
    return allIssues
        .filter { it.clarifierSessionId == clarifierId && !it.claudeSessionIds.isNullOrEmpty() }
        .flatMap { it.claudeSessionIds!! }
        .distinct()
        .filter { it !in own }
}

fun getSiblingLaunchDir(issue: Issue, allIssues: List<Issue>): String? {
    val clarifierId = issue.clarifierSessionId ?: return null
    return allIssues
        .firstOrNull { it.clarifierSessionId == clarifierId && it.claudeLaunchDir != null }
        ?.claudeLaunchDir
}
