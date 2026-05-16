package com.automatelinux.feedbacklib.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull

@Composable
fun FeedbackFab(
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier,
    containerColor: Color = Color(0xFF1E293B),
    iconTint: Color = Color(0xFFF1F5F9),
) {
    Surface(
        shape = CircleShape,
        color = containerColor,
        modifier = modifier
            .size(40.dp)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val longPressTimeout = viewConfiguration.longPressTimeoutMillis
                    val up = withTimeoutOrNull(longPressTimeout) {
                        waitForUpOrCancellation()
                    }
                    if (up == null) {
                        down.consume()
                        onLongPress()
                    }
                }
            },
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
