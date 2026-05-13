plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("kotlin-kapt")
    id("com.google.dagger.hilt.android")
}

val feedbackLibRealPath: String = try {
    val source = providers.exec {
        commandLine("findmnt", "-n", "-o", "SOURCE", "--target", projectDir.absolutePath)
    }.standardOutput.asText.get().trim()
    val match = Regex("\\[(.+)]").find(source)
    match?.groupValues?.get(1) ?: projectDir.absolutePath
} catch (_: Exception) {
    projectDir.absolutePath
}

val feedbackLibCommitHash: String = try {
    providers.exec {
        commandLine("git", "-C", feedbackLibRealPath, "rev-parse", "--short", "HEAD")
    }.standardOutput.asText.get().trim()
} catch (_: Exception) { "" }

val feedbackLibCommitCount: Int = try {
    providers.exec {
        commandLine("git", "-C", feedbackLibRealPath, "rev-list", "--count", "HEAD")
    }.standardOutput.asText.get().trim().toInt()
} catch (_: Exception) { 0 }

android {
    namespace = "com.automatelinux.feedbacklib"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
        buildConfigField("String", "FEEDBACK_LIB_COMMIT", "\"$feedbackLibCommitHash\"")
        buildConfigField("int", "FEEDBACK_LIB_VERSION", "$feedbackLibCommitCount")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }
}

dependencies {
    // AndroidX Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")

    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material:material-icons-extended")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.53.1")
    kapt("com.google.dagger:hilt-compiler:2.53.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // Retrofit + GSON
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.google.code.gson:gson:2.10.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}

kapt {
    correctErrorTypes = true
}
