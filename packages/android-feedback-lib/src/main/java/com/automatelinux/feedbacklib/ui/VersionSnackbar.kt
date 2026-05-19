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

private val orange = Color(0xFFFF9800)

@Composable
fun VersionSnackbar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var visible by remember { mutableStateOf(false) }
    var appVersion by remember { mutableStateOf("") }
    var flVersion by remember { mutableStateOf(0) }
    var flUpgraded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val currentFl = BuildConfig.FEEDBACK_LIB_VERSION
        flVersion = currentFl

        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        appVersion = packageInfo.versionName ?: ""

        val prefs = context.getSharedPreferences("feedback_lib_version", android.content.Context.MODE_PRIVATE)
        val lastFl = prefs.getInt("last_fl_version", -1)

        flUpgraded = lastFl != -1 && lastFl != currentFl

        if (lastFl != currentFl) {
            prefs.edit().putInt("last_fl_version", currentFl).apply()
        }
        prefs.edit().putString("last_version", appVersion).apply()

        visible = true
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
            val defaultColor = MaterialTheme.colorScheme.inverseOnSurface
            Text(
                text = buildAnnotatedString {
                    append("$appVersion · ")
                    if (flUpgraded) {
                        withStyle(SpanStyle(color = orange, fontWeight = FontWeight.Bold)) {
                            append("FL$flVersion")
                        }
                    } else {
                        append("FL$flVersion")
                    }
                },
                color = defaultColor,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
