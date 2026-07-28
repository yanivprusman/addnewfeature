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
    val inputText: String? = null,
    val directTitle: String? = null,
    val directDescription: String? = null,
    val pendingRequestId: String? = null,
    val clarifierSessionId: String? = null,
    // The still-submittable issue cards. These live outside `messages` in the
    // UI state, so without their own field they were dropped on every save and
    // the restored chat showed "Does this look right?" with nothing to confirm.
    val proposedIssues: List<com.automatelinux.feedbacklib.data.model.FeedbackIssue>? = null,
)

data class SessionSummary(
    val id: String,
    val preview: String,
    val messageCount: Int,
    val updatedAt: Long,
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

    // ── Multi-session storage (#66) ─────────────────────────────────────

    private val indexKey get() = "ms_index_${config.appName}"
    private val activeSessionKey get() = "ms_active_${config.appName}"
    private fun multiKey(id: String) = "ms_${config.appName}_$id"

    fun saveMulti(id: String, session: PersistedSession) {
        prefs.edit().putString(multiKey(id), gson.toJson(session)).apply()
    }

    fun saveMultiSync(id: String, session: PersistedSession) {
        prefs.edit().putString(multiKey(id), gson.toJson(session)).commit()
    }

    fun loadMulti(id: String): PersistedSession? {
        val json = prefs.getString(multiKey(id), null) ?: return null
        return try {
            gson.fromJson(json, PersistedSession::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun removeMulti(id: String) {
        prefs.edit().remove(multiKey(id)).commit()
        val sessions = getSessions().filter { it.id != id }
        saveSessions(sessions)
        if (getActiveSessionId() == id) setActiveSessionId(null)
    }

    fun getSessions(): List<SessionSummary> {
        val json = prefs.getString(indexKey, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<SessionSummary>>() {}.type
            gson.fromJson(json, type)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun saveSessions(sessions: List<SessionSummary>) {
        prefs.edit().putString(indexKey, gson.toJson(sessions)).apply()
    }

    fun getActiveSessionId(): String? = prefs.getString(activeSessionKey, null)

    fun setActiveSessionId(id: String?) {
        if (id != null) prefs.edit().putString(activeSessionKey, id).apply()
        else prefs.edit().remove(activeSessionKey).apply()
    }

    fun migrateIfNeeded() {
        if (prefs.contains(indexKey)) return
        val old = load() ?: return
        val id = java.util.UUID.randomUUID().toString()
        saveMulti(id, old)
        val preview = old.messages.firstOrNull { it.role == "user" }?.text?.take(50) ?: "Conversation"
        saveSessions(listOf(SessionSummary(id, preview, old.messages.size, System.currentTimeMillis())))
        setActiveSessionId(id)
        clear()
    }

    fun markInstallStarted() {
        prefs.edit().putLong("install_started_${config.appName}", System.currentTimeMillis()).commit()
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

    fun saveBuiltFlCommit(commit: String) {
        prefs.edit().putString("built_fl_commit_${config.appName}", commit).apply()
    }

    fun getBuiltFlCommit(): String? {
        return prefs.getString("built_fl_commit_${config.appName}", null)
    }

    fun clearBuiltFlCommit() {
        prefs.edit().remove("built_fl_commit_${config.appName}").apply()
    }

    fun setAutoInstallTracked(issueNumbers: Set<Int>) {
        prefs.edit().putStringSet(
            "auto_install_tracked_${config.appName}",
            issueNumbers.map { it.toString() }.toSet(),
        ).apply()
    }

    fun getAutoInstallTracked(): Set<Int> {
        return prefs.getStringSet("auto_install_tracked_${config.appName}", null)
            ?.mapNotNull { it.toIntOrNull() }?.toSet() ?: emptySet()
    }

    fun clearAutoInstallTracked() {
        prefs.edit().remove("auto_install_tracked_${config.appName}").apply()
    }
}
