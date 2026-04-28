package app.apivault.jetbrains

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class ApiVaultToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val factory = ContentFactory.getInstance()
        toolWindow.contentManager.addContent(
            factory.createContent(CredentialsPanel(project), "Credentials", false)
        )
        toolWindow.contentManager.addContent(
            factory.createContent(SupplyChainPanel(project), "Supply chain", false)
        )
        toolWindow.contentManager.addContent(
            factory.createContent(SettingsPanel(project), "Settings", false)
        )
    }

    override fun shouldBeAvailable(project: Project): Boolean = true
}
