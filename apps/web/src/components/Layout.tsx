import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"}`;

export function Layout() {
  const { email, logout } = useAuth();
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 py-4">
        <nav className="flex gap-1">
          <NavLink to="/" end className={link}>Mes</NavLink>
          <NavLink to="/tarjetas" className={link}>Tarjetas</NavLink>
          <NavLink to="/config" className={link}>Configuración</NavLink>
        </nav>
        <button className="text-sm text-slate-500 underline" onClick={logout}>Salir ({email})</button>
      </header>
      <Outlet />
    </div>
  );
}
