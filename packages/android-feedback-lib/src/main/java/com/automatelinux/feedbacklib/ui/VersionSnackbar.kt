package com.automatelinux.feedbacklib.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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

private val upgradeColor = Color(0xFF4CAF50)

@Composable
fun VersionSnackbar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var visible by remember { mutableStateOf(false) }
    var displayText by remember { mutableStateOf(buildAnnotatedString {}) }

    val defaultColor = MaterialTheme.colorScheme.inverseOnSurface

    LaunchedEffect(Unit) {
        val currentFl = BuildConfig.FEEDBACK_LIB_VERSION
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val currentApp = packageInfo.versionName ?: ""

        val prefs = context.getSharedPreferences("feedback_lib_version", android.content.Context.MODE_PRIVATE)
        val prevFl = prefs.getInt("last_fl_version", -1)
        val prevApp = prefs.getString("last_version", null)

        val appUpgraded = prevApp != null && prevApp != currentApp
        val flUpgraded = prevFl != -1 && prevFl != currentFl

        displayText = buildAnnotatedString {
            if (appUpgraded) {
                withStyle(SpanStyle(color = upgradeColor, fontWeight = FontWeight.Bold)) {
                    append("$prevApp→$currentApp")
                }
            } else {
                append(currentApp)
            }
            append(" · ")
            if (flUpgraded) {
                withStyle(SpanStyle(color = upgradeColor, fontWeight = FontWeight.Bold)) {
                    append("FL$prevFl→FL$currentFl")
                }
            } else {
                append("FL$currentFl")
            }
        }

        if (appUpgraded || flUpgraded) {
            prefs.edit()
                .putString("last_version", currentApp)
                .putInt("last_fl_version", currentFl)
                .apply()
            visible = true
        } else if (prevApp == null) {
            prefs.edit()
                .putString("last_version", currentApp)
                .putInt("last_fl_version", currentFl)
                .apply()
        }
    }

    if (!visible) return

    Surface(
        color = MaterialTheme.colorScheme.inverseSurface,
        shape = RoundedCornerShape(8.dp),
        modifier = modifier
            .fillMaxWidth()
            .padding(12.dp)
            .clickable { visible = false },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = displayText,
                color = defaultColor,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
