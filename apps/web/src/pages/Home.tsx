import { useAuth } from "../lib/auth";

export function Home() {
  const { email, logout } = useAuth();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finanzas</h1>
        <button className="text-sm text-slate-600 underline" onClick={logout}>Salir ({email})</button>
      </header>
      <p className="mt-6 text-slate-600">Base lista. Próximo paso: cuentas, categorías y movimientos.</p>
    </main>
  );
}
