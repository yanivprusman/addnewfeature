package com.automatelinux.feedbacklib.ui.issues

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.GetApp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield

import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.automatelinux.feedbacklib.data.model.Issue

@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class)
@Composable
fun FeedbackIssuesScreen(
    viewModel: FeedbackIssuesViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToChat: (() -> Unit)? = null,
    onResumeClarifier: ((issue: Issue) -> Unit)? = null,
    isProd: Boolean = false,
    versionName: String? = null,
) {
    @Suppress("NAME_SHADOWING")
    val versionName = versionName ?: run {
        val context = androidx.compose.ui.platform.LocalContext.current
        remember { context.packageManager.getPackageInfo(context.packageName, 0).versionName }
    }
    if (isProd) return

    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf<Issue?>(null) }
    var fixSessionTarget by remember { mutableStateOf<Issue?>(null) }
    val selectedCount = state.selectedIds.count { id ->
        state.issues.any { it.issueNumber == id && it.status != "closed" && it.status != "review" }
    }
    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.refreshing,
        onRefresh = { viewModel.refresh() },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Issues")
                        if (versionName != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val dimColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                val orange = Color(0xFFFF9800)
                                val vColor = if (state.vStale) orange else dimColor
                                val flColor = if (state.flStale) orange else dimColor
                                Text(
                                    text = buildAnnotatedString {
                                        withStyle(SpanStyle(color = vColor)) { append(versionName) }
                                        if (state.flVersion != null) {
                                            withStyle(SpanStyle(color = flColor)) { append(" FL${state.flVersion}") }
                                        }
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                if (state.needsBuild || state.buildLoading) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(orange.copy(alpha = 0.12f))
                                            .clickable(enabled = !state.buildLoading) {
                                                viewModel.showUpdateDetails()
                                            }
                                            .padding(horizontal = 6.dp, vertical = 1.dp),
                                    ) {
                                        if (state.buildLoading) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(8.dp),
                                                    strokeWidth = 1.dp,
                                                    color = orange,
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    text = "building…",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = orange,
                                                    fontSize = 9.sp,
                                                )
                                            }
                                        } else {
                                            val parts = mutableListOf<String>()
                                            if (state.newVersion != null) parts += "v${state.newVersion}"
                                            if (state.newFlVersion != null) parts += "FL${state.newFlVersion}"
                                            val label = if (parts.isNotEmpty()) "build → ${parts.joinToString(" · ")}" else "build needed"
                                            Text(
                                                text = label,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = orange,
                                                fontSize = 9.sp,
                                            )
                                        }
                                    }
                                } else if (state.hasUpdate) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                                            .clickable(enabled = !state.installLoading) {
                                                viewModel.showUpdateDetails()
                                            }
                                            .padding(horizontal = 6.dp, vertical = 1.dp),
                                    ) {
                                        if (state.installLoading) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(8.dp),
                                                    strokeWidth = 1.dp,
                                                    color = MaterialTheme.colorScheme.primary,
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    text = "installing…",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.primary,
                                                    fontSize = 9.sp,
                                                )
                                            }
                                        } else {
                                            Text(
                                                text = if (state.newVersion != null) "update → v${state.newVersion}" else "update available",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.primary,
                                                fontSize = 9.sp,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedCount > 0) {
                        TextButton(
                            onClick = viewModel::fixSelectedIssues,
                            enabled = !state.fixLoading,
                        ) {
                            if (state.fixLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Icon(
                                    Icons.Filled.Build,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Fix ($selectedCount)")
                            }
                        }
                    }
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
        floatingActionButton = {
            if (onNavigateToChat != null) {
                FloatingActionButton(
                    onClick = onNavigateToChat,
                    containerColor = MaterialTheme.colorScheme.primary,
                ) {
                    Icon(
                        Icons.Filled.BugReport,
                        contentDescription = "Report Issue",
                        tint = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .pullRefresh(pullRefreshState),
        ) {
            when {
                state.loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.issues.isEmpty() && state.error == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "No issues yet",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item { Spacer(modifier = Modifier.height(4.dp)) }
                        items(state.issues, key = { it.issueNumber }) { issue ->
                            IssueCard(
                                issue = issue,
                                expanded = state.expandedIds.contains(issue.issueNumber),
                                selected = state.selectedIds.contains(issue.issueNumber),
                                actionLoading = state.actionLoadingIssue == issue.issueNumber,
                                fixLoading = state.fixLoading,
                                onToggleExpand = { viewModel.toggleExpanded(issue.issueNumber) },
                                onToggleSelect = { viewModel.toggleSelected(issue.issueNumber) },
                                onClose = { viewModel.closeIssue(issue.issueNumber) },

                                onDelete = { confirmDelete = issue },
                                onFix = {
                                    val siblingIds = getSiblingFixSessions(issue, state.issues)
                                    val allSessionIds = ((issue.claudeSessionIds ?: emptyList()) + siblingIds).distinct()
                                    if (allSessionIds.isNotEmpty()) {
                                        fixSessionTarget = issue.copy(
                                            claudeSessionIds = allSessionIds,
                                            claudeLaunchDir = issue.claudeLaunchDir ?: getSiblingLaunchDir(issue, state.issues),
                                        )
                                    } else {
                                        viewModel.fixSingleIssue(issue)
                                    }
                                },
                                onMarkFixed = { viewModel.markFixed(issue) },
                                onClearRegression = { viewModel.clearRegression(issue.issueNumber) },
                                onResumeClarifier = issue.clarifierSessionId?.let { _ ->
                                    onResumeClarifier?.let { callback -> { callback(issue) } }
                                },
                            )
                        }
                        item { Spacer(modifier = Modifier.height(8.dp)) }
                    }
                }
            }

            PullRefreshIndicator(
                refreshing = state.refreshing,
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
            )

            state.successMessage?.let { msg ->
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(12.dp),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = msg,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = viewModel::dismissSuccess) { Text("OK") }
                    }
                }
            }

            state.error?.let { err ->
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(12.dp),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = err,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        if (state.buildFailed) {
                            TextButton(onClick = viewModel::cleanBuildApp) { Text("Clean & Rebuild") }
                        }
                        TextButton(onClick = viewModel::dismissError) { Text("OK") }
                    }
                }
            }
        }
    }

    confirmDelete?.let { issue ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete issue?") },
            text = { Text("Delete #${issue.issueNumber}: ${issue.title}?") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteIssue(issue.issueNumber)
                    confirmDelete = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = null }) { Text("Cancel") }
            },
        )
    }

    fixSessionTarget?.let { issue ->
        FixSessionDialog(
            issue = issue,
            fixLoading = state.fixLoading,
            onDismiss = { fixSessionTarget = null },
            onNewSession = {
                fixSessionTarget = null
                viewModel.fixSingleIssue(issue)
            },
            onResumeSession = { sessionId ->
                fixSessionTarget = null
                viewModel.fixSingleIssue(issue, sessionId)
            },
        )
    }

    state.batchFixTarget?.let { target ->
        BatchFixSessionDialog(
            issues = target.issues,
            sessionIds = target.sessionIds,
            fixLoading = state.fixLoading,
            onDismiss = { viewModel.dismissBatchFixDialog() },
            onNewSession = { viewModel.executeBatchFix(target.issues) },
            onResumeSession = { sessionId -> viewModel.executeBatchFix(target.issues, sessionId) },
        )
    }

    if (state.showSameVersionDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissSameVersionDialog() },
            title = { Text("Already up to date") },
            text = { Text("The installed version is the same as the latest build. Reinstall anyway?") },
            confirmButton = {
                TextButton(onClick = { viewModel.installFixedVersion(force = true) }) {
                    Text("Reinstall")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissSameVersionDialog() }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (state.showUpdateDetails) {
        UpdateDetailsSheet(
            state = state,
            versionName = versionName ?: "",
            onDismiss = { viewModel.dismissUpdateDetails() },
            onBuild = { viewModel.buildApp() },
            onCleanBuild = { viewModel.cleanBuildApp() },
            onInstall = { viewModel.installFixedVersion() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateDetailsSheet(
    state: FeedbackIssuesUiState,
    versionName: String,
    onDismiss: () -> Unit,
    onBuild: () -> Unit,
    onCleanBuild: () -> Unit,
    onInstall: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val orange = Color(0xFFFF9800)
    val green = Color(0xFF4CAF50)
    val dimColor = Color(0xFFAAAAAA)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp),
        ) {
            Text(
                text = "Update Details",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(16.dp))

            // Installed version
            VersionRow(
                label = "Installed",
                version = versionName,
                commit = state.installedCommit,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(modifier = Modifier.height(8.dp))

            // Code (git) version
            val gitMatchesInstalled = state.serverGitCommit != null && state.installedCommit != null && state.serverGitCommit == state.installedCommit
            VersionRow(
                label = "Code (git)",
                version = if (state.newVersion != null && state.needsBuild) "v${state.newVersion}" else null,
                commit = state.serverGitCommit,
                color = if (gitMatchesInstalled) green else orange,
            )
            Spacer(modifier = Modifier.height(8.dp))

            // Built APK version
            val apkMatchesInstalled = state.serverApkCommit != null && state.installedCommit != null && state.serverApkCommit == state.installedCommit
            VersionRow(
                label = "Built APK",
                version = if (state.newVersion != null && state.hasUpdate) "v${state.newVersion}" else null,
                commit = state.serverApkCommit,
                color = if (apkMatchesInstalled) green else if (state.hasUpdate) orange else dimColor,
            )

            if (state.flVersion != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Feedback Lib",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(90.dp),
                    )
                    Text(
                        text = "FL${state.flVersion}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (state.flStale) orange else green,
                    )
                    if (state.flStale && state.newFlVersion != null) {
                        Text(
                            text = " → FL${state.newFlVersion}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = orange,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            // Step 1: Build
            val buildDone = !state.needsBuild && !state.buildLoading
            ActionStep(
                step = 1,
                title = "Build APK",
                description = when {
                    state.buildLoading -> "Building…"
                    state.needsBuild && state.newVersion != null -> "New code available → v${state.newVersion}"
                    state.needsBuild -> "Code and APK are out of sync"
                    else -> "APK is up to date with code"
                },
                done = buildDone,
                loading = state.buildLoading,
                actionLabel = if (state.buildFailed) "Clean & Rebuild" else "Build",
                showAction = state.needsBuild && !state.buildLoading,
                onAction = if (state.buildFailed) onCleanBuild else onBuild,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Step 2: Install
            val installDone = !state.hasUpdate && !state.installLoading && !state.needsBuild
            ActionStep(
                step = 2,
                title = "Install on device",
                description = when {
                    state.installLoading -> "Installing…"
                    state.needsBuild -> "Build first, then install"
                    state.hasUpdate && state.newVersion != null -> "v${state.newVersion} ready to install"
                    state.hasUpdate -> "New APK ready to install"
                    else -> "Device is up to date"
                },
                done = installDone,
                loading = state.installLoading,
                actionLabel = "Install",
                showAction = state.hasUpdate && !state.needsBuild && !state.installLoading,
                onAction = onInstall,
            )
        }
    }
}

@Composable
private fun VersionRow(
    label: String,
    version: String?,
    commit: String?,
    color: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(90.dp),
        )
        if (version != null) {
            Text(
                text = version,
                style = MaterialTheme.typography.bodyMedium,
                color = color,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.width(6.dp))
        }
        if (commit != null) {
            Text(
                text = "(${commit.take(8)})",
                style = MaterialTheme.typography.bodySmall,
                color = color.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun ActionStep(
    step: Int,
    title: String,
    description: String,
    done: Boolean,
    loading: Boolean,
    actionLabel: String,
    showAction: Boolean,
    onAction: () -> Unit,
) {
    val green = Color(0xFF4CAF50)
    val orange = Color(0xFFFF9800)

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(
                    when {
                        done -> green.copy(alpha = 0.15f)
                        loading -> orange.copy(alpha = 0.15f)
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (done) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = green,
                    modifier = Modifier.size(18.dp),
                )
            } else if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = orange,
                )
            } else {
                Text(
                    text = step.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (showAction) {
            Spacer(modifier = Modifier.width(8.dp))
            Button(
                onClick = onAction,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                ),
                modifier = Modifier.height(36.dp),
            ) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun IssueCard(
    issue: Issue,
    expanded: Boolean,
    selected: Boolean,
    actionLoading: Boolean,
    fixLoading: Boolean,
    onToggleExpand: () -> Unit,
    onToggleSelect: () -> Unit,
    onClose: () -> Unit,
    onDelete: () -> Unit,
    onFix: () -> Unit,
    onMarkFixed: () -> Unit,
    onClearRegression: () -> Unit,
    onResumeClarifier: (() -> Unit)? = null,
) {
    val isClosed = issue.status == "closed"
    val isReview = issue.status == "review"
    val isRegression = issue.status == "regression"
    val isInProgress = issue.status == "in_progress"
    val canSelect = !isClosed && !isReview

    val borderColor = when {
        isRegression -> Color(0xFFB71C1C).copy(alpha = 0.3f)
        isReview -> Color(0xFF4A148C).copy(alpha = 0.3f)
        else -> Color.Transparent
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = when {
                isRegression -> Color(0xFFB71C1C).copy(alpha = 0.08f)
                else -> MaterialTheme.colorScheme.surfaceVariant
            },
        ),
        shape = RoundedCornerShape(12.dp),
        border = if (borderColor != Color.Transparent)
            BorderStroke(1.dp, borderColor) else null,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggleExpand),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (canSelect) {
                    Checkbox(
                        checked = selected,
                        onCheckedChange = { onToggleSelect() },
                        modifier = Modifier.size(32.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                }
                StatusBadge(status = issue.status)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "#${issue.issueNumber}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelMedium,
                )
                if (issue.labels.any { it != "user-reported" && it != "android" }) {
                    Spacer(modifier = Modifier.width(6.dp))
                    issue.labels
                        .filter { it != "user-reported" && it != "android" }
                        .forEach { label ->
                            Box(
                                modifier = Modifier
                                    .padding(end = 4.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                                    .padding(horizontal = 6.dp, vertical = 1.dp),
                            ) {
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 9.sp,
                                )
                            }
                        }
                }
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = formatDateShort(if (isClosed) issue.updatedAt else issue.createdAt),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = issue.title,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = if (expanded) Int.MAX_VALUE else 2,
            )
            if (expanded) {
                if (issue.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = issue.description,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (!issue.insights.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Fix notes",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = issue.insights,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (actionLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        when {
                            isReview -> {
                                TextButton(onClick = onMarkFixed) {
                                    Icon(
                                        Icons.Filled.CheckCircle,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = Color(0xFF4CAF50),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Fixed", color = Color(0xFF4CAF50))
                                }
                                TextButton(onClick = onClose) {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Close for now")
                                }
                                TextButton(onClick = onResumeClarifier!!) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.Chat,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Resume Clarifier", color = MaterialTheme.colorScheme.error)
                                }
                            }
                            isRegression -> {
                                TextButton(
                                    onClick = onFix,
                                    enabled = !fixLoading,
                                ) {
                                    Icon(
                                        Icons.Filled.Build,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Fix with Claude")
                                }
                                TextButton(onClick = onClearRegression) {
                                    Icon(
                                        Icons.Filled.Shield,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = Color(0xFF4CAF50),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Clear Regression", color = Color(0xFF4CAF50))
                                }
                            }
                            isClosed -> {
                                TextButton(onClick = onResumeClarifier!!) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.Chat,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Resume Clarifier", color = MaterialTheme.colorScheme.error)
                                }
                            }
                            else -> {
                                TextButton(
                                    onClick = onFix,
                                    enabled = !fixLoading && !isInProgress,
                                ) {
                                    Icon(
                                        Icons.Filled.Build,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Fix with Claude")
                                }
                                TextButton(onClick = onClose) { Text("Close") }
                            }
                        }
                        IconButton(onClick = onDelete) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FixSessionDialog(
    issue: Issue,
    fixLoading: Boolean,
    onDismiss: () -> Unit,
    onNewSession: () -> Unit,
    onResumeSession: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Fix #${issue.issueNumber}") },
        text = {
            Column {
                Text(
                    text = issue.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Previous fix sessions:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                issue.claudeSessionIds?.forEach { sessionId ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = sessionId.take(8) + "...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            onClick = { onResumeSession(sessionId) },
                            enabled = !fixLoading,
                        ) { Text("Resume") }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onNewSession,
                enabled = !fixLoading,
            ) {
                if (fixLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("New session")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun BatchFixSessionDialog(
    issues: List<Issue>,
    sessionIds: List<String>,
    fixLoading: Boolean,
    onDismiss: () -> Unit,
    onNewSession: () -> Unit,
    onResumeSession: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Fix ${issues.size} issues") },
        text = {
            Column {
                issues.forEach { issue ->
                    Text(
                        text = "#${issue.issueNumber}: ${issue.title}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Previous fix sessions:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                sessionIds.forEach { sessionId ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = sessionId.take(8) + "...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            onClick = { onResumeSession(sessionId) },
                            enabled = !fixLoading,
                        ) { Text("Resume") }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onNewSession,
                enabled = !fixLoading,
            ) {
                if (fixLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("New session")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun StatusBadge(status: String) {
    val (label, bg, fg) = when (status) {
        "open" -> Triple("Open", Color(0xFF1B5E20), Color(0xFFA5D6A7))
        "in_progress" -> Triple("In progress", Color(0xFFF57F17), Color(0xFFFFF59D))
        "review" -> Triple("Review", Color(0xFF4A148C), Color(0xFFE1BEE7))
        "closed" -> Triple("Closed", Color(0xFF424242), Color(0xFFBDBDBD))
        "regression" -> Triple("Regression", Color(0xFFB71C1C), Color(0xFFEF9A9A))
        else -> Triple(status, Color(0xFF37474F), Color(0xFFCFD8DC))
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(
            text = label,
            color = fg,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun formatDateShort(dateStr: String): String {
    if (dateStr.length < 10) return dateStr
    return dateStr.substring(0, 10)
}
