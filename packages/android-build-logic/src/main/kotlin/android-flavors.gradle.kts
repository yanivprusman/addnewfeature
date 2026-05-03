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
        }
        create("prod") {
            dimension = "mode"
            buildConfigField("boolean", "FEEDBACK_ENABLED", "false")
        }
    }
    buildFeatures {
        buildConfig = true
    }
}
