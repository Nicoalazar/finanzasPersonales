import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import "./index.css";

const qc = new QueryClient();

function Root() {
  const { email, loading } = useAuth();
  if (loading) return null;
  return email ? <Home /> : <Login />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
