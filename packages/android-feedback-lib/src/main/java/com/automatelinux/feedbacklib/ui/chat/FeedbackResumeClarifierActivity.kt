package com.automatelinux.feedbacklib.ui.chat

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import com.automatelinux.feedbacklib.data.model.Issue
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class FeedbackResumeClarifierActivity : ComponentActivity() {

    companion object {
        private const val EXTRA_CLARIFIER_SESSION_ID = "clarifier_session_id"
        private const val EXTRA_ISSUE_NUMBER = "issue_number"
        private const val EXTRA_ISSUE_TITLE = "issue_title"
        private const val EXTRA_ISSUE_DESCRIPTION = "issue_description"
        private const val EXTRA_ISSUE_STATUS = "issue_status"
        private const val EXTRA_ISSUE_INSIGHTS = "issue_insights"

        fun intent(context: Context, issue: Issue): Intent =
            Intent(context, FeedbackResumeClarifierActivity::class.java).apply {
                putExtra(EXTRA_CLARIFIER_SESSION_ID, issue.clarifierSessionId)
                putExtra(EXTRA_ISSUE_NUMBER, issue.issueNumber)
                putExtra(EXTRA_ISSUE_TITLE, issue.title)
                putExtra(EXTRA_ISSUE_DESCRIPTION, issue.description)
                putExtra(EXTRA_ISSUE_STATUS, issue.status)
                putExtra(EXTRA_ISSUE_INSIGHTS, issue.insights)
            }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    val viewModel: FeedbackChatViewModel = hiltViewModel()
                    val clarifierSessionId = intent.getStringExtra(EXTRA_CLARIFIER_SESSION_ID)

                    LaunchedEffect(clarifierSessionId) {
                        if (clarifierSessionId != null) {
                            viewModel.setServerFound(true)
                            viewModel.resumeClarifierSession(
                                clarifierSessionId,
                                Issue(
                                    issueNumber = intent.getIntExtra(EXTRA_ISSUE_NUMBER, -1),
                                    title = intent.getStringExtra(EXTRA_ISSUE_TITLE) ?: "",
                                    description = intent.getStringExtra(EXTRA_ISSUE_DESCRIPTION) ?: "",
                                    status = intent.getStringExtra(EXTRA_ISSUE_STATUS) ?: "",
                                    labels = emptyList(),
                                    createdAt = "",
                                    updatedAt = "",
                                    insights = intent.getStringExtra(EXTRA_ISSUE_INSIGHTS),
                                ),
                            )
                        }
                    }

                    FeedbackChatScreen(
                        viewModel = viewModel,
                        onNavigateBack = { finish() },
                    )
                }
            }
        }
    }
}
