package com.automatelinux.feedbacklib.ui

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull

@Composable
fun FeedbackOverlay(
    modifier: Modifier = Modifier,
    onOpenFeedback: (() -> Unit)? = null,
    showFab: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val context = LocalContext.current
    var overlayCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var fabCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }

    // The fab is drawn on top of app content (often right over a screen's own
    // FloatingActionButton), so it must not be hit-testable — a pointerInput on
    // the fab itself would steal every tap that lands on it. Instead the fab is
    // visual-only and the long-press is detected here on the overlay Box: events
    // are only observed (Final pass, after content has seen them) and nothing is
    // consumed unless a long press actually fires.
    fun fabBounds(): Rect? {
        val overlay = overlayCoords ?: return null
        val fab = fabCoords ?: return null
        if (!overlay.isAttached || !fab.isAttached) return null
        return overlay.localBoundingBoxOf(fab, clipBounds = false)
    }

    Box(
        modifier = modifier
            .onGloballyPositioned { overlayCoords = it }
            .pointerInput(showFab) {
                if (!showFab) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Final)
                    val bounds = fabBounds() ?: return@awaitEachGesture
                    if (!bounds.contains(down.position)) return@awaitEachGesture
                    val longPressed = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                        var cancelled = false
                        while (!cancelled) {
                            val event = awaitPointerEvent(PointerEventPass.Final)
                            val change = event.changes.firstOrNull { it.id == down.id }
                            if (change == null ||
                                change.changedToUpIgnoreConsumed() ||
                                change.isConsumed ||
                                !bounds.contains(change.position)
                            ) {
                                cancelled = true
                            }
                        }
                        false // released, cancelled, or dragged away before the timeout
                    } ?: true // timed out with the finger still held on the fab
                    if (longPressed) {
                        if (onOpenFeedback != null) onOpenFeedback() else launchFeedbackChat(context)
                        // Eat the rest of the gesture so whatever is underneath
                        // (e.g. a pressed FloatingActionButton) cancels instead of
                        // also firing a click when the finger lifts.
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            event.changes.forEach { it.consume() }
                            if (event.changes.none { it.pressed }) break
                        }
                    }
                }
            },
    ) {
        content()
        if (showFab) {
            VersionSnackbar(
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
        if (showFab) {
            FeedbackFab(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 12.dp, bottom = 16.dp)
                    .alpha(0.2f)
                    .onGloballyPositioned { fabCoords = it },
            )
        }
    }
}

private fun launchFeedbackChat(context: Context) {
    try {
        val activities = context.packageManager
            .getPackageInfo(context.packageName, PackageManager.GET_ACTIVITIES)
            .activities ?: return
        val feedbackActivity = activities.firstOrNull {
            it.name.endsWith("FeedbackChatActivity")
        } ?: return
        context.startActivity(Intent().apply {
            component = ComponentName(context.packageName, feedbackActivity.name)
        })
    } catch (_: Exception) { }
}
