package app.apivault.jetbrains

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class InspectionsTest {

    @Test
    fun `package json scoped dependency line`() {
        assertEquals(
            "@scope/foo",
            parsePackageNameFromLine("""    "@scope/foo": "^1.2.3",""")
        )
    }

    @Test
    fun `package json plain dependency line`() {
        assertEquals(
            "axios",
            parsePackageNameFromLine("""    "axios": "1.7.2",""")
        )
    }

    @Test
    fun `package json section keys are excluded`() {
        assertNull(parsePackageNameFromLine(""""dependencies": {"""))
        assertNull(parsePackageNameFromLine(""""scripts": {"""))
    }

    @Test
    fun `cargo toml string version`() {
        assertEquals("serde", parsePackageNameFromLine("""serde = "1.0""""))
    }

    @Test
    fun `cargo toml table version`() {
        assertEquals("tokio", parsePackageNameFromLine("""tokio = { version = "1", features = ["macros"] }"""))
    }

    @Test
    fun `cargo toml meta keys excluded`() {
        assertNull(parsePackageNameFromLine("""name = "demo""""))
        assertNull(parsePackageNameFromLine("""edition = "2021""""))
    }

    @Test
    fun `comment or empty line yields null`() {
        assertNull(parsePackageNameFromLine("# comment"))
        assertNull(parsePackageNameFromLine(""))
        assertNull(parsePackageNameFromLine("   "))
        assertNull(parsePackageNameFromLine("// comment"))
    }

    @Test
    fun `requirements txt pinned`() {
        assertEquals("requests", parsePackageNameFromLine("requests==2.31.0"))
        assertEquals("django", parsePackageNameFromLine("django>=4.2"))
        assertEquals("black", parsePackageNameFromLine("black~=24.0"))
    }

    @Test
    fun `go mod single-line require`() {
        assertEquals(
            "github.com/pkg/errors",
            parsePackageNameFromLine("require github.com/pkg/errors v0.9.1")
        )
    }

    @Test
    fun `go mod block-line dependency`() {
        assertEquals(
            "github.com/spf13/cobra",
            parsePackageNameFromLine("\tgithub.com/spf13/cobra v1.8.0")
        )
    }

    @Test
    fun `go mod meta keywords excluded`() {
        assertNull(parsePackageNameFromLine("module github.com/foo/bar"))
        assertNull(parsePackageNameFromLine("go 1.21"))
    }
}
