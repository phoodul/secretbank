package app.apivault.jetbrains

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.PROJECT)
@State(
    name = "ApiVaultSettings",
    storages = [Storage("api-vault.xml")]
)
class ApiVaultSettings : PersistentStateComponent<ApiVaultSettings.State> {

    private var state = State()

    var cliPath: String
        get() = state.cliPath
        set(value) { state.cliPath = value }

    var scanOnProjectOpen: Boolean
        get() = state.scanOnProjectOpen
        set(value) { state.scanOnProjectOpen = value }

    override fun getState(): State = state
    override fun loadState(s: State) { state = s }

    data class State(
        var cliPath: String = "apivault",
        var scanOnProjectOpen: Boolean = false,
    )
}
