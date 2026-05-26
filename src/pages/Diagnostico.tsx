import { useState, useEffect } from "react";

export default function Diagnostico() {
  const [balanceData, setBalanceData] = useState<any>(null);
  const [txData, setTxData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("auth_token") || "";
    if (!token) {
      setError("No estas logueado. Entra a la app primero.");
      setLoading(false);
      return;
    }

    // Fetch both endpoints
    Promise.all([
      fetch("/api/debug-balance", { headers: { "x-auth-token": token } }).then(r => r.json()),
      fetch("/api/trpc/bank.debugTransactions", { headers: { "x-auth-token": token } }).then(r => r.json()),
    ])
      .then(([bal, tx]) => {
        setBalanceData(bal);
        setTxData(tx);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-sm">Cargando diagnostico...</div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-lg font-bold">Diagnostico del Banco</h1>

      {/* Balance Section */}
      {balanceData?.error && (
        <div className="border rounded-lg p-3 bg-red-50 text-red-700 text-xs">{balanceData.error}</div>
      )}
      {balanceData?.results?.map((r: any, i: number) => (
        <div key={i} className="border rounded-lg p-3 bg-white">
          {r.error ? (
            <p className="text-xs text-red-600">Error: {r.error}</p>
          ) : (
            <>
              <p className="text-sm font-medium">{r.dbBankName}</p>
              <div className="mt-2 space-y-1 text-xs">
                <p><span className="text-neutral-400">Balance en app:</span> <span className="font-medium">${r.dbBalance}</span></p>
                <p><span className="text-neutral-400">Ultima sync:</span> {r.dbLastSync ? new Date(r.dbLastSync).toLocaleString("es") : "Nunca"}</p>
              </div>
              {r.plaidAccounts?.map((pa: any, j: number) => (
                <div key={j} className="mt-2 p-2 bg-neutral-50 rounded text-xs">
                  <p className="font-medium">{pa.name} (...{pa.mask})</p>
                  <p className="text-emerald-600 font-medium">Disponible: ${pa.balances.available ?? "N/A"}</p>
                  <p className="text-neutral-500">Current: ${pa.balances.current ?? "N/A"}</p>
                </div>
              ))}
            </>
          )}
        </div>
      ))}

      {/* Transactions Section */}
      <h2 className="text-md font-semibold">Transacciones por Cuenta</h2>
      {txData?.result?.data && (
        <div className="border rounded-lg p-3 bg-white">
          <p className="text-xs text-neutral-500 mb-2">
            Total transacciones: <span className="font-medium text-black">{txData.result.data.totalTransactions}</span>
          </p>

          {/* Account list */}
          <div className="space-y-1 mb-3">
            <p className="text-xs font-medium text-neutral-400">Cuentas en DB:</p>
            {txData.result.data.accounts?.map((a: any) => (
              <div key={a.id} className="text-xs flex justify-between">
                <span>ID {a.id}: {a.name}</span>
                <span className="text-neutral-400">{a.plaidId}...</span>
              </div>
            ))}
          </div>

          {/* Transaction counts per account */}
          <div className="space-y-1 mb-3">
            <p className="text-xs font-medium text-neutral-400">Transacciones por cuenta:</p>
            {txData.result.data.transactionCounts?.map((t: any, idx: number) => (
              <div key={idx} className="text-xs flex justify-between">
                <span>Cuenta ID {t.bankAccountId ?? "NULL"}:</span>
                <span className="font-medium">{t.count} txs</span>
              </div>
            ))}
          </div>

          {/* Recent transactions */}
          <p className="text-xs font-medium text-neutral-400 mb-1">Ultimas 20 transacciones:</p>
          <div className="space-y-1 max-h-60 overflow-auto">
            {txData.result.data.recentTransactions?.map((tx: any) => (
              <div key={tx.id} className="text-xs p-1.5 bg-neutral-50 rounded flex justify-between">
                <div>
                  <p className="font-medium truncate max-w-[200px]">{tx.description}</p>
                  <p className="text-neutral-400">
                    Cuenta: {tx.bankAccountId ?? "NULL"} | {tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString("es") : ""}
                  </p>
                </div>
                <span className="font-medium shrink-0">${tx.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {txData?.result?.data?.error && (
        <div className="border rounded-lg p-3 bg-red-50 text-red-700 text-xs">{txData.result.data.error}</div>
      )}
    </div>
  );
}
