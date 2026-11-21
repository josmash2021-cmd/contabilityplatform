// /como-funciona: pictures for steps 4 and 5, the same size and frame as the home page's
// step previews (SignupStepPreview, ConnectStepPreview, NumbersStepPreview). Sample data.
import type { ReactNode } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Receipt, ShoppingCart } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { comoFuncionaCopy } from "@/i18n/copy/site/comoFunciona";

const cardBase = "rounded-2xl bg-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70";
const cardCls = `${cardBase} p-4`;

function MockSample() {
  const label = useCopy(comoFuncionaCopy).steps.visuals.sample;
  return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{label}</span>;
}

function StepFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative mx-auto flex h-80 w-full max-w-sm items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/70 p-5">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.08),transparent_60%)]" />
      <div aria-hidden className="relative w-full max-w-[260px]">{children}</div>
    </div>
  );
}

/** Step 4: a sale at the point of sale and a receipt saved as an expense. */
export function ChargeStepVisual() {
  const v = useCopy(comoFuncionaCopy).steps.visuals.charge;
  return (
    <StepFrame label={v.aria}>
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900"><ShoppingCart className="h-4 w-4 text-blue-600" />{v.title}</span>
          <MockSample />
        </div>
        <p className="mt-2.5 text-[11px] font-semibold text-slate-900">{v.client}</p>
        <p className="truncate text-[10px] text-slate-500">{v.service}</p>
        <p className="mt-1 text-[22px] font-extrabold tracking-tight tabular-nums text-slate-900">$630.00</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {v.methods.map((m, i) => (
            <span key={m} className={`rounded-md py-1 text-center text-[10px] font-semibold ${i === 1 ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}>{m}</span>
          ))}
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[11px] font-semibold text-white"><CheckCircle2 className="h-3.5 w-3.5" />{v.done}</p>
      </div>
      <div className={`${cardBase} relative -mt-3 ml-6 flex items-center gap-2.5 p-3`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><Receipt className="h-4 w-4" /></span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-semibold text-slate-900">{v.receipt}</p>
          <p className="text-[10px] text-slate-500">{v.receiptText}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{v.saved}</p>
        </div>
      </div>
    </StepFrame>
  );
}

/** Step 5: the month's numbers, the tax return's progress and the files for the accountant. */
export function ReportsStepVisual() {
  const v = useCopy(comoFuncionaCopy).steps.visuals.reports;
  return (
    <StepFrame label={v.aria}>
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-slate-900">{v.title}</span>
          <MockSample />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {v.kpis.map(([k, val], i) => (
            <div key={k} className="rounded-lg border border-slate-200 px-1.5 py-1.5">
              <p className="text-[9px] text-slate-500">{k}</p>
              <p className={`text-[11.5px] font-extrabold tabular-nums tracking-tight ${i === 2 ? "text-emerald-600" : "text-slate-900"}`}>{val}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="truncate text-[11px] font-semibold text-slate-900">{v.tax}</span>
            <span className="ml-auto shrink-0 text-[9px] text-slate-500">{v.taxSub}</span>
          </div>
          <div className="mt-1.5 flex gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < 1 ? "bg-emerald-500" : i === 1 ? "bg-blue-600" : "bg-slate-200"}`} />
            ))}
          </div>
          <p className="mt-1 text-[10px] font-medium text-blue-700">{v.taxStep}</p>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-900">{v.accountant}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-1 text-[9.5px] font-semibold text-white"><Download className="h-2.5 w-2.5" />{v.excel}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 px-1.5 py-1 text-[9.5px] font-semibold text-slate-700"><Download className="h-2.5 w-2.5" />{v.pdf}</span>
        </div>
      </div>
    </StepFrame>
  );
}
