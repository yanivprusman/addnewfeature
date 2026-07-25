package com.automatelinux.feedbacklib.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Visual-only feedback button. It must NOT have any pointer-input/clickable
 * modifier: it is drawn above app content in [FeedbackOverlay], and a
 * hit-testable node here would swallow taps meant for whatever is underneath
 * (e.g. a screen's own FloatingActionButton in the same corner). Long-press
 * detection lives in [FeedbackOverlay], which observes events without
 * blocking them.
 */
@Composable
fun FeedbackFab(
    modifier: Modifier = Modifier,
    containerColor: Color = Color(0xFF1E293B),
    iconTint: Color = Color(0xFFF1F5F9),
) {
    Surface(
        shape = CircleShape,
        color = containerColor,
        modifier = modifier.size(40.dp),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Icon(
                Icons.AutoMirrored.Filled.Chat,
                contentDescription = "Issue Clarifier (long press)",
                tint = iconTint,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
