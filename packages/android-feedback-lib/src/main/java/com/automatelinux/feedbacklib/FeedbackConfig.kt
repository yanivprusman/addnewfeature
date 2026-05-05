package com.automatelinux.feedbacklib

data class FeedbackConfig(
    val appName: String,
    val isProd: Boolean = false,
    val title: String = "Issue Clarifier",
    val greeting: String = "Hi! Describe your issue or idea and I'll help you create a clear report.",
    val inputPlaceholder: String = "Describe your issue or idea...",
    val directTitlePlaceholder: String = "Issue title",
    val directDescPlaceholder: String = "Description (optional)",
    val currentScreenProvider: (() -> String?)? = null,
    val platformContextProvider: (() -> String?)? = null,
)
