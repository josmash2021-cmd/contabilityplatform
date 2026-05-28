import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, Link2, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function PersonalBank() {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const createLinkMut = trpc.bank.createLinkToken.useMutation({
    onSuccess: (data) => {
      if (data.success && data.linkToken) {
        setStatus("loading");
        // Open Plaid Link in new window
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const plaidWindow = window.open(
          `https://cdn.plaid.com/link/v2/stable/link.html?token=${data.linkToken}`,
          "PlaidLink",
          `width=${width},height=${height},top=${top},left=${left}`
        );

        // Poll for window close
        const pollTimer = setInterval(() => {
          if (plaidWindow?.closed) {
            clearInterval(pollTimer);
            setStatus("success");
            toast.success("Banco conectado exitosamente");
            // Reload to refresh data
            setTimeout(() => window.location.href = "/personal", 1500);
          }
        }, 500);
      } else {
        toast.error(data.error || "Error al iniciar conexion");
        setStatus("idle");
      }
    },
    onError: (err) => {
      toast.error(err.message);
      setStatus("idle");
    },
  });

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50 p-4">
      <Card className="w-full max-w-md border-none shadow-none bg-white">
        <CardContent className="p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-6">
            <Landmark className="w-10 h-10 text-neutral-400" />
          </div>

          {/* Title */}
          <h1 className="text-xl font-semibold text-black mb-2">
            Conectar tu banco
          </h1>
          <p className="text-sm text-neutral-400 mb-8">
            Conecta tu cuenta bancaria para ver transacciones automaticas, balance en tiempo real y analisis de flujo de caja.
          </p>

          {/* Security note */}
          <div className="flex items-center gap-2 justify-center mb-6 p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">
              Tus datos estan protegidos con encriptacion de nivel bancario
            </p>
          </div>

          {/* Connect button */}
          <Button
            onClick={() => {
              setStatus("loading");
              createLinkMut.mutate();
            }}
            disabled={status === "loading"}
            className="w-full h-12 bg-black text-white rounded-xl hover:bg-neutral-800 text-sm font-medium"
          >
            {status === "loading" ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando...</>
            ) : status === "success" ? (
              <><CheckCircle className="w-4 h-4 mr-2" /> Conectado</>
            ) : (
              <><Link2 className="w-4 h-4 mr-2" /> Conectar Banco</>
            )}
          </Button>

          {/* Back button */}
          <button
            onClick={() => window.location.href = "/personal"}
            className="mt-4 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Volver al inicio
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
