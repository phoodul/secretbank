plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.4.10"
    id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion")
        )
        // NOTE: `com.intellij.modules.platform` 은 플러그인이 아니라 플랫폼 **모듈**이라
        // bundledPlugin() 으로 해석되지 않는다 (2026-08-04 CI 최초 실행에서 발각:
        // "Could not find bundled plugin with ID: 'com.intellij.modules.platform'").
        // 코어 모듈이라 명시할 필요도 없으므로 제거한다. CI 커버리지가 없던 탓에
        // 이 오류가 드러나지 않은 채로 남아 있었다.
        bundledPlugin("org.jetbrains.plugins.terminal")
        // JCEF (Chromium Embedded Framework) is part of the platform; no extra
        // dependency needed beyond the core. Listed here for clarity.
        instrumentationTools()
    }
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.22.1")

    testImplementation("org.junit.jupiter:junit-jupiter:6.1.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

intellijPlatform {
    pluginConfiguration {
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = providers.gradleProperty("pluginUntilBuild")
        }
    }
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
    }
    pluginVerification {
        ides {
            recommended()
        }
    }
}

kotlin {
    jvmToolchain(17)
}

tasks {
    test {
        useJUnitPlatform()
    }
    wrapper {
        // IntelliJ Platform Gradle Plugin 2.18+ 는 Gradle 9.0 이상을 요구하고,
        // Gradle 9 는 Kotlin Gradle Plugin 2.x 를 요구한다. 세 버전은 한 세트로만
        // 정합하므로 개별로 올리면 반드시 깨진다 (2026-08-04 CI 에서 확인:
        // "IntelliJ Platform Gradle Plugin requires Gradle 9.0.0 and higher").
        gradleVersion = "9.6.1"
    }
}
