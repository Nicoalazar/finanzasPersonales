import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const link = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm sm:rounded ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

const LINKS = [
  ["/", "Resumen"], ["/mes", "Mes"], ["/tarjetas", "Tarjetas"], ["/compartidos", "Compartidos"], ["/inversiones", "Inversiones"],
  ["/sueldos", "Sueldos"], ["/presupuestos", "Presupuestos"], ["/recurrentes", "Recurrentes"], ["/personas", "Personas"], ["/config", "Configuración"],
] as const;

export function Layout() {
  const { email, logout } = useAuth();
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // En el celular el menú es una sola fila desplazable: centra la sección activa.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <div className="mx-auto max-w-4xl px-3 pb-16 sm:px-4">
      <header className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-2 border-b bg-slate-50/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:flex-wrap sm:justify-between sm:border-0 sm:px-0 sm:py-4">
        <nav ref={nav} className="no-scrollbar -ml-3 flex min-w-0 flex-1 gap-1 overflow-x-auto pl-3 pr-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none] sm:pr-0 sm:ml-0 sm:flex-none sm:flex-wrap sm:overflow-visible sm:pl-0">
          {LINKS.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"} className={link}>{label}</NavLink>)}
        </nav>
        <button className="shrink-0 text-sm text-slate-500 underline" onClick={logout} title={email ?? undefined}>
          Salir<span className="hidden sm:inline"> ({email})</span>
        </button>
      </header>
      <Outlet />
    </div>
  );
}
