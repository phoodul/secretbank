package app.secretbank.jetbrains

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.intellij.icons.AllIcons
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.JBUI
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.browser.CefBrowser
import java.awt.BorderLayout
import java.awt.Desktop
import java.awt.FlowLayout
import java.awt.MouseInfo
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.net.URI
import javax.swing.JButton
import javax.swing.JMenuItem
import javax.swing.JOptionPane
import javax.swing.JPanel
import javax.swing.JPopupMenu
import javax.swing.SwingUtilities

class GraphPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val log = Logger.getInstance(GraphPanel::class.java)
    private val mapper = ObjectMapper().registerKotlinModule()
    private val statusLabel = JBLabel(" ")
    private val browser: JBCefBrowser? = if (JBCefApp.isSupported()) JBCefBrowser() else null
    private val bridge: JBCefJSQuery? = browser?.let { JBCefJSQuery.create(it as JBCefBrowserBase) }

    @Volatile
    private var nodeIndex: Map<String, SecretbankService.GraphNode> = emptyMap()

    @Volatile
    private var bridgeReady: Boolean = false

    @Volatile
    private var pendingPayload: String? = null

    init {
        border = JBUI.Borders.empty(8)

        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            add(JButton("Refresh", AllIcons.Actions.Refresh).apply { addActionListener { refresh() } })
            add(JButton("Center", AllIcons.Actions.MoveToTopLeft).apply {
                addActionListener { runJs("window.SecretbankCenter && window.SecretbankCenter();") }
            })
            add(JButton("Clear highlight", AllIcons.Actions.GC).apply {
                addActionListener { runJs("window.SecretbankClearHighlight && window.SecretbankClearHighlight();") }
            })
        }
        add(toolbar, BorderLayout.NORTH)

        if (browser == null) {
            val msg = JBLabel(
                "<html><div style='padding:12px'>" +
                    "<b>JCEF unavailable in this IDE build.</b><br>" +
                    "Enable it via <i>Help &rarr; Find Action &rarr; Choose Boot Java Runtime…</i> " +
                    "and pick a JBR with JCEF, or use the Credentials / Supply chain tabs.</div></html>"
            )
            add(msg, BorderLayout.CENTER)
        } else {
            bridge!!.addHandler { rawMessage ->
                handleMessage(rawMessage)
                null
            }
            add(browser.component, BorderLayout.CENTER)

            val resourceUrl = javaClass.classLoader.getResource("graph/graph.html")
            if (resourceUrl != null) {
                browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(b: CefBrowser?, frameId: Int, statusCode: Int) {
                        val injection = bridge.inject("__msg__")
                        val js = "window.__SecretbankSend = function(__msg__) { $injection };"
                        browser.cefBrowser.executeJavaScript(js, browser.cefBrowser.url, 0)
                        bridgeReady = true
                        pendingPayload?.let { post(it) }
                    }
                }, browser.cefBrowser)
                browser.loadURL(resourceUrl.toExternalForm())
            } else {
                log.warn("graph/graph.html not found in plugin resources")
            }
        }
        add(statusLabel, BorderLayout.SOUTH)

        ApplicationManager.getApplication().executeOnPooledThread {
            Thread.sleep(400)
            refresh()
        }
    }

    fun refresh() {
        statusLabel.text = "Loading graph…"
        ApplicationManager.getApplication().executeOnPooledThread {
            val payload = project.service<SecretbankService>().fetchGraph()
            nodeIndex = payload.nodes.associateBy { it.id }
            val json = mapper.writeValueAsString(payload)
            ApplicationManager.getApplication().invokeLater {
                if (browser == null) {
                    statusLabel.text = "JCEF unavailable. ${payload.nodes.size} nodes / ${payload.edges.size} edges."
                    return@invokeLater
                }
                if (bridgeReady) post(json) else pendingPayload = json
                statusLabel.text = if (payload.nodes.isEmpty()) {
                    "Empty graph — add credentials and projects in the desktop app."
                } else {
                    "${payload.nodes.size} nodes · ${payload.edges.size} edges  (right-click for actions)"
                }
            }
        }
    }

    private fun post(jsonPayload: String) {
        runJs("window.SecretbankLoad(${mapper.writeValueAsString(jsonPayload)});")
    }

    private fun runJs(js: String) {
        val b = browser ?: return
        b.cefBrowser.executeJavaScript(js, b.cefBrowser.url, 0)
    }

    private fun handleMessage(raw: String) {
        val (verb, id) = raw.split(':', limit = 2).let {
            if (it.size == 2) it[0] to it[1] else return
        }
        val node = nodeIndex[id] ?: return
        when (verb) {
            "select" -> ApplicationManager.getApplication().invokeLater {
                statusLabel.text = "${node.kind}: ${node.label}"
            }
            "activate" -> defaultActivate(node)
            "context" -> ApplicationManager.getApplication().invokeLater { showContextMenu(node) }
        }
    }

    /** Double-click default — most useful single action per kind. */
    private fun defaultActivate(node: SecretbankService.GraphNode) {
        when (node.kind) {
            "credential" -> revealCredentialFlow(node)
            "issuer" -> openUrl(node.meta["docs_url"] as? String)
            "project" -> openUrl(node.meta["repo_url"] as? String)
            "deployment" -> openUrl(node.meta["url"] as? String)
            else -> {}
        }
    }

    /** Right-click — JBPopupMenu with kind-specific items. */
    private fun showContextMenu(node: SecretbankService.GraphNode) {
        val menu = JPopupMenu("Secretbank — ${node.label}")
        when (node.kind) {
            "credential" -> {
                menu.add(JMenuItem("Show blast radius").apply {
                    addActionListener { showBlastRadius(node) }
                })
                menu.add(JMenuItem("Reveal to clipboard").apply {
                    addActionListener { revealCredentialFlow(node) }
                })
                menu.addSeparator()
            }
            "issuer" -> {
                menu.add(JMenuItem("Open docs").apply {
                    addActionListener { openUrl(node.meta["docs_url"] as? String) }
                })
                menu.addSeparator()
            }
            "project" -> {
                menu.add(JMenuItem("Open repo").apply {
                    addActionListener { openUrl(node.meta["repo_url"] as? String) }
                })
                menu.addSeparator()
            }
            "deployment" -> {
                menu.add(JMenuItem("Open URL").apply {
                    addActionListener { openUrl(node.meta["url"] as? String) }
                })
                menu.addSeparator()
            }
        }
        menu.add(JMenuItem("Focus node").apply {
            addActionListener { runJs("window.SecretbankFocus && window.SecretbankFocus(${mapper.writeValueAsString(node.id)});") }
        })
        menu.add(JMenuItem("Copy ID").apply {
            addActionListener {
                Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(node.id), null)
                ApplicationManager.getApplication().invokeLater { statusLabel.text = "Copied ${node.id}" }
            }
        })

        // 마우스 위치에 표시. JCEF 브라우저 영역 내부 좌표를 못 받으니 글로벌 위치에서 panel 좌표로 환산.
        val pos = MouseInfo.getPointerInfo()?.location
        if (pos != null && browser != null) {
            SwingUtilities.convertPointFromScreen(pos, browser.component)
            menu.show(browser.component, pos.x.coerceAtLeast(0), pos.y.coerceAtLeast(0))
        } else {
            menu.show(this, 20, 20)
        }
    }

    private fun showBlastRadius(node: SecretbankService.GraphNode) {
        if (node.kind != "credential") return
        statusLabel.text = "Computing blast radius…"
        ApplicationManager.getApplication().executeOnPooledThread {
            val rad = project.service<SecretbankService>().blastRadius(node.id)
            ApplicationManager.getApplication().invokeLater {
                if (rad == null) {
                    notify("Blast radius failed for ${node.label}.", NotificationType.ERROR)
                    statusLabel.text = "Blast radius failed."
                    return@invokeLater
                }
                val json = mapper.writeValueAsString(rad)
                runJs("window.SecretbankBlastRadius && window.SecretbankBlastRadius(${mapper.writeValueAsString(json)});")
                statusLabel.text =
                    "Blast radius — primary ${rad.primary.size} · secondary ${rad.secondary.size} · tertiary ${rad.tertiary.size}"
            }
        }
    }

    private fun revealCredentialFlow(node: SecretbankService.GraphNode) {
        ApplicationManager.getApplication().invokeLater {
            val passphrase = JOptionPane.showInputDialog(
                this,
                "Master passphrase to reveal ${node.label}:",
                "Secretbank — Reveal",
                JOptionPane.QUESTION_MESSAGE
            ) ?: return@invokeLater

            statusLabel.text = "Revealing ${node.label}…"
            ApplicationManager.getApplication().executeOnPooledThread {
                val value = project.service<SecretbankService>()
                    .revealCredential(node.id, passphrase.toCharArray())
                ApplicationManager.getApplication().invokeLater {
                    if (value == null) {
                        notify("Reveal failed for ${node.label}.", NotificationType.ERROR)
                        statusLabel.text = "Reveal failed."
                        return@invokeLater
                    }
                    Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(value), null)
                    notify("Copied ${node.label} to clipboard. Auto-clear in 30s.")
                    statusLabel.text = "${node.label} copied."
                    ApplicationManager.getApplication().executeOnPooledThread {
                        Thread.sleep(30_000)
                        Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(""), null)
                    }
                }
            }
        }
    }

    private fun openUrl(url: String?) {
        if (url.isNullOrBlank()) {
            ApplicationManager.getApplication().invokeLater { statusLabel.text = "No URL on this node." }
            return
        }
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI(url))
            } else {
                notify("Open URL not supported on this OS: $url", NotificationType.WARNING)
            }
        } catch (e: Exception) {
            notify("Could not open $url: ${e.message}", NotificationType.WARNING)
        }
    }

    private fun notify(content: String, type: NotificationType = NotificationType.INFORMATION) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("app.secretbank.jetbrains.notifications")
            .createNotification("Secretbank", content, type)
            .notify(project)
    }
}
