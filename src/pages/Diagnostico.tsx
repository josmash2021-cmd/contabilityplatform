import { useState, useEffect } from "react";

export default function Diagnostico() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Get token from localStorage (same as the app uses)
    const token = localStorage.getItem("auth_token") || "";
    if (!token) {
      setError("No estas logueado. Entra a la app primero.");
      setLoading(false);
      return;
    }

    fetch("/api/debug-balance", {
      headers: { "x-auth-token": token },
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-sm">Cargando diagnostico...</div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (data?.error) return <div className="p-8 text-sm text-red-600">{data.error}</div>;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold mb-2">Diagnostico del Banco</h1>
      <p className="text-xs text-neutral-500 mb-4">
        Usuario: {data.email} | Plaid: {data.plaidEnv}
      </p>

      {data.results?.map((r: any, i: number) => (
        <div key={i} className="border rounded-lg p-3 mb-3 bg-white">
          {r.error ? (
            <p className="text-xs text-red-600">Error: {r.error}</p>
          ) : (
            <>
              <p className="text-sm font-medium">{r.dbBankName}</p>
              <div className="mt-2 space-y-1">
                <p className="text-xs">
                  <span className="text-neutral-400">Balance en app:</span>{" "}
                  <span className="font-medium">${r.dbBalance}</span>
                </p>
                <p className="text-xs">
                  <span className="text-neutral-400">Ultima sync:</span>{" "}
                  {r.dbLastSync ? new Date(r.dbLastSync).toLocaleString("es") : "Nunca"}
                </p>
              </div>

              {r.plaidAccounts?.map((pa: any, j: number) => (
                <div key={j} className="mt-2 p-2 bg-neutral-50 rounded text-xs">
                  <p className="font-medium">{pa.name} (...{pa.mask})</p>
                  <p className="text-neutral-500">{pa.type} / {pa.subtype}</p>
                  <p className="mt-1">
                    <span className="text-emerald-600 font-medium">
                      Disponible: ${pa.balances.available ?? "N/A"}
                    </span>
                    {" | "}
                    <span className="text-neutral-500">
                      Current: ${pa.balances.current ?? "N/A"}
                    </span>
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
