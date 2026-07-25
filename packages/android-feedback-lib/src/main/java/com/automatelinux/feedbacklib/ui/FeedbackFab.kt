package com.automatelinux.feedbacklib.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Visual-only feedback button. It must be COMPLETELY transparent to pointer
 * hit-testing: it is drawn above app content in [FeedbackOverlay], and any
 * hit-testable node here swallows taps meant for whatever is underneath
 * (e.g. a screen's own FloatingActionButton in the same corner). That rules
 * out not just clickable/pointerInput but also material Surface, whose
 * non-clickable overload adds a hidden `pointerInput(Unit) {}` specifically
 * to block touches behind it — hence the plain Box + background here.
 * Long-press detection lives in [FeedbackOverlay], which observes events
 * without blocking them.
 */
@Composable
fun FeedbackFab(
    modifier: Modifier = Modifier,
    containerColor: Color = Color(0xFF1E293B),
    iconTint: Color = Color(0xFFF1F5F9),
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(40.dp)
            .background(containerColor, CircleShape),
    ) {
        Icon(
            Icons.AutoMirrored.Filled.Chat,
            contentDescription = "Issue Clarifier (long press)",
            tint = iconTint,
            modifier = Modifier.size(20.dp),
        )
    }
}
