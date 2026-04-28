package app.apivault.jetbrains

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.event.MouseEvent
import javax.swing.Icon

class ApiVaultStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "app.api-vault.jetbrains.statusBar"
    override fun getDisplayName(): String = "API Vault"
    override fun isAvailable(project: Project): Boolean = true
    override fun createWidget(project: Project): StatusBarWidget = ApiVaultStatusBarWidget(project)
    override fun disposeWidget(widget: StatusBarWidget) { widget.dispose() }
    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

class ApiVaultStatusBarWidget(private val project: Project) : StatusBarWidget,
    StatusBarWidget.IconPresentation {

    override fun ID(): String = "app.api-vault.jetbrains.statusBar"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this
    override fun install(statusBar: StatusBar) {}
    override fun dispose() {}
    override fun getIcon(): Icon = AllIcons.Actions.Show
    override fun getTooltipText(): String = "API Vault — click to list credentials"

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
        val action = ActionManager.getInstance().getAction("app.api-vault.jetbrains.list") ?: return@Consumer
        ActionManager.getInstance().tryToExecute(action, it, null, "ApiVaultStatusBar", true)
    }
}
