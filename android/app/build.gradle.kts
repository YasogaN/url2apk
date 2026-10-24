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
    testImplementation("org.mockito:mockito-core:5.14.2")
    testRuntimeOnly("org.jacoco:org.jacoco.agent:0.8.13:runtime")
}

jacoco {
    toolVersion = "0.8.13"
}

val jacocoAntConfiguration = configurations.named("jacocoAnt")

/*
 * Robolectric loads app classes through its own SandboxClassLoader, so a plain
 * JaCoCo agent misses everything exercised by a Robolectric test. Instrument the
 * main classes offline and put them first on the unit-test classpath instead;
 * Robolectric explicitly understands JaCoCo-instrumented constructors.
 */
val instrumentDebugClasses by tasks.registering {
    val inputDir = layout.buildDirectory.dir("intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes")
    val outputDir = layout.buildDirectory.dir("jacoco-offline/classes")
    dependsOn("compileDebugKotlin")
    inputs.dir(inputDir)
    outputs.dir(outputDir)
    doLast {
        val outputRoot = outputDir.get().asFile
        outputRoot.deleteRecursively()
        outputRoot.mkdirs()
        val antClasspath = jacocoAntConfiguration.get().files
        ant.withGroovyBuilder {
            "taskdef"(
                "name" to "jacoco-instrument",
                "classname" to "org.jacoco.ant.InstrumentTask",
            ) {
                "classpath" {
                    antClasspath.forEach { file ->
                        "pathelement"("location" to file.absolutePath)
                    }
                }
            }
            "jacoco-instrument"("destdir" to outputRoot) {
                "fileset"("dir" to inputDir.get().asFile)
            }
        }
    }
}

tasks.withType<Test>().configureEach {
    extensions.configure<JacocoTaskExtension> {
        isEnabled = false
    }
    testLogging {
        events("passed", "skipped", "failed")
    }
    if (name == "testDebugUnitTest") {
        dependsOn(instrumentDebugClasses)
        doFirst {
            val originalClasses = layout.buildDirectory
                .dir("intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes")
                .get()
                .asFile
            classpath = files(layout.buildDirectory.dir("jacoco-offline/classes")) +
                classpath.filter { !it.absolutePath.startsWith(originalClasses.absolutePath) }
            layout.buildDirectory.dir("jacoco").get().asFile.mkdirs()
        }
        systemProperty(
            "jacoco-agent.destfile",
            layout.buildDirectory.file("jacoco/offline.exec").get().asFile.absolutePath,
        )
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
            "**/jacoco-offline/**",
        )
    },
)

val coverageExecutionData = files(layout.buildDirectory.file("jacoco/offline.exec"))

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
    dependsOn("testDebugUnitTest", "jacocoTestReport")
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
