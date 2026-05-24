import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const forgotMut = trpc.auth.forgotPassword.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        setStep("code");
      } else {
        toast.error(data.error || "Error");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const resetMut = trpc.auth.resetPassword.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Contrasena actualizada");
        setStep("success");
      } else {
        toast.error(data.error || "Error");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Ingresa tu email"); return; }
    forgotMut.mutate({ email });
  };

  const handleVerifyAndReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) { toast.error("Codigo de 6 digitos requerido"); return; }
    if (!newPassword || newPassword.length < 6) { toast.error("Minimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Las contrasenas no coinciden"); return; }
    resetMut.mutate({ email, code, newPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-medium text-black">Accounting Platform</h1>
          <p className="text-neutral-400 text-sm">
            {step === "email" && "Recupera tu contrasena"}
            {step === "code" && "Verifica el codigo"}
            {step === "success" && "Contrasena actualizada"}
          </p>
        </div>

        <Card className="border-neutral-200 rounded-lg shadow-none">
          <CardContent className="p-6">
            {step === "email" && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <Label className="text-xs text-neutral-500">Email de tu cuenta</Label>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 rounded-lg border-neutral-200"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1.5">
                    Si tienes una cuenta registrada, recibiras un codigo de verificacion.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={forgotMut.isPending}
                  className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10"
                >
                  {forgotMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Enviar Codigo
                </Button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleVerifyAndReset} className="space-y-4">
                <div>
                  <Label className="text-xs text-neutral-500">Codigo de verificacion</Label>
                  <Input
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 rounded-lg border-neutral-200 text-center tracking-[0.5em]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-neutral-500">Nueva contrasena</Label>
                  <Input
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 rounded-lg border-neutral-200"
                  />
                </div>
                <div>
                  <Label className="text-xs text-neutral-500">Confirmar nueva contrasena</Label>
                  <Input
                    type="password"
                    placeholder="Repite la contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 rounded-lg border-neutral-200"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={resetMut.isPending}
                  className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10"
                >
                  {resetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Actualizar Contrasena
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("email")}
                  className="w-full border-neutral-200 text-neutral-600 rounded-lg h-10"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Volver
                </Button>
              </form>
            )}

            {step === "success" && (
              <div className="text-center space-y-4">
                <p className="text-sm text-neutral-600">Tu contrasena ha sido actualizada exitosamente.</p>
                <Link to="/login">
                  <Button className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10">
                    Iniciar Sesion
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {step !== "success" && (
          <p className="text-xs text-neutral-400 text-center">
            <Link to="/login" className="text-black hover:underline font-medium flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Volver al login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
