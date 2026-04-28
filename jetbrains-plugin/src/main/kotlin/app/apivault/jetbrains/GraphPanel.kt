package app.apivault.jetbrains

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.ui.JBUI
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.browser.CefBrowser
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JPanel

class GraphPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val log = Logger.getInstance(GraphPanel::class.java)
    private val mapper = ObjectMapper().registerKotlinModule()
    private val statusLabel = JBLabel(" ")
    private val browser: JBCefBrowser? = if (JBCefApp.isSupported()) JBCefBrowser() else null
    @Volatile
    private var bridgeReady: Boolean = false
    @Volatile
    private var pendingPayload: String? = null

    init {
        border = JBUI.Borders.empty(8)

        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
            add(JButton("Refresh", AllIcons.Actions.Refresh).apply {
                addActionListener { refresh() }
            })
        }
        add(toolbar, BorderLayout.NORTH)

        if (browser == null) {
            // 일부 IDE 빌드는 JCEF 가 비활성. fallback: 텍스트 안내.
            val msg = JBLabel(
                "<html><div style='padding:12px'>" +
                    "<b>JCEF unavailable in this IDE build.</b><br>" +
                    "Enable it via <i>Help &rarr; Find Action &rarr; Choose Boot Java Runtime…</i> " +
                    "and pick a JBR with JCEF, or use the Credentials / Supply chain tabs.</div></html>"
            )
            add(msg, BorderLayout.CENTER)
        } else {
            add(browser.component, BorderLayout.CENTER)
            val resourceUrl = javaClass.classLoader.getResource("graph/graph.html")
            if (resourceUrl != null) {
                browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(b: CefBrowser?, frameId: Int, statusCode: Int) {
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

        // 자동 1회 로드. 브라우저 부팅 여유로 약간 지연.
        ApplicationManager.getApplication().executeOnPooledThread {
            Thread.sleep(400)
            refresh()
        }
    }

    fun refresh() {
        statusLabel.text = "Loading graph…"
        ApplicationManager.getApplication().executeOnPooledThread {
            val payload = project.service<ApiVaultService>().fetchGraph()
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
                    "${payload.nodes.size} nodes · ${payload.edges.size} edges"
                }
            }
        }
    }

    private fun post(jsonPayload: String) {
        val b = browser ?: return
        // Wrap the JSON-string into a valid JS string literal by JSON-encoding
        // it again — every unsafe character (quotes, backslashes, line
        // separators U+2028/U+2029) is escaped properly by Jackson.
        val literal = mapper.writeValueAsString(jsonPayload)
        val js = "window.apivaultLoad($literal);"
        b.cefBrowser.executeJavaScript(js, b.cefBrowser.url, 0)
    }
}
