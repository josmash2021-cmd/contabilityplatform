import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, ShieldCheck, ArrowRight, Wallet, CheckCircle } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { bankCopy } from "@/i18n/copy/bank";

interface PlaidLinkOverlayProps {
  onSuccess?: () => void;
  onClose?: () => void;
  variant?: "modal" | "inline";
}

export function PlaidLinkOverlay({ onSuccess, onClose, variant = "modal" }: PlaidLinkOverlayProps) {
  const { plaid: t } = useCopy(bankCopy);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "connecting" | "done">("intro");

  const utils = trpc.useUtils();

  // Fetch link token
  const createLinkTokenMut = trpc.bank.createLinkToken.useMutation({
    onSuccess: (data) => {
      if (data?.linkToken) {
        setLinkToken(data.linkToken);
      } else {
        toast.error(t.startError);
        setStep("intro");
      }
    },
    onError: (err) => {
      toast.error(err.message || t.plaidError);
      setStep("intro");
    },
  });

  const exchangeMutation = trpc.bank.exchangePublicToken.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setStep("done");
        toast.success(t.connected(data.accountCount));
        utils.invalidate();
      } else {
        toast.error("code" in data && data.code === "bank_limit" ? t.bankLimit(data.limit) : data.error || t.connectError);
        setStep("intro");
      }
    },
    onError: (err) => {
      toast.error(err.message || t.connectError);
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
              <h2 className="text-lg font-semibold">{t.title}</h2>
              <p className="text-xs text-neutral-400">{t.subtitle}</p>
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
                    <p className="text-sm font-medium text-black">{t.secureTitle}</p>
                    <p className="text-xs text-neutral-500">{t.secureText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <Wallet className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-black">{t.autoTitle}</p>
                    <p className="text-xs text-neutral-500">{t.autoText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <ArrowRight className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-black">{t.realtimeTitle}</p>
                    <p className="text-xs text-neutral-500">{t.realtimeText}</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleStart}
                disabled={!ready && !linkToken ? isBusy : false}
                className="w-full bg-black hover:bg-neutral-800 text-white h-11 rounded-xl text-sm"
              >
                {isBusy ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t.loading}</>
                ) : (
                  <><Landmark className="w-4 h-4 mr-2" /> {t.connect}</>
                )}
              </Button>

              {onClose && isModal && (
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isBusy}
                  className="w-full text-neutral-500 hover:text-black h-9 text-xs"
                >
                  {t.skip}
                </Button>
              )}
            </div>
          )}

          {step === "connecting" && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-black mx-auto mb-4" />
              <p className="text-sm font-medium text-black">{t.connecting}</p>
              <p className="text-xs text-neutral-500 mt-1">{t.connectingHint}</p>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
              <p className="text-sm font-medium text-black">{t.doneTitle}</p>
              <p className="text-xs text-neutral-500 mt-1 mb-4">{t.doneText}</p>
              <Button
                onClick={() => { utils.invalidate(); onSuccess?.(); }}
                className="bg-black text-white hover:bg-neutral-800"
              >
                <ArrowRight className="w-4 h-4 mr-1.5" /> {t.goToDashboard}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-100">
          <p className="text-[10px] text-neutral-400 text-center">
            {t.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
