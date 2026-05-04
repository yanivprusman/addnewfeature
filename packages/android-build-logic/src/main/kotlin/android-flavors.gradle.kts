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
