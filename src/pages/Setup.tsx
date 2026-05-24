import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function Setup() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const runSetup = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/trpc/setup.run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.result?.data?.success) {
        setResult(data.result.data.results);
      } else {
        setError(data.result?.data?.error || "Error desconocido");
      }
    } catch (e: any) {
      setError(e.message || "Error de conexion");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-lg border-neutral-200 rounded-xl shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-black">Configuracion de Base de Datos</CardTitle>
          <p className="text-xs text-neutral-500">Ejecuta esto una sola vez para crear las tablas necesarias para el modo Personal.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={runSetup}
            disabled={loading}
            className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10"
          >
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ejecutando...</> : "Ejecutar Configuracion"}
          </Button>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle className="w-4 h-4" /> Configuracion completada
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                <ul className="space-y-1">
                  {result.map((r: string, i: number) => (
                    <li key={i} className="text-xs text-neutral-600">{r}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-neutral-500">Cierra sesion y vuelve a iniciar para ver el modo Personal.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
