import { Card, CardContent } from "@/components/ui/card";
import { Landmark } from "lucide-react";
import { useNavigate } from "react-router";

export default function BankConnectPrompt() {
  const navigate = useNavigate();

  return (
    <Card className="rounded-xl shadow-none mb-4 border-2 border-dashed border-neutral-200 bg-white">
      <CardContent className="p-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
            <Landmark className="w-7 h-7 text-neutral-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-black">Conectar tu banco</p>
            <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
              Conecta tu cuenta para ver transacciones automaticas y balance en tiempo real.
            </p>
          </div>
          <button
            onClick={() => navigate("/personal/bank")}
            className="h-10 px-6 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shrink-0"
          >
            Conectar
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
