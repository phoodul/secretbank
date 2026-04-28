package app.apivault.jetbrains

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/**
 * Project-scoped wrapper around the local `apivault` CLI. The plugin never
 * holds plaintext credentials — it only orchestrates the CLI and forwards
 * its output (which the CLI zeroes on its own exit). Network calls are also
 * the CLI's job; we do not embed any HTTP client for OSV.
 */
@Service(Service.Level.PROJECT)
class ApiVaultService(private val project: Project) {

    private val log = Logger.getInstance(ApiVaultService::class.java)
    private val mapper = ObjectMapper().registerKotlinModule()

    /** Cached scan result for inspections to consult without re-running. */
    @Volatile
    var lastScan: ScanReport? = null
        private set

    fun listCredentials(): List<CredentialMeta> {
        val out = run("list", "--json") ?: return emptyList()
        return runCatching { mapper.readValue(out, Array<CredentialMeta>::class.java).toList() }
            .onFailure { log.warn("apivault list parse: ${it.message}") }
            .getOrDefault(emptyList())
    }

    /**
     * Returns the requested credential value or null on failure. The caller is
     * responsible for clipboard handling and zeroing — we hand back a String
     * because Kotlin Strings are immutable and the JVM will GC them; for
     * stricter zeroing JetBrains plugins typically delegate to the CLI and
     * only carry a transient handle.
     */
    fun revealCredential(idOrName: String, passphrase: CharArray): String? {
        return run("reveal", idOrName, "--stdin-passphrase", input = String(passphrase))
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    fun scanSupplyChain(projectPath: String): ScanReport? {
        val out = run("scan", "supply-chain", "--project", projectPath, "--json") ?: return null
        return runCatching { mapper.readValue(out, ScanReport::class.java) }
            .onSuccess { lastScan = it }
            .onFailure { log.warn("apivault scan parse: ${it.message}") }
            .getOrNull()
    }

    /** Convenience for inspections — package_name -> highest-severity advisory in the cached scan. */
    fun advisoryFor(packageName: String): MatchedAdvisory? {
        val scan = lastScan ?: return null
        return scan.matched
            .filter { it.packageName.equals(packageName, ignoreCase = true) }
            .maxByOrNull { severityRank(it.severity) }
    }

    private fun severityRank(s: String): Int = when (s.lowercase()) {
        "critical" -> 4; "high" -> 3; "medium" -> 2; "low" -> 1; else -> 0
    }

    private fun run(vararg args: String, input: String? = null): String? {
        val cli = settings().cliPath.ifBlank { "apivault" }
        return try {
            val pb = ProcessBuilder(listOf(cli) + args.toList())
                .redirectErrorStream(false)
            val proc = pb.start()
            input?.let {
                proc.outputStream.use { os -> os.write(it.toByteArray()); os.flush() }
            }
            val ok = proc.waitFor(20, TimeUnit.SECONDS)
            if (!ok) {
                proc.destroyForcibly()
                log.warn("apivault timed out: ${args.joinToString(" ")}")
                return null
            }
            if (proc.exitValue() != 0) {
                log.info("apivault non-zero exit: ${args.joinToString(" ")}")
                return null
            }
            BufferedReader(InputStreamReader(proc.inputStream)).readText()
        } catch (e: Exception) {
            log.warn("apivault exec failed (${args.joinToString(" ")}): ${e.message}")
            null
        }
    }

    private fun settings(): ApiVaultSettings = project.service()

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class CredentialMeta(
        val id: String,
        val name: String,
        val issuer: String,
        val env: String? = null,
        val status: String? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class ScanReport(
        val manifestsFound: Int = 0,
        val packagesSeen: Int = 0,
        val advisoriesMatched: Int = 0,
        val matched: List<MatchedAdvisory> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class MatchedAdvisory(
        val packageName: String,
        val ecosystem: String,
        val version: String,
        val manifestPath: String,
        val sourceId: String,
        val severity: String,
        val category: String,
        val summary: String,
    )
}
