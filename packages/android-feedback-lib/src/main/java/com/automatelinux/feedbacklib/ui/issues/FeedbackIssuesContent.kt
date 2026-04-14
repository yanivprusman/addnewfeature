package com.automatelinux.feedbacklib.ui.issues

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
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
    isProd: Boolean = false,
) {
    if (isProd) return

    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf<Issue?>(null) }
    var fixSessionTarget by remember { mutableStateOf<Issue?>(null) }
    val selectedCount = state.selectedIds.count { id ->
        state.issues.any { it.issueNumber == id && it.status != "closed" }
    }

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.refreshing,
        onRefresh = { viewModel.refresh() },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Issues") },
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
                                onReopen = { viewModel.reopenIssue(issue.issueNumber) },
                                onDelete = { confirmDelete = issue },
                                onFix = {
                                    val sessions = issue.claudeSessionIds
                                    if (!sessions.isNullOrEmpty()) {
                                        fixSessionTarget = issue
                                    } else {
                                        viewModel.fixSingleIssue(issue)
                                    }
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
    onReopen: () -> Unit,
    onDelete: () -> Unit,
    onFix: () -> Unit,
) {
    val canFix = issue.status == "open" || issue.status == "regression"
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggleExpand),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (canFix) {
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
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = formatDateShort(if (issue.status == "closed") issue.updatedAt else issue.createdAt),
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
                        if (canFix) {
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
                        }
                        IconButton(onClick = onDelete) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (issue.status == "closed") {
                            TextButton(onClick = onReopen) { Text("Reopen") }
                        } else {
                            TextButton(onClick = onClose) { Text("Close") }
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
