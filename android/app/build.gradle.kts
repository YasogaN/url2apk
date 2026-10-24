import org.gradle.testing.jacoco.plugins.JacocoTaskExtension
import org.gradle.testing.jacoco.tasks.JacocoCoverageVerification
import org.gradle.testing.jacoco.tasks.JacocoReport

plugins {
    id("com.android.application")
    jacoco
}

android {
    namespace = "com.urltoapk.shell"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.urltoapk.a0000000000000000000"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = false
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
}

jacoco {
    toolVersion = "0.8.13"
}

tasks.withType<Test>().configureEach {
    extensions.configure<JacocoTaskExtension> {
        isEnabled = true
    }
    testLogging {
        events("passed", "skipped", "failed")
    }
}

val coverageClasses = files(
    fileTree(layout.buildDirectory) {
        include("**/com/urltoapk/shell/**/*.class")
        exclude(
            "**/R.class",
            "**/R\$*.class",
            "**/BuildConfig.class",
            "**/*Test.class",
            "**/*Test\$*.class",
        )
    }
)

val coverageExecutionData = fileTree(layout.buildDirectory) {
    include("**/*.exec")
}

val jacocoTestReport by tasks.registering(JacocoReport::class) {
    dependsOn("testDebugUnitTest")
    reports {
        xml.required.set(true)
        html.required.set(true)
    }
    executionData.setFrom(coverageExecutionData)
    classDirectories.setFrom(coverageClasses)
    sourceDirectories.setFrom(files("src/main/kotlin", "src/main/java"))
}

val jacocoTestCoverageVerification by tasks.registering(JacocoCoverageVerification::class) {
    dependsOn("testDebugUnitTest")
    executionData.setFrom(coverageExecutionData)
    classDirectories.setFrom(coverageClasses)
    sourceDirectories.setFrom(files("src/main/kotlin", "src/main/java"))
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "1.0".toBigDecimal()
            }
        }
    }
}

tasks.named("check") {
    dependsOn(jacocoTestCoverageVerification)
}
