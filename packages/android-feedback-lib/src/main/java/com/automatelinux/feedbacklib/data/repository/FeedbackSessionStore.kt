package com.automatelinux.feedbacklib.data.repository

import android.content.Context
import com.automatelinux.feedbacklib.FeedbackConfig
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

data class PersistedMessage(
    val role: String,
    val text: String,
    val staleIssues: List<com.automatelinux.feedbacklib.data.model.FeedbackIssue>? = null,
)

data class PersistedSession(
    val sessionId: String,
    val tmuxSession: String?,
    val messages: List<PersistedMessage>,
)

@Singleton
class FeedbackSessionStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val config: FeedbackConfig,
) {
    private val prefs by lazy {
        context.getSharedPreferences("feedback_sessions", Context.MODE_PRIVATE)
    }
    private val gson = Gson()
    private val key get() = "session_${config.appName}"

    fun save(session: PersistedSession) {
        prefs.edit().putString(key, gson.toJson(session)).apply()
    }

    fun saveSync(session: PersistedSession) {
        prefs.edit().putString(key, gson.toJson(session)).commit()
    }

    fun load(): PersistedSession? {
        val json = prefs.getString(key, null) ?: return null
        return try {
            gson.fromJson(json, PersistedSession::class.java)
        } catch (_: Exception) {
            clear()
            null
        }
    }

    fun clear() {
        prefs.edit().remove(key).commit()
    }

    fun markInstallStarted() {
        prefs.edit().putLong("install_started_${config.appName}", System.currentTimeMillis()).apply()
    }

    fun clearInstallStarted() {
        prefs.edit().remove("install_started_${config.appName}").apply()
    }

    fun isInstallInProgress(): Boolean {
        val ts = prefs.getLong("install_started_${config.appName}", 0)
        if (ts == 0L) return false
        val elapsed = System.currentTimeMillis() - ts
        if (elapsed > 5 * 60 * 1000) {
            clearInstallStarted()
            return false
        }
        return true
    }
}
