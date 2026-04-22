import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { AuditPage } from "@/pages/AuditPage";
import { GraphPage } from "@/pages/GraphPage";
import { IncidentsPage } from "@/pages/IncidentsPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { SettingsPage } from "@/pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<InventoryPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
