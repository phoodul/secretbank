import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/theme-provider";

function App() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-8 text-primary" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">API Vault</h1>
      </div>

      <p className="max-w-md text-center text-sm text-muted-foreground">
        Bitwarden for APIs, with Dependency Graph.
      </p>

      <Button variant="outline" size="sm" onClick={toggleTheme}>
        Toggle theme ({theme})
      </Button>
    </main>
  );
}

export default App;
