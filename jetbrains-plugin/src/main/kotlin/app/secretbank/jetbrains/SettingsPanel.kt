package app.secretbank.jetbrains

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets
import javax.swing.JButton
import javax.swing.JPanel

class SettingsPanel(private val project: Project) : JPanel(GridBagLayout()) {

    private val cliPathField = JBTextField()
    private val scanOnOpenBox = JBCheckBox("Scan supply chain when this project opens")
    private val statusLabel = JBLabel(" ")

    init {
        border = JBUI.Borders.empty(12)
        val s = project.service<SecretbankSettings>()
        cliPathField.text = s.cliPath
        scanOnOpenBox.isSelected = s.scanOnProjectOpen

        val g = GridBagConstraints().apply {
            insets = Insets(6, 6, 6, 6)
            anchor = GridBagConstraints.WEST
        }

        g.gridx = 0; g.gridy = 0; g.gridwidth = 2
        add(JBLabel("<html><b>Secretbank settings</b><br><small>Stored per project.</small></html>"), g)

        g.gridwidth = 1; g.gridy = 1
        add(JBLabel("CLI path:"), g)
        g.gridx = 1; g.fill = GridBagConstraints.HORIZONTAL; g.weightx = 1.0
        add(cliPathField, g)

        g.gridx = 0; g.gridy = 2; g.gridwidth = 2; g.fill = GridBagConstraints.NONE; g.weightx = 0.0
        add(scanOnOpenBox, g)

        g.gridy = 3
        add(
            JBLabel("<html><small>Tip: leave CLI path as <code>Secretbank</code> if it is on your PATH.<br>Get the CLI from <a href='https://secretbank.app/download'>secretbank.app/download</a>.</small></html>"),
            g
        )

        g.gridy = 4; g.fill = GridBagConstraints.NONE
        val saveButton = JButton("Save")
        saveButton.addActionListener {
            s.cliPath = cliPathField.text.trim().ifEmpty { "Secretbank" }
            s.scanOnProjectOpen = scanOnOpenBox.isSelected
            statusLabel.text = "Saved."
        }
        add(saveButton, g)

        g.gridy = 5
        add(statusLabel, g)
    }
}
