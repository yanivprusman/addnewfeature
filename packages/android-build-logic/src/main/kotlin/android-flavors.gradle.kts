import com.android.build.api.dsl.ApplicationExtension

plugins {
    id("com.android.application")
}

android {
    flavorDimensions += "mode"
    productFlavors {
        create("dev") {
            dimension = "mode"
            applicationIdSuffix = ".dev"
            buildConfigField("boolean", "FEEDBACK_ENABLED", "true")
            manifestPlaceholders["appNameSuffix"] = " Dev"
        }
        create("prod") {
            dimension = "mode"
            buildConfigField("boolean", "FEEDBACK_ENABLED", "false")
            manifestPlaceholders["appNameSuffix"] = " Prod"
        }
    }
    buildFeatures {
        buildConfig = true
    }
}

afterEvaluate {
    val projectPath = rootProject.projectDir.absolutePath
    if (projectPath.contains("/dev/")) {
        tasks.matching { it.name.contains("Prod") }.configureEach {
            doFirst {
                throw GradleException("Prod flavor build blocked: project is under a dev worktree ($projectPath). Use deployToProd for production builds.")
            }
        }
    }
}
