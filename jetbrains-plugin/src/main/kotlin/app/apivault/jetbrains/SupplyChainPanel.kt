package app.apivault.jetbrains

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.FlowLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer

class SupplyChainPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val tableModel = AdvisoryTableModel()
    private val table = JBTable(tableModel).apply {
        autoCreateRowSorter = true
        setShowGrid(false)
        rowHeight = 22
        getColumnModel().getColumn(0).preferredWidth = 80   // severity
        getColumnModel().getColumn(1).preferredWidth = 70   // ecosystem
        getColumnModel().getColumn(2).preferredWidth = 160  // package
        getColumnModel().getColumn(3).preferredWidth = 80   // version
        getColumnModel().getColumn(4).preferredWidth = 360  // summary
        getColumnModel().getColumn(0).cellRenderer = SeverityRenderer()
    }
    private val statusLabel = JBLabel(" ")

    init {
        border = JBUI.Borders.empty(8)

        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            add(JButton("Run scan", AllIcons.General.InspectionsEye).apply {
                addActionListener { runScan() }
            })
            add(JButton("Open manifest", AllIcons.Actions.OpenNewTab).apply {
                addActionListener { openSelectedManifest() }
            })
        }

        table.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) openSelectedManifest()
            }
        })

        add(toolbar, BorderLayout.NORTH)
        add(JBScrollPane(table), BorderLayout.CENTER)
        add(statusLabel, BorderLayout.SOUTH)

        // Show whatever the cached scan has, if any.
        renderFromCache()
    }

    private fun renderFromCache() {
        val cached = project.service<ApiVaultService>().lastScan
        if (cached != null) {
            tableModel.setRows(cached.matched)
            statusLabel.text = "${cached.advisoriesMatched} advisor(ies) · ${cached.packagesSeen} package(s) · ${cached.manifestsFound} manifest(s)"
        } else {
            statusLabel.text = "No scan yet. Click Run scan."
        }
    }

    private fun runScan() {
        val basePath = project.basePath ?: run {
            statusLabel.text = "No project root."
            return
        }
        statusLabel.text = "Scanning… (depending on dep count this can take 10–60s)"
        ApplicationManager.getApplication().executeOnPooledThread {
            val rep = project.service<ApiVaultService>().scanSupplyChain(basePath)
            ApplicationManager.getApplication().invokeLater {
                if (rep == null) {
                    statusLabel.text = "Scan failed. CLI not found or vault not initialized."
                    return@invokeLater
                }
                tableModel.setRows(rep.matched)
                statusLabel.text = "${rep.advisoriesMatched} advisor(ies) · ${rep.packagesSeen} package(s) · ${rep.manifestsFound} manifest(s)"
            }
        }
    }

    private fun openSelectedManifest() {
        val viewRow = table.selectedRow
        if (viewRow < 0) return
        val modelRow = table.convertRowIndexToModel(viewRow)
        val advisory = tableModel.getRow(modelRow) ?: return
        val basePath = project.basePath ?: return
        val manifestPath = "$basePath/${advisory.manifestPath}"
        val vf = LocalFileSystem.getInstance().findFileByPath(manifestPath) ?: return
        FileEditorManager.getInstance(project).openFile(vf, true)
    }

    private class AdvisoryTableModel : AbstractTableModel() {
        private val cols = arrayOf("Severity", "Eco", "Package", "Version", "Summary")
        private var rows: List<ApiVaultService.MatchedAdvisory> = emptyList()

        fun setRows(r: List<ApiVaultService.MatchedAdvisory>) {
            rows = r.sortedByDescending { rank(it.severity) }
            fireTableDataChanged()
        }
        fun getRow(i: Int): ApiVaultService.MatchedAdvisory? = rows.getOrNull(i)

        override fun getRowCount() = rows.size
        override fun getColumnCount() = cols.size
        override fun getColumnName(column: Int) = cols[column]
        override fun getValueAt(row: Int, col: Int): Any {
            val r = rows[row]
            return when (col) {
                0 -> r.severity.uppercase()
                1 -> r.ecosystem
                2 -> r.packageName
                3 -> r.version
                4 -> "${r.summary} (${r.sourceId})"
                else -> ""
            }
        }
        private fun rank(s: String) = when (s.lowercase()) {
            "critical" -> 4; "high" -> 3; "medium" -> 2; "low" -> 1; else -> 0
        }
    }

    private class SeverityRenderer : DefaultTableCellRenderer() {
        override fun getTableCellRendererComponent(
            table: JTable?, value: Any?, isSelected: Boolean,
            hasFocus: Boolean, row: Int, column: Int
        ): Component {
            val c = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
            if (!isSelected && value is String) {
                background = when (value.uppercase()) {
                    "CRITICAL" -> Color(190, 0, 0)
                    "HIGH" -> Color(220, 90, 0)
                    "MEDIUM" -> Color(180, 140, 0)
                    "LOW" -> Color(80, 120, 80)
                    else -> table?.background
                }
                foreground = Color.WHITE
            } else if (table != null) {
                background = table.background
                foreground = table.foreground
            }
            return c
        }
    }
}
