import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Cards } from "./pages/Cards";
import { Investments } from "./pages/Investments";
import { Salary } from "./pages/Salary";
import { Budgets } from "./pages/Budgets";
import { Recurring } from "./pages/Recurring";
import { Persons } from "./pages/Persons";
import { Shared } from "./pages/Shared";
import { Month } from "./pages/Month";
import { Settings } from "./pages/Settings";
import "./index.css";

const qc = new QueryClient();

function Root() {
  const { email, loading } = useAuth();
  if (loading) return null;
  if (!email) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="mes" element={<Month />} />
        <Route path="tarjetas" element={<Cards />} />
        <Route path="inversiones" element={<Investments />} />
        <Route path="sueldos" element={<Salary />} />
        <Route path="presupuestos" element={<Budgets />} />
        <Route path="recurrentes" element={<Recurring />} />
        <Route path="personas" element={<Persons />} />
        <Route path="compartidos" element={<Shared />} />
        <Route path="config" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
