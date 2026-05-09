package com.automatelinux.feedbacklib.ui

import androidx.compose.foundation.clickable
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

@Composable
fun VersionSnackbar(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val currentVersion = packageInfo.versionName ?: return@LaunchedEffect
        val prefs = context.getSharedPreferences("feedback_lib_version", android.content.Context.MODE_PRIVATE)
        val lastVersion = prefs.getString("last_version", null)
        if (lastVersion != currentVersion) {
            prefs.edit().putString("last_version", currentVersion).apply()
            snackbarHostState.showSnackbar(
                message = "Updated to $currentVersion",
                duration = SnackbarDuration.Indefinite,
            )
        }
    }

    SnackbarHost(
        hostState = snackbarHostState,
        modifier = modifier.clickable { snackbarHostState.currentSnackbarData?.dismiss() },
    )
}
