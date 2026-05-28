import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, Link2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Load Plaid Link SDK dynamically
function loadPlaidSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Plaid SDK"));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    Plaid: any;
  }
}

export default function PersonalBank() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const createLinkMut = trpc.bank.createLinkToken.useMutation({
    onSuccess: (data) => {
      if (data.success && data.linkToken) {
        setLinkToken(data.linkToken);
        setStatus("ready");
        toast.success("Listo para conectar");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Error al iniciar conexion");
        toast.error(data.error || "Error al iniciar conexion");
      }
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message);
      toast.error(err.message);
    },
  });

  const exchangeMut = trpc.bank.exchangePublicToken.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setStatus("success");
        toast.success("Banco conectado exitosamente");
        setTimeout(() => window.location.href = "/personal", 1500);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Error al conectar");
        toast.error(data.error || "Error al conectar");
      }
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message);
      toast.error(err.message);
    },
  });

  const openPlaidLink = useCallback(async () => {
    if (!linkToken) {
      // First get the token
      setStatus("loading");
      createLinkMut.mutate();
      return;
    }

    try {
      await loadPlaidSdk();
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (public_token: string) => {
          exchangeMut.mutate({ publicToken: public_token });
        },
        onExit: (err: any) => {
          if (err != null) {
            console.error("Plaid exit error:", err);
            setStatus("idle");
          }
        },
        onEvent: (eventName: string) => {
          console.log("Plaid event:", eventName);
        },
      });
      handler.open();
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message);
      toast.error(err.message);
    }
  }, [linkToken, createLinkMut, exchangeMut]);

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

          {/* Error display */}
          {status === "error" && (
            <div className="flex items-center gap-2 justify-center mb-6 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Security note */}
          <div className="flex items-center gap-2 justify-center mb-6 p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">
              Tus datos estan protegidos con encriptacion de nivel bancario
            </p>
          </div>

          {/* Connect button */}
          <Button
            onClick={openPlaidLink}
            disabled={status === "loading" || status === "success"}
            className="w-full h-12 bg-black text-white rounded-xl hover:bg-neutral-800 text-sm font-medium"
          >
            {status === "loading" ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando...</>
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
