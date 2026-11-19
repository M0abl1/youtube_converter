plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The release workflow passes the tag without the "v" (-PytconvVersion=1.4.0).
val appVersion = (findProperty("ytconvVersion") as String?)?.removePrefix("v") ?: "0.0.0-dev"
val appVersionCode = Regex("""^(\d+)\.(\d+)\.(\d+)""").find(appVersion)?.destructured
    ?.let { (major, minor, patch) -> major.toInt() * 10000 + minor.toInt() * 100 + patch.toInt() } ?: 1

// Release signing comes from the environment (GitHub secrets in CI).
val keystorePath: String? = System.getenv("YTCONV_KEYSTORE")

android {
    namespace = "io.github.m0abl1.ytconv"
    compileSdk = 34

    defaultConfig {
        applicationId = "io.github.m0abl1.ytconv"
        minSdk = 26
        targetSdk = 34
        versionCode = appVersionCode.coerceAtLeast(1)
        versionName = appVersion
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("YTCONV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("YTCONV_KEY_ALIAS") ?: "ytconv"
                keyPassword = System.getenv("YTCONV_KEY_PASSWORD") ?: System.getenv("YTCONV_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // gomobile's JNI glue is looked up by name; keep the code as is.
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    // Built by: gomobile bind -javapkg io.github.m0abl1 -o app/libs/ytcore.aar ./mobile/ytcore
    implementation(files("libs/ytcore.aar"))
    implementation("androidx.core:core-ktx:1.13.1")
}
