package app.apivault.jetbrains

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.*

class CredentialsPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val listModel = DefaultListModel<ApiVaultService.CredentialMeta>()
    private val list = JBList(listModel)
    private val statusLabel = JBLabel(" ")
    private val searchField = JBTextField().apply {
        emptyText.text = "Filter by issuer / name…"
    }
    private var allCredentials: List<ApiVaultService.CredentialMeta> = emptyList()

    init {
        border = JBUI.Borders.empty(8)

        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            add(JButton("Refresh", AllIcons.Actions.Refresh).apply {
                addActionListener { refresh() }
            })
            add(JButton("Reveal…", AllIcons.Actions.Show).apply {
                addActionListener { revealSelected() }
            })
        }

        searchField.addKeyListener(object : KeyAdapter() {
            override fun keyReleased(e: KeyEvent?) { applyFilter() }
        })

        list.cellRenderer = CredentialRenderer()
        list.selectionMode = ListSelectionModel.SINGLE_SELECTION

        val north = JPanel(BorderLayout(4, 4)).apply {
            add(toolbar, BorderLayout.NORTH)
            add(searchField, BorderLayout.SOUTH)
        }

        add(north, BorderLayout.NORTH)
        add(JBScrollPane(list), BorderLayout.CENTER)
        add(statusLabel, BorderLayout.SOUTH)

        refresh()
    }

    fun refresh() {
        statusLabel.text = "Loading…"
        ApplicationManager.getApplication().executeOnPooledThread {
            val svc = project.service<ApiVaultService>()
            val creds = svc.listCredentials()
            ApplicationManager.getApplication().invokeLater {
                allCredentials = creds
                applyFilter()
                statusLabel.text = if (creds.isEmpty()) {
                    "No credentials. Is the apivault CLI on your PATH?"
                } else {
                    "${creds.size} credential(s)"
                }
            }
        }
    }

    private fun applyFilter() {
        val q = searchField.text?.trim()?.lowercase().orEmpty()
        listModel.clear()
        val filtered = if (q.isEmpty()) allCredentials else allCredentials.filter {
            it.name.lowercase().contains(q) ||
                it.issuer.lowercase().contains(q) ||
                (it.env ?: "").lowercase().contains(q)
        }
        filtered.forEach { listModel.addElement(it) }
    }

    private fun revealSelected() {
        val sel = list.selectedValue ?: run {
            statusLabel.text = "Select a credential first."
            return
        }
        val passphrase = JOptionPane.showInputDialog(
            this,
            "Master passphrase for ${sel.name}:",
            "API Vault — Reveal",
            JOptionPane.QUESTION_MESSAGE
        ) ?: return

        statusLabel.text = "Revealing…"
        ApplicationManager.getApplication().executeOnPooledThread {
            val svc = project.service<ApiVaultService>()
            val value = svc.revealCredential(sel.id, passphrase.toCharArray())
            ApplicationManager.getApplication().invokeLater {
                if (value == null) {
                    statusLabel.text = "Reveal failed."
                    return@invokeLater
                }
                java.awt.Toolkit.getDefaultToolkit().systemClipboard
                    .setContents(java.awt.datatransfer.StringSelection(value), null)
                statusLabel.text = "Copied to clipboard. Auto-clear in 30s."
                ApplicationManager.getApplication().executeOnPooledThread {
                    Thread.sleep(30_000)
                    java.awt.Toolkit.getDefaultToolkit().systemClipboard
                        .setContents(java.awt.datatransfer.StringSelection(""), null)
                }
            }
        }
    }

    private class CredentialRenderer : DefaultListCellRenderer() {
        override fun getListCellRendererComponent(
            list: JList<*>?, value: Any?, index: Int, isSelected: Boolean, cellHasFocus: Boolean
        ): java.awt.Component {
            val c = super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
            if (value is ApiVaultService.CredentialMeta) {
                val envBadge = value.env?.let { " [$it]" } ?: ""
                val statusBadge = value.status?.takeIf { it != "active" }?.let { " · $it" } ?: ""
                text = "${value.issuer} / ${value.name}$envBadge$statusBadge"
                icon = AllIcons.Nodes.SecurityRole
            }
            return c
        }
    }
}
