package com.automatelinux.feedbacklib.ui

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp

@Composable
fun FeedbackOverlay(
    modifier: Modifier = Modifier,
    onOpenFeedback: (() -> Unit)? = null,
    showFab: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(modifier = modifier) {
        content()
        VersionSnackbar(
            modifier = Modifier.align(Alignment.TopCenter),
        )
        if (showFab) {
            val context = LocalContext.current
            FeedbackFab(
                onLongPress = onOpenFeedback ?: { launchFeedbackChat(context) },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 12.dp, bottom = 16.dp)
                    .alpha(0.2f),
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
