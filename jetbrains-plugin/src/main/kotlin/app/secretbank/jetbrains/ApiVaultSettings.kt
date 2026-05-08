package app.secretbank.jetbrains

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.PROJECT)
@State(
    name = "SecretbankSettings",
    storages = [Storage("secretbank.xml")]
)
class SecretbankSettings : PersistentStateComponent<SecretbankSettings.State> {

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
        var cliPath: String = "Secretbank",
        var scanOnProjectOpen: Boolean = false,
    )
}
