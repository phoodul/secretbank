package app.secretbank.jetbrains

import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.ProblemHighlightType
import com.intellij.codeInspection.ProblemsHolder
import com.intellij.openapi.components.service
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.psi.PsiFile

/**
 * package.json 파일에서 의존성 라인을 보고, 마지막 supply-chain 스캔이
 * 매칭한 advisory 가 있으면 WARNING 으로 표시. 우리는 PSI 트리 탐색을
 * 단순화하기 위해 텍스트 기반 라인 매칭을 사용 — 깊이 있는 JSON PSI
 * 의존을 피해 컴파일 단순화 (JsonElementVisitor 는 별도 plugin dep 필요).
 */
class PackageJsonAdvisoryInspection : LocalInspectionTool() {
    override fun getShortName() = "SecretbankPackageJsonAdvisory"
    override fun buildVisitor(holder: ProblemsHolder, isOnTheFly: Boolean): PsiElementVisitor =
        ManifestAdvisoryVisitor(holder, "package.json")
}

class CargoTomlAdvisoryInspection : LocalInspectionTool() {
    override fun getShortName() = "SecretbankCargoTomlAdvisory"
    override fun buildVisitor(holder: ProblemsHolder, isOnTheFly: Boolean): PsiElementVisitor =
        ManifestAdvisoryVisitor(holder, "Cargo.toml")
}

private class ManifestAdvisoryVisitor(
    private val holder: ProblemsHolder,
    private val matchFileName: String,
) : PsiElementVisitor() {

    override fun visitFile(file: PsiFile) {
        if (file.name != matchFileName) return
        val project = file.project
        val svc = project.service<SecretbankService>()
        val text = file.text
        val lines = text.split("\n")

        var offset = 0
        for (line in lines) {
            val pkg = parsePackageNameFromLine(line)
            if (pkg != null) {
                val advisory = svc.advisoryFor(pkg)
                if (advisory != null) {
                    val lineStart = offset
                    val lineEnd = offset + line.length
                    val target = file.findElementAt(lineStart) ?: file
                    val msg = "🔑 ${advisory.severity.uppercase()} ${advisory.category}: ${advisory.summary} (${advisory.sourceId})"
                    holder.registerProblem(
                        target,
                        target.textRange.intersection(com.intellij.openapi.util.TextRange(lineStart, lineEnd))
                            ?: target.textRange,
                        msg,
                        ProblemHighlightType.GENERIC_ERROR_OR_WARNING
                    )
                }
            }
            offset += line.length + 1 // newline
        }
    }
}

/**
 * 한 줄에서 패키지 이름을 추출. package.json 의 `"name": "1.2.3"` 또는
 * Cargo.toml 의 `name = "1.2"` / `name = { version = "1.2" }`,
 * requirements.txt 의 `requests==2.31.0`, go.mod 의 `require module/path v1.2.3`.
 */
internal fun parsePackageNameFromLine(line: String): String? {
    val trimmed = line.trim()
    if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("//")) return null

    // package.json: "@scope/foo": "..."
    val jsonMatch = Regex("""^"([^"]+)"\s*:\s*[\{"]""").find(trimmed)
    if (jsonMatch != null) {
        val name = jsonMatch.groupValues[1]
        if (name in listOf(
                "dependencies", "devDependencies", "peerDependencies",
                "optionalDependencies", "scripts", "engines", "name", "version"
            )) return null
        return name
    }
    // Cargo.toml: name = "1.0" or name = { ... }
    val cargoMatch = Regex("""^([a-zA-Z0-9_\-]+)\s*=\s*[\{"]""").find(trimmed)
    if (cargoMatch != null) {
        val name = cargoMatch.groupValues[1]
        if (name in listOf("name", "version", "edition", "description", "license", "authors", "repository", "homepage")) return null
        return name
    }
    // requirements.txt: requests==2.31.0  /  django>=4.2  /  black~=24.0
    val pyMatch = Regex("""^([A-Za-z0-9_\-.]+)\s*(==|>=|<=|>|<|~=|!=)""").find(trimmed)
    if (pyMatch != null) {
        return pyMatch.groupValues[1]
    }
    // go.mod (single-line `require`): `require module/path v1.2.3`
    val goReqMatch = Regex("""^require\s+([^\s]+)\s+v\d""").find(trimmed)
    if (goReqMatch != null) {
        return goReqMatch.groupValues[1]
    }
    // go.mod block: `module/path v1.2.3` (when inside `require ( ... )`)
    val goLine = Regex("""^([a-zA-Z0-9_./\-]+)\s+v\d""").find(trimmed)
    if (goLine != null) {
        val name = goLine.groupValues[1]
        if (name in listOf("require", "go", "module", "replace", "exclude")) return null
        return name
    }
    return null
}
