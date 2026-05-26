import { useState, useEffect } from "react";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  modePreference: string;
  hasSubscription: boolean;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/trpc/subscription.listUsers")
      .then((r) => r.json())
      .then((data) => {
        if (data.result?.data) {
          setUsers(data.result.data);
        } else if (Array.isArray(data)) {
          setUsers(data);
        } else {
          setError("Formato de respuesta inesperado");
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8">Cargando usuarios...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Usuarios ({users.length})</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-100 border-b">
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Rol</th>
              <th className="text-left p-2">Suscripcion</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-neutral-50">
                <td className="p-2">{u.id}</td>
                <td className="p-2">{u.email || "—"}</td>
                <td className="p-2">{u.name || "—"}</td>
                <td className="p-2">{u.role}</td>
                <td className="p-2">
                  {u.hasSubscription ? (
                    <span className="text-emerald-600 font-medium">{u.subscriptionPlan}</span>
                  ) : (
                    <span className="text-neutral-400">Ninguna</span>
                  )}
                </td>
                <td className="p-2">
                  {u.subscriptionStatus ? (
                    <span className={
                      u.subscriptionStatus === "active" ? "text-emerald-600" :
                      u.subscriptionStatus === "past_due" ? "text-red-600" :
                      u.subscriptionStatus === "incomplete" ? "text-amber-600" :
                      "text-neutral-600"
                    }>
                      {u.subscriptionStatus}
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="p-2 font-mono text-xs text-neutral-500">
                  {u.stripeCustomerId || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
