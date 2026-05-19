package com.automatelinux.feedbacklib.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.automatelinux.feedbacklib.BuildConfig

@Composable
fun VersionSnackbar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var visible by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<@Composable () -> Unit>({}) }

    LaunchedEffect(Unit) {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val currentVersion = packageInfo.versionName ?: return@LaunchedEffect
        val currentFl = BuildConfig.FEEDBACK_LIB_VERSION

        val prefs = context.getSharedPreferences("feedback_lib_version", android.content.Context.MODE_PRIVATE)
        val lastVersion = prefs.getString("last_version", null)
        val lastFl = prefs.getInt("last_fl_version", -1)

        val versionChanged = lastVersion != null && lastVersion != currentVersion
        val flChanged = lastFl != -1 && lastFl != currentFl

        if (versionChanged || flChanged) {
            prefs.edit()
                .putString("last_version", currentVersion)
                .putInt("last_fl_version", currentFl)
                .apply()
            message = { UpdateText(versionChanged, flChanged, currentVersion, currentFl) }
            visible = true
        } else if (lastVersion == null || lastFl == -1) {
            prefs.edit()
                .putString("last_version", currentVersion)
                .putInt("last_fl_version", currentFl)
                .apply()
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
        modifier = modifier,
    ) {
        Surface(
            color = MaterialTheme.colorScheme.inverseSurface,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
                .clickable { visible = false },
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                message()
            }
        }
    }
}

private val green = Color(0xFF4CAF50)
private val orange = Color(0xFFFF9800)

@Composable
private fun UpdateText(versionChanged: Boolean, flChanged: Boolean, version: String, flVersion: Int) {
    Text(
        text = buildAnnotatedString {
            append("Updated ")
            if (versionChanged) {
                withStyle(SpanStyle(color = green, fontWeight = FontWeight.Bold)) {
                    append(version)
                }
            }
            if (versionChanged && flChanged) {
                append(" + ")
            }
            if (flChanged) {
                withStyle(SpanStyle(color = orange, fontWeight = FontWeight.Bold)) {
                    append("FL$flVersion")
                }
            }
        },
        color = MaterialTheme.colorScheme.inverseOnSurface,
        style = MaterialTheme.typography.bodyMedium,
    )
}
