import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold" translate="no">Finanzas</h1>
          <p className="text-sm text-muted">Entrá para ver tus cuentas del mes.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Email</span>
          <input className="field w-full px-3 py-2" type="email" name="email" autoComplete="email"
            inputMode="email" spellCheck={false} autoCapitalize="none" placeholder="vos@ejemplo.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Contraseña</span>
          <input className="field w-full px-3 py-2" type="password" name="password"
            autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p role="alert" className="rounded bg-neg-soft p-2 text-sm text-neg">{error}</p>}

        <button className="btn-primary w-full py-2" disabled={pending}>{pending ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </main>
  );
}
