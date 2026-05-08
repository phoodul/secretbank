package app.secretbank.jetbrains

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

class ProjectStartup : ProjectActivity {
    override suspend fun execute(project: Project) {
        val settings = project.service<SecretbankSettings>()
        if (!settings.scanOnProjectOpen) return
        val basePath = project.basePath ?: return

        ApplicationManager.getApplication().executeOnPooledThread {
            project.service<SecretbankService>().scanSupplyChain(basePath)
            // 결과는 SecretbankService.lastScan 에 캐시 — Tool Window 가 열릴 때
            // SupplyChainPanel 이 그것을 picking 함. 토스트는 사용자가 명시적
            // 으로 액션을 트리거하지 않은 부팅 단계라서 표시하지 않는다.
        }
    }
}
