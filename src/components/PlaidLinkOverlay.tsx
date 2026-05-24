import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, ShieldCheck, ArrowRight, Wallet, CheckCircle } from "lucide-react";

interface PlaidLinkOverlayProps {
  onSuccess?: () => void;
  onClose?: () => void;
  variant?: "modal" | "inline";
}

export function PlaidLinkOverlay({ onSuccess, onClose, variant = "modal" }: PlaidLinkOverlayProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "connecting" | "done">("intro");

  const utils = trpc.useUtils();

  // Fetch link token
  const createLinkTokenMut = trpc.bank.createLinkToken.useMutation({
    onSuccess: (data) => {
      if (data?.linkToken) {
        setLinkToken(data.linkToken);
      } else {
        toast.error("No se pudo iniciar la conexion con el banco");
        setStep("intro");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Error al conectar con Plaid");
      setStep("intro");
    },
  });

  const exchangeMutation = trpc.bank.exchangePublicToken.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setStep("done");
        toast.success(`Banco conectado! ${data.accountCount} cuenta(s) vinculada(s).`);
        utils.invalidate();
      } else {
        toast.error(data.error || "Error al conectar el banco");
        setStep("intro");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Error al conectar el banco");
      setStep("intro");
    },
  });

  const onPlaidSuccess = useCallback(
    (publicToken: string) => {
      setStep("connecting");
      exchangeMutation.mutate({ publicToken });
    },
    [exchangeMutation]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => {
      // User closed Plaid without completing - go back to intro
      setStep("intro");
    },
  });

  // Auto-open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && ready && step === "connecting" && open) {
      open();
    }
  }, [linkToken, ready, step, open]);

  const isBusy = createLinkTokenMut.isPending || exchangeMutation.isPending;

  const handleStart = () => {
    // Show loading state immediately
    setStep("connecting");
    if (!linkToken) {
      // Create a new link token - the useEffect will open Plaid when ready
      createLinkTokenMut.mutate();
    } else {
      // Already have a token - the useEffect will open Plaid immediately
    }
  };

  const isModal = variant === "modal";

  return (
    <div className={isModal ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" : "absolute inset-0 z-40 flex items-center justify-center bg-white p-4"}>
      <div className={isModal ? "bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" : "bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-md overflow-hidden"}>
        {/* Header */}
        <div className="bg-black p-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Conectar Banco</h2>
              <p className="text-xs text-neutral-400">Sincroniza tus transacciones automaticamente</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "intro" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-black">Seguro y Encriptado</p>
                    <p className="text-xs text-neutral-500">Tus credenciales bancarias nunca se almacenan. Usamos encriptacion de nivel bancario.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <Wallet className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-black">Contabilidad Automatica</p>
                    <p className="text-xs text-neutral-500">Tus transacciones se clasifican automaticamente y generan asientos contables.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <ArrowRight className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-black">Sincronizacion en Tiempo Real</p>
                    <p className="text-xs text-neutral-500">Cada transaccion se refleja instantaneamente en tu contabilidad.</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleStart}
                disabled={!ready && !linkToken ? isBusy : false}
                className="w-full bg-black hover:bg-neutral-800 text-white h-11 rounded-xl text-sm"
              >
                {isBusy ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cargando...</>
                ) : (
                  <><Landmark className="w-4 h-4 mr-2" /> Conectar mi Banco</>
                )}
              </Button>

              {onClose && isModal && (
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isBusy}
                  className="w-full text-neutral-500 hover:text-black h-9 text-xs"
                >
                  Omitir por ahora
                </Button>
              )}
            </div>
          )}

          {step === "connecting" && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-black mx-auto mb-4" />
              <p className="text-sm font-medium text-black">Conectando con tu banco...</p>
              <p className="text-xs text-neutral-500 mt-1">Esto puede tomar unos segundos</p>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
              <p className="text-sm font-medium text-black">¡Banco conectado!</p>
              <p className="text-xs text-neutral-500 mt-1 mb-4">Tus transacciones se sincronizaran automaticamente</p>
              <Button
                onClick={() => { utils.invalidate(); onSuccess?.(); }}
                className="bg-black text-white hover:bg-neutral-800"
              >
                <ArrowRight className="w-4 h-4 mr-1.5" /> Ir al dashboard
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-100">
          <p className="text-[10px] text-neutral-400 text-center">
            Powered by Plaid · Encriptacion AES-256
          </p>
        </div>
      </div>
    </div>
  );
}
