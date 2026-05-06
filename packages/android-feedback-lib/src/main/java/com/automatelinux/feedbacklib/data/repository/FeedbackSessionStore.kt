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
}
