package com.automatelinux.feedbacklib.ui

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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.automatelinux.feedbacklib.BuildConfig

private val orange = Color(0xFFFF9800)

@Composable
fun VersionSnackbar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var flVersion by remember { mutableIntStateOf(0) }
    var flUpgraded by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val currentFl = BuildConfig.FEEDBACK_LIB_VERSION
        flVersion = currentFl

        val prefs = context.getSharedPreferences("feedback_lib_version", android.content.Context.MODE_PRIVATE)
        val lastFl = prefs.getInt("last_fl_version", -1)

        flUpgraded = lastFl != -1 && lastFl != currentFl

        if (lastFl != currentFl) {
            prefs.edit().putInt("last_fl_version", currentFl).apply()
        }

        val currentVersion = context.packageManager.getPackageInfo(context.packageName, 0).versionName
        if (currentVersion != null) {
            prefs.edit().putString("last_version", currentVersion).apply()
        }

        ready = true
    }

    if (!ready) return

    Surface(
        color = MaterialTheme.colorScheme.inverseSurface,
        shape = RoundedCornerShape(8.dp),
        modifier = modifier
            .fillMaxWidth()
            .padding(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "FL$flVersion",
                color = if (flUpgraded) orange else MaterialTheme.colorScheme.inverseOnSurface,
                fontWeight = if (flUpgraded) FontWeight.Bold else FontWeight.Normal,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
