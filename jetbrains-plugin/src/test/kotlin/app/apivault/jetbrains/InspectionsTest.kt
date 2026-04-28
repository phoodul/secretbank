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
    }
}
