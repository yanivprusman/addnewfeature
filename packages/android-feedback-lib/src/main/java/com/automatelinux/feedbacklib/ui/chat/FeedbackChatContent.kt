package com.automatelinux.feedbacklib.ui.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.model.FeedbackIssue
import com.automatelinux.feedbacklib.data.model.FeedbackSubmitResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedbackChatScreen(
    viewModel: FeedbackChatViewModel = hiltViewModel(),
    config: FeedbackConfig? = null,
    onNavigateBack: () -> Unit,
    onNavigateToIssues: (() -> Unit)? = null,
    isProd: Boolean = false,
) {
    if (isProd) return

    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val title = config?.title ?: "Issue Clarifier"
    val greeting = config?.greeting ?: "Hi! Describe your issue or idea and I'll help you create a clear report."
    val placeholder = config?.inputPlaceholder ?: "Describe your issue or idea..."

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        viewModel.persistOnPause()
    }

    LaunchedEffect(state.messages.size, state.isSending) {
        val totalItems = state.messages.size +
            (if (state.isSending) 1 else 0) +
            (if (state.proposedIssues != null) 1 else 0) +
            (if (state.submitResults != null) 1 else 0)
        if (totalItems > 0) {
            listState.animateScrollToItem(totalItems)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (state.directMode) "New Issue" else title)
                        if (!state.directMode && state.sessionId != null) {
                            Text(
                                "Session active",
                                color = Color(0xFF4CAF50),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::toggleDirectMode) {
                        Icon(
                            if (state.directMode) Icons.AutoMirrored.Filled.Send
                            else Icons.Filled.Create,
                            contentDescription = if (state.directMode) "Use clarifier" else "Write directly",
                        )
                    }
                    if (onNavigateToIssues != null) {
                        IconButton(onClick = onNavigateToIssues) {
                            Icon(Icons.AutoMirrored.Filled.List, contentDescription = "View Issues")
                        }
                    }
                    if (!state.directMode && state.sessionId != null) {
                        IconButton(onClick = {
                            viewModel.closeSession()
                            onNavigateBack()
                        }) {
                            Icon(Icons.Filled.Close, contentDescription = "End Session")
                        }
                    }
                    if (!state.directMode && state.messages.isNotEmpty()) {
                        IconButton(onClick = viewModel::newChat) {
                            Icon(Icons.Filled.Add, contentDescription = "New Chat")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!state.directMode) {
                ChatInputBar(
                    input = state.inputText,
                    onInputChange = viewModel::updateInput,
                    onSend = viewModel::sendMessage,
                    sendEnabled = !state.isSending && state.inputText.isNotBlank(),
                    placeholder = placeholder,
                )
            }
        },
    ) { innerPadding ->
        if (state.directMode) {
            DirectIssueForm(
                title = state.directTitle,
                description = state.directDescription,
                onTitleChange = viewModel::updateDirectTitle,
                onDescriptionChange = viewModel::updateDirectDescription,
                onSubmit = viewModel::submitDirectIssue,
                isLoading = state.directLoading,
                submitResults = state.submitResults,
                onDismissResults = viewModel::dismissSubmitResults,
                onViewIssues = onNavigateToIssues?.let { nav ->
                    {
                        nav()
                        viewModel.dismissSubmitResults()
                    }
                },
                titlePlaceholder = config?.directTitlePlaceholder ?: "Issue title",
                descPlaceholder = config?.directDescPlaceholder ?: "Description (optional)",
                modifier = Modifier.padding(innerPadding),
            )
        } else {
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                // Hook warning banner (#29)
                if (state.hookWarning != null) {
                    Surface(
                        color = Color(0xFFFFF3E0),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = state.hookWarning!!,
                            color = Color(0xFFE65100),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        Spacer(modifier = Modifier.height(4.dp))
                        AssistantBubble(text = greeting)
                    }

                    items(state.messages.size, key = { i -> "${state.messages[i].role}_$i" }) { i ->
                        val msg = state.messages[i]
                        when (msg.role) {
                            "user" -> UserBubble(text = msg.text)
                            "assistant" -> {
                                if (msg.text.isNotBlank()) AssistantBubble(text = msg.text)
                                if (!msg.staleIssues.isNullOrEmpty()) {
                                    StaleIssuesSection(
                                        issues = msg.staleIssues,
                                        onSubmit = viewModel::submitStaleIssue,
                                    )
                                }
                            }
                            "system" -> SystemMessage(text = msg.text)
                        }
                    }

                    if (state.isSending) {
                        item { ThinkingIndicator() }
                    }

                    if (state.proposedIssues != null) {
                        item {
                            IssueCardsSection(
                                issues = state.proposedIssues!!,
                                checked = state.checkedIssues,
                                onToggle = viewModel::toggleIssueChecked,
                                onSubmit = viewModel::submitSelectedIssues,
                                isSubmitting = state.isSubmitting,
                            )
                        }
                    }

                    if (state.submitResults != null) {
                        item {
                            SubmitResultsSection(
                                results = state.submitResults!!,
                                showPrompt = state.showPostSubmitPrompt,
                                onViewIssues = onNavigateToIssues?.let { nav ->
                                    {
                                        viewModel.dismissPostSubmitPrompt()
                                        nav()
                                    }
                                },
                                onDone = {
                                    viewModel.newChat()
                                    onNavigateBack()
                                },
                            )
                        }
                    }

                    if (state.error != null) {
                        item {
                            ErrorMessage(text = state.error!!, onDismiss = viewModel::dismissError)
                        }
                    }

                    item { Spacer(modifier = Modifier.height(8.dp)) }
                }
            }
        }
    }
}

// ── Direct Issue Form (#30) ─────────────────────────────────────────────

@Composable
fun DirectIssueForm(
    title: String,
    description: String,
    onTitleChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onSubmit: () -> Unit,
    isLoading: Boolean,
    submitResults: List<FeedbackSubmitResult>?,
    onDismissResults: () -> Unit,
    onViewIssues: (() -> Unit)?,
    titlePlaceholder: String,
    descPlaceholder: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = title,
            onValueChange = onTitleChange,
            placeholder = { Text(titlePlaceholder) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        )

        OutlinedTextField(
            value = description,
            onValueChange = onDescriptionChange,
            placeholder = { Text(descPlaceholder) },
            minLines = 3,
            maxLines = 8,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        )

        Button(
            onClick = onSubmit,
            enabled = !isLoading && title.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Create Issue")
            }
        }

        if (submitResults != null) {
            SubmitResultsSection(
                results = submitResults,
                showPrompt = true,
                onViewIssues = onViewIssues,
                onDone = onDismissResults,
            )
        }
    }
}

// ── Message Bubbles ──────────────────────────────────────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun UserBubble(text: String) {
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .widthIn(max = 300.dp)
                .combinedClickable(
                    onClick = {},
                    onLongClick = {
                        clipboardManager.setText(AnnotatedString(text))
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                    },
                ),
        ) {
            Text(
                text = text,
                color = MaterialTheme.colorScheme.onPrimary,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(12.dp),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun AssistantBubble(text: String) {
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier
                .widthIn(max = 300.dp)
                .combinedClickable(
                    onClick = {},
                    onLongClick = {
                        clipboardManager.setText(AnnotatedString(text))
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                    },
                ),
        ) {
            Text(
                text = text,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(12.dp),
            )
        }
    }
}

@Composable
fun SystemMessage(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(vertical = 4.dp),
        )
    }
}

// ── Thinking Indicator ───────────────────────────────────────────────────

@Composable
fun ThinkingIndicator() {
    val transition = rememberInfiniteTransition(label = "thinking")
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(3) { index ->
                    val alpha by transition.animateFloat(
                        initialValue = 0.3f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(600, delayMillis = index * 200),
                            repeatMode = RepeatMode.Reverse,
                        ),
                        label = "dot_$index",
                    )
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .alpha(alpha)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurfaceVariant),
                    )
                }
            }
        }
    }
}

// ── Issue Cards Section ──────────────────────────────────────────────────

@Composable
fun IssueCardsSection(
    issues: List<FeedbackIssue>,
    checked: List<Boolean>,
    onToggle: (Int) -> Unit,
    onSubmit: () -> Unit,
    isSubmitting: Boolean,
) {
    val selectedCount = checked.count { it }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Select issues to submit:",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 4.dp),
        )

        issues.forEachIndexed { index, issue ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Checkbox(
                        checked = checked.getOrElse(index) { false },
                        onCheckedChange = { onToggle(index) },
                        colors = CheckboxDefaults.colors(
                            checkedColor = MaterialTheme.colorScheme.primary,
                            uncheckedColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                    Column(modifier = Modifier.weight(1f).padding(top = 8.dp)) {
                        Text(
                            text = issue.title,
                            color = MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (issue.description.isNotBlank()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = issue.description,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 4,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }

        Button(
            onClick = onSubmit,
            enabled = !isSubmitting && selectedCount > 0,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Submit Selected ($selectedCount)")
            }
        }
    }
}

// ── Stale Issues (previously proposed, kept in chat history) ─────────────

@Composable
fun StaleIssuesSection(
    issues: List<FeedbackIssue>,
    onSubmit: (FeedbackIssue) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "Previously suggested:",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.alpha(0.6f),
        )
        issues.forEach { issue ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                ),
                shape = RoundedCornerShape(10.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = issue.title,
                            color = MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (issue.description.isNotBlank()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = issue.description,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(
                        onClick = { onSubmit(issue) },
                        modifier = Modifier.height(32.dp),
                    ) {
                        Text("Submit", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

// ── Submit Results ───────────────────────────────────────────────────────

@Composable
fun SubmitResultsSection(
    results: List<FeedbackSubmitResult>,
    showPrompt: Boolean = false,
    onViewIssues: (() -> Unit)?,
    onDone: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Issues submitted",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )

            results.forEach { result ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (result.success) {
                        Icon(Icons.Filled.CheckCircle, null, tint = Color(0xFF4CAF50), modifier = Modifier.size(16.dp))
                        Text("#${result.issueNumber}: ${result.title}", style = MaterialTheme.typography.bodySmall)
                    } else {
                        Icon(Icons.Filled.Error, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                        Text("${result.title}: ${result.error}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            if (showPrompt) {
                Text(
                    text = "Would you like to view them on the Issues page?",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onViewIssues != null) {
                    TextButton(onClick = onViewIssues) {
                        Text("View Issues")
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                }
                TextButton(onClick = onDone) {
                    Text("Close")
                }
            }
        }
    }
}

// ── Error Message ────────────────────────────────────────────────────────

@Composable
fun ErrorMessage(text: String, onDismiss: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Error, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) {
                Text("OK", fontSize = 12.sp)
            }
        }
    }
}

// ── Chat Input Bar ───────────────────────────────────────────────────────

@Composable
fun ChatInputBar(
    input: String,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    sendEnabled: Boolean,
    placeholder: String = "Describe your issue or idea...",
) {
    Column {
        Divider()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .imePadding()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = onInputChange,
                placeholder = { Text(placeholder) },
                maxLines = 5,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(
                onClick = onSend,
                enabled = sendEnabled,
                modifier = Modifier.size(48.dp).align(Alignment.Bottom),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    tint = if (sendEnabled) MaterialTheme.colorScheme.primary
                           else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
