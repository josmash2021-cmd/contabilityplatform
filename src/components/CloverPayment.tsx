import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Check, X, Wifi, WifiOff, Receipt, AlertTriangle, Info } from "lucide-react";

interface CloverPaymentProps {
  amount: number;
  note?: string;
  onSuccess: () => void;
  onCancel: () => void;
  merchantId?: string;
  deviceId?: string;
}

type Status = "idle" | "connecting" | "connected" | "sending" | "processing" | "completed" | "failed" | "error";

// ─── WebSocket connection to Clover device ───
async function findCloverOnNetwork(): Promise<string | null> {
  const baseIps = ["192.168.1", "192.168.0", "10.0.0"];
  for (const base of baseIps) {
    for (let i = 1; i <= 10; i++) {
      const ip = `${base}.${i}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        const res = await fetch(`https://${ip}:12345/`, { 
          method: "HEAD", 
          signal: controller.signal 
        }).catch(() => null);
        clearTimeout(timeout);
        if (res) return ip;
      } catch {
        // Continue
      }
    }
  }
  return null;
}

function connectToClover(ip: string, merchantId: string): WebSocket {
  return new WebSocket(`wss://${ip}:12345/remote_pay`);
}

export default function CloverPayment({ amount, note, onSuccess, onCancel, merchantId, deviceId }: CloverPaymentProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [cloverIp, setCloverIp] = useState("");
  const [savedIp, setSavedIp] = useState(localStorage.getItem("clover_ip") || "");
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // Safe state setter that checks if component is still mounted
  const safeSetStatus = useCallback((s: Status) => {
    if (isMountedRef.current) setStatus(s);
  }, []);

  const safeSetMessage = useCallback((m: string) => {
    if (isMountedRef.current) setMessage(m);
  }, []);

  // Auto-detect Clover on mount
  useEffect(() => {
    if (savedIp) {
      setCloverIp(savedIp);
      connectAndPay(savedIp);
    } else {
      setStatus("idle");
      setMessage("Configurando conexion con Clover...");
      detectAndConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectAndConnect = async () => {
    safeSetStatus("connecting");
    safeSetMessage("Buscando terminal Clover en la red...");
    
    const ip = await findCloverOnNetwork();
    if (ip) {
      if (!isMountedRef.current) return;
      setCloverIp(ip);
      localStorage.setItem("clover_ip", ip);
      setSavedIp(ip);
      connectAndPay(ip);
    } else {
      safeSetStatus("idle");
      safeSetMessage("No se encontro el Clover automaticamente. Ingresa la IP manualmente.");
    }
  };

  const connectAndPay = (ip: string) => {
    if (!merchantId) {
      safeSetStatus("error");
      safeSetMessage("Clover no esta configurado. Ve a Ajustes primero.");
      return;
    }

    safeSetStatus("connecting");
    safeSetMessage(`Conectando a Clover en ${ip}...`);

    try {
      const ws = connectToClover(ip, merchantId);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        console.log("[Clover] WebSocket connected");
        safeSetStatus("connected");
        safeSetMessage("Conectado al Clover. Enviando pago...");
        
        // Send configuration
        ws.send(JSON.stringify({
          type: "CONFIG",
          merchantId: merchantId,
          remoteApplicationId: "com.accounting.pos",
          deviceId: deviceId,
        }));

        // Send sale request after a short delay
        timeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          const amountCents = Math.round(amount * 100);
          ws.send(JSON.stringify({
            type: "SALE_REQUEST",
            amount: amountCents,
            externalId: `cont-${Date.now()}`,
            autoAcceptSignature: true,
            autoAcceptPayment: true,
          }));
          safeSetStatus("processing");
          safeSetMessage(`$${amount.toFixed(2)} enviado al Clover. Pide al cliente que pague.`);
        }, 500);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          console.log("[Clover] Message:", msg.type, msg);
          
          switch (msg.type) {
            case "PAIRING_CODE":
              safeSetStatus("idle");
              safeSetMessage(`Codigo de emparejamiento: ${msg.pairingCode}. Ingresalo en el Clover.`);
              break;
            case "PAIRING_SUCCESS":
              safeSetMessage("Emparejamiento exitoso! Enviando pago...");
              break;
            case "SALE_RESPONSE":
              if (msg.success) {
                safeSetStatus("completed");
                safeSetMessage("Pago completado exitosamente!");
                toast.success("Pago Clover completado");
                timeoutRef.current = setTimeout(() => {
                  if (isMountedRef.current) onSuccess();
                }, 1000);
              } else {
                safeSetStatus("failed");
                safeSetMessage(msg.message || "El pago fue rechazado o cancelado.");
                toast.error("Pago Clover fallido");
              }
              break;
            case "PAYMENT_CONFIRMED":
              safeSetStatus("completed");
              safeSetMessage("Pago confirmado!");
              toast.success("Pago confirmado");
              timeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) onSuccess();
              }, 500);
              break;
            case "ERROR":
              safeSetStatus("error");
              safeSetMessage(`Error: ${msg.message || "Conexion fallida"}`);
              break;
            default:
              console.log("[Clover] Unhandled message:", msg);
          }
        } catch (e) {
          console.log("[Clover] Raw message:", event.data);
        }
      };

      ws.onerror = (err) => {
        console.error("[Clover] WebSocket error:", err);
        wsRef.current = null;
        if (!isMountedRef.current) return;
        safeSetStatus("error");
        safeSetMessage("No se pudo conectar al Clover. Intenta con la IP manual.");
      };

      ws.onclose = () => {
        console.log("[Clover] WebSocket closed");
        wsRef.current = null;
        if (!isMountedRef.current) return;
        // Use functional update to avoid stale closure
        setStatus((currentStatus) => {
          if (currentStatus === "processing") {
            setMessage("Conexion perdida con el Clover durante el pago.");
            return "failed";
          }
          return currentStatus;
        });
      };
    } catch (e: any) {
      safeSetStatus("error");
      safeSetMessage(`Error de conexion: ${e.message}`);
    }
  };

  const handleManualConnect = () => {
    if (!cloverIp) {
      toast.error("Ingresa la IP del Clover");
      return;
    }
    localStorage.setItem("clover_ip", cloverIp);
    setSavedIp(cloverIp);
    connectAndPay(cloverIp);
  };

  const handleManualConfirm = () => {
    safeSetStatus("completed");
    onSuccess();
  };

  const handleCancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    onCancel();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center py-4 space-y-4">
        {/* Status Icon */}
        {(status === "idle" || status === "connecting") && (
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center animate-pulse">
            <Wifi className="w-8 h-8 text-neutral-600" />
          </div>
        )}
        {status === "connected" && (
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <Wifi className="w-8 h-8 text-blue-600" />
          </div>
        )}
        {status === "processing" && (
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse">
            <Receipt className="w-8 h-8 text-emerald-600" />
          </div>
        )}
        {status === "completed" && (
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
        )}
        {(status === "error" || status === "failed") && (
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-red-500" />
          </div>
        )}

        {/* Amount */}
        <div className="text-center">
          <p className="text-2xl font-semibold text-black">${amount.toFixed(2)}</p>
          {note && <p className="text-xs text-neutral-400 mt-1">{note}</p>}
        </div>

        {/* Status Message */}
        <div className="text-center max-w-xs">
          <p className="text-sm text-neutral-600">{message}</p>
          {status === "processing" && (
            <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-emerald-600" />
          )}
        </div>

        {/* Manual IP Input */}
        {(status === "idle" || status === "error" || status === "failed") && (
          <div className="w-full space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="IP del Clover (ej: 192.168.1.5)"
                value={cloverIp}
                onChange={(e) => setCloverIp(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
              <Button
                onClick={handleManualConnect}
                className="bg-black hover:bg-neutral-800 text-white h-10 text-xs"
              >
                Conectar
              </Button>
            </div>
            <p className="text-[10px] text-neutral-400 text-center">
              Ingresa la IP manualmente si la deteccion automatica falla
            </p>
          </div>
        )}

        {/* Processing info */}
        {status === "processing" && (
          <div className="bg-neutral-50 p-3 rounded-lg text-left w-full">
            <p className="text-[11px] text-neutral-600">
              En tu terminal Clover deberia aparecer el cobro. Pide al cliente que:<br/>
              1. Inserte o tapee su tarjeta<br/>
              2. Siga las instrucciones en pantalla<br/>
              3. Espere la confirmacion
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 border-neutral-200 text-neutral-600 h-9 text-xs"
          >
            Cancelar
          </Button>

          {(status === "idle" || status === "error" || status === "failed") && (
            <Button
              onClick={handleManualConfirm}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs"
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Confirmar pago manual
            </Button>
          )}

          {status === "completed" && (
            <Button
              onClick={onSuccess}
              className="flex-1 bg-black hover:bg-neutral-800 text-white h-9 text-xs"
            >
              Continuar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
