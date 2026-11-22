// Small app mockups for /producto (and reused on /como-funciona). Plain JSX + Tailwind, in the
// style of components/marketing/Previews.tsx. Every number and name is sample data and each
// mockup says so. They are pictures: one label for screen readers, the inside is hidden.
import type { ReactNode } from "react";
import {
  ShoppingCart, FileText, Repeat, Landmark, Tag, CheckCircle2, Sparkles, Receipt, CalendarClock,
  Download, Camera, Check, Circle, Lock, Send, Users, MessageCircle, Eye, X,
  Briefcase, Car, Home, Bell, Target, Plus, Dumbbell, Tv, Music, Cloud,
} from "lucide-react";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { ReportPreview } from "@/components/marketing/Previews";
import { useCopy } from "@/i18n/useI18n";
import { productoCopy } from "@/i18n/copy/site/producto";
import { FileLogo } from "@/components/FileLogo";

function useMock() {
  return useCopy(productoCopy).mock;
}

export const mockCard = "rounded-2xl bg-white shadow-[0_2px_4px_rgba(15,23,42,0.06),0_28px_60px_-22px_rgba(15,23,42,0.45)] ring-1 ring-slate-200";

export function MockSample() {
  const m = useMock();
  return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{m.sample}</span>;
}

/** Where every mockup sits: no box behind it, only the cards and their shadow. A picture for screen readers: one label, nothing inside. */
export function MockStage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative mx-auto w-full max-w-md p-4 sm:p-7 lg:max-w-lg">
      <div aria-hidden className="relative">{children}</div>
    </div>
  );
}

/** A second card that overlaps the bottom of the first one, inside the stage (never past the screen edge). */
function Overlap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative -mt-5 ml-auto w-[90%] sm:w-[80%] ${className}`}>{children}</div>;
}

function CardHead({ icon, title, right }: { icon: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-slate-900">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
        <span className="truncate">{title}</span>
      </span>
      {right ?? <MockSample />}
    </div>
  );
}

// ── Business: get paid and clients ──
export function PosMock() {
  const m = useMock().pos;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<ShoppingCart className="h-4 w-4" />} title={m.title} />
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">AT</span>
          <div className="leading-tight">
            <p className="text-[9.5px] text-slate-500">{m.client}</p>
            <p className="text-[12px] font-semibold text-slate-900">{m.clientName}</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {m.lines.map(([name, price]) => (
            <li key={name} className="flex items-center justify-between gap-2 text-[12px] text-slate-700">
              <span className="truncate">{name}</span>
              <span className="tabular-nums">{price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <span className="text-[12px] font-semibold text-slate-500">{m.total}</span>
          <span className="text-[20px] font-extrabold tracking-tight tabular-nums text-slate-900">$630.00</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {m.methods.map((t, i) => (
            <span key={t} className={`rounded-lg py-1.5 text-center text-[11px] font-semibold ${i === 1 ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}>{t}</span>
          ))}
        </div>
        <p className="mt-2.5 rounded-xl bg-blue-600 py-2.5 text-center text-[12.5px] font-semibold text-white shadow-md shadow-blue-600/20">{m.charge}</p>
      </div>
      <Overlap>
        <div className={`${mockCard} p-3.5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-slate-900"><FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{m.quote}</span></span>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{m.accepted}</span>
          </div>
          <p className="mt-2 inline-flex rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">{m.convert}</p>
          <div className="mt-2.5 flex items-start gap-1.5 border-t border-slate-100 pt-2.5">
            <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-semibold text-slate-800">{m.recurring}</p>
              <p className="text-[10px] text-slate-500">{m.recurringText}</p>
            </div>
          </div>
        </div>
      </Overlap>
    </MockStage>
  );
}

// ── Business: bank, expenses and receipts ──
export function BankMock() {
  const m = useMock().bank;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead
          icon={<Landmark className="h-4 w-4" />}
          title={m.title}
          right={<img src="/brands/banks/chase.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-md bg-white object-contain p-[2px] ring-1 ring-slate-200" />}
        />
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
          <img src="/brands/plaid-mark.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />{m.connected}
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {m.rows.map(([who, amt, cat]) => {
            const income = amt.startsWith("+");
            return (
              <li key={who} className="flex items-center justify-between gap-2.5 py-2">
                <MerchantLogo name={who} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-900">{who}</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"><Tag className="h-2.5 w-2.5" />{cat}</span>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className={`text-[12px] font-semibold tabular-nums ${income ? "text-emerald-600" : "text-slate-900"}`}>{amt}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 flex items-center gap-1.5 text-[10.5px] font-medium text-blue-700"><Sparkles className="h-3.5 w-3.5" />{m.auto}</p>
      </div>
      <div className="relative -mt-4 grid gap-2.5 px-2 sm:grid-cols-2 sm:px-3">
        <div className={`${mockCard} flex gap-2.5 p-3`}>
          {/* A paper receipt, drawn */}
          <div className="relative h-[66px] w-[46px] shrink-0 rounded-sm bg-white px-1.5 pt-1.5 shadow-sm ring-1 ring-slate-200">
            {/* The store's logo at the top of the paper, like a real receipt. */}
            <MerchantLogo name={m.receiptWho} size={16} className="mx-auto" />
            <span className="mt-1.5 block h-0.5 w-8 rounded bg-slate-200" />
            <span className="mt-1 block h-0.5 w-7 rounded bg-slate-200" />
            <span className="mt-1 block h-0.5 w-8 rounded bg-slate-200" />
            <span className="mt-1.5 block h-1 w-5 rounded bg-slate-400" />
            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-2.5 w-2.5" /></span>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Receipt className="h-3 w-3" />{m.receipt}</p>
            <p className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-900">{m.receiptWho}</p>
            <p className="text-[10px] text-slate-500">{m.receiptCat}</p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-700">{m.saved}</p>
          </div>
        </div>
        <div className={`${mockCard} p-3`}>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><CalendarClock className="h-3 w-3" />{m.bill}</p>
          <p className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-900">{m.billWho}</p>
          <p className="text-[10px] font-medium text-amber-700">{m.billDue}</p>
          <p className="mt-1.5 inline-flex rounded-lg border border-slate-200 px-2 py-1 text-[10.5px] font-semibold text-slate-800">{m.markPaid}</p>
        </div>
      </div>
    </MockStage>
  );
}

// ── Business: reports and accountant ──
export function ReportsMock() {
  const m = useMock().reports;
  return (
    <MockStage label={m.aria}>
      <ReportPreview />
      <Overlap>
        <div className={`${mockCard} p-3.5`}>
          <div className="flex items-center gap-2">
            <FileLogo kind="excel" className="h-8 w-8" />
            <div className="min-w-0 leading-tight">
              <p className="text-[12px] font-bold text-slate-900">{m.title}</p>
              <p className="truncate text-[10px] text-slate-500">{m.period} · {m.text}</p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <span className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 text-[11px] font-semibold text-white"><Download className="h-3 w-3" />{m.excel}</span>
            <span className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-[11px] font-semibold text-slate-800"><FileLogo kind="pdf" className="h-3.5 w-3.5" />{m.pdf}</span>
          </div>
        </div>
      </Overlap>
    </MockStage>
  );
}

// ── Taxes (business and personal) ──
export function TaxMock({ mode }: { mode: "business" | "personal" }) {
  const m = useMock().tax;
  const docs = mode === "business" ? m.docsBusiness : m.docsPersonal;
  const current = 1;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<FileText className="h-4 w-4" />} title={m.title} />
        <p className="mt-1 pl-9 text-[10.5px] text-slate-500">{m.sub}</p>
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[10.5px] font-medium leading-snug text-emerald-800">{m.free}</p>
        <ol className="mt-3">
          {m.steps.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={s} className="relative flex items-center gap-2.5 pb-2.5 last:pb-0">
                {i < m.steps.length - 1 && <span className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${done ? "bg-emerald-400" : "bg-slate-200"}`} />}
                <span className={`relative grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full ${done ? "bg-emerald-500 text-white" : now ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-white text-slate-300 ring-1 ring-slate-200"}`}>
                  {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 fill-current" />}
                </span>
                <span className={`text-[11.5px] ${now ? "font-bold text-slate-900" : done ? "font-medium text-slate-700" : "text-slate-400"}`}>{s}</span>
                {now && <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[9.5px] font-semibold text-blue-700">{m.now}</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 pl-[29px] text-[10px] text-slate-400">{m.later}</p>
      </div>
      <Overlap>
        <div className={`${mockCard} p-3.5`}>
          <p className="text-[12px] font-bold text-slate-900">{m.docs}</p>
          <ul className="mt-1.5 space-y-1">
            {docs.map((d) => (
              <li key={d} className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                <span className="truncate">{d}</span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{m.uploaded}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Camera className="h-3 w-3" />{m.photo}</span>
            <span className="truncate text-[10px] text-slate-500">{m.past}: 2025 · 2024</span>
          </div>
        </div>
      </Overlap>
    </MockStage>
  );
}

// ── AI assistant (business and personal) ──
export function AssistantMock({ mode }: { mode: "business" | "personal" }) {
  const m = useMock().assistant;
  const chat = m[mode];
  return (
    <MockStage label={mode === "business" ? m.ariaBusiness : m.ariaPersonal}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead
          icon={<Sparkles className="h-4 w-4" />}
          title={m.title}
          right={<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"><Lock className="h-2.5 w-2.5" />{m.readOnly}</span>}
        />
        <div className="mt-4 flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-[12px] font-medium text-white">{chat.q}</p>
        </div>
        <div className="mt-2.5 max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2.5">
          <p className="text-[12px] leading-snug text-slate-800">{chat.a}</p>
          <ul className="mt-2 space-y-1.5">
            {chat.rows.map(([k, v, pct]) => (
              <li key={k}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-slate-700">{k}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{v}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <span className="flex-1 truncate text-[11.5px] text-slate-400">{m.placeholder}</span>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white"><Send className="h-3.5 w-3.5" /></span>
        </div>
        <p className="mt-2 text-[9.5px] text-slate-400">{m.disclaimer}</p>
      </div>
    </MockStage>
  );
}

// ── Business: team and permissions ──
const roleChip: Record<string, string> = {
  owner: "bg-slate-900 text-white",
  staff: "bg-blue-50 text-blue-700",
  accountant: "bg-violet-50 text-violet-700",
};

export function TeamMock() {
  const m = useMock().team;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<Users className="h-4 w-4" />} title={m.title} />
        <p className="mt-1 pl-9 text-[10.5px] text-slate-500">{m.seats}</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {m.members.map(([name, role, kind]) => (
            <li key={name} className="flex items-center gap-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10.5px] font-bold text-slate-700">
                {name.split(" ").map((w) => w[0]).join("")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-900">{name}</span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleChip[kind]}`}>
                {kind === "accountant" && <Eye className="h-2.5 w-2.5" />}{role}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"><Plus className="h-3 w-3" />{m.invite}</span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><MessageCircle className="h-3 w-3 text-emerald-600" />{m.whatsapp}</span>
        </div>
      </div>
      <Overlap>
        <div className={`${mockCard} grid grid-cols-2 gap-3 p-3.5`}>
          {[
            { title: m.staff, can: m.staffCan, cant: m.staffCant },
            { title: m.accountant, can: m.accountantCan, cant: m.accountantCant },
          ].map((r) => (
            <div key={r.title} className="min-w-0">
              <p className="text-[11.5px] font-bold text-slate-900">{r.title}</p>
              <ul className="mt-1 space-y-0.5">
                {r.can.map((t) => (
                  <li key={t} className="flex items-start gap-1 text-[10px] leading-snug text-slate-600"><Check className="mt-px h-3 w-3 shrink-0 text-emerald-600" />{t}</li>
                ))}
                <li className="flex items-start gap-1 text-[10px] leading-snug text-slate-400"><X className="mt-px h-3 w-3 shrink-0 text-slate-400" />{r.cant}</li>
              </ul>
            </div>
          ))}
        </div>
      </Overlap>
    </MockStage>
  );
}

// ── Personal: bank and transactions ──
const txIcons = { work: Briefcase, cart: ShoppingCart, home: Home, car: Car } as const;

export function PersonalBankMock() {
  const m = useMock().personalBank;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<Landmark className="h-4 w-4" />} title={m.title} />
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
          <img src="/brands/banks/chase.png" alt="" width={16} height={16} className="h-4 w-4 rounded bg-white object-contain p-px ring-1 ring-slate-200" />
          {m.connected} · {m.month}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {m.summary.map(([k, v], i) => (
            <div key={k} className="rounded-xl border border-slate-200 px-2 py-1.5">
              <p className="text-[9.5px] text-slate-500">{k}</p>
              <p className={`text-[13px] font-extrabold tabular-nums tracking-tight ${i === 2 ? "text-emerald-600" : "text-slate-900"}`}>{v}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {m.rows.map(([who, cat, amt, kind]) => {
            const Icon = txIcons[kind as keyof typeof txIcons];
            const income = amt.startsWith("+");
            return (
              <li key={who} className="flex items-center gap-2.5 py-2">
                <MerchantLogo name={who} size={32}
                  fallback={<span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${income ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}><Icon className="h-4 w-4" /></span>} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-900">{who}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Tag className="h-2.5 w-2.5" />{cat}</span>
                </div>
                <span className={`text-[12px] font-semibold tabular-nums ${income ? "text-emerald-600" : "text-slate-900"}`}>{amt}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </MockStage>
  );
}

// ── Personal: subscriptions ──
const subIcons = [Dumbbell, Tv, Music, Cloud];

export function SubscriptionsMock() {
  const m = useMock().subs;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<Repeat className="h-4 w-4" />} title={m.title} />
        <p className="mt-1 pl-9 text-[10.5px] text-slate-500">{m.count}</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {m.rows.map(([name, meta, amt], i) => {
            const Icon = subIcons[i];
            return (
              <li key={name} className={`flex items-center gap-2.5 py-2 ${i === 0 ? "-mx-2 rounded-xl bg-amber-50/70 px-2" : ""}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-900">{name}</p>
                  <p className="truncate text-[10px] text-slate-500">{meta}</p>
                </div>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-900">{amt}<span className="text-[10px] font-normal text-slate-500">{m.perMonth}</span></span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
          <span className="text-[10.5px] font-medium text-emerald-800">{m.total}</span>
          <span className="text-[14px] font-extrabold tabular-nums text-emerald-700">{m.totalValue}</span>
        </div>
      </div>
      <Overlap>
        <div className={`${mockCard} p-3.5`}>
          <p className="text-[12px] font-bold text-slate-900">{m.cancelTitle}</p>
          <div className="mt-2 flex gap-1 overflow-hidden">
            {m.tabs.map((t, i) => (
              <span key={t} className={`truncate rounded-md px-2 py-1 text-[9.5px] font-semibold ${i === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{t}</span>
            ))}
          </div>
          <ol className="mt-2 space-y-1">
            {[0, 1, 2].map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-50 text-[9px] font-bold text-blue-700">{k + 1}</span>
                <span className={`h-1.5 rounded-full bg-slate-200 ${k === 0 ? "w-3/4" : k === 1 ? "w-2/3" : "w-1/2"}`} />
              </li>
            ))}
          </ol>
        </div>
      </Overlap>
    </MockStage>
  );
}

// ── Personal: goals and budgets ──
const budgetTone = {
  ok: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  near: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  over: { bar: "bg-red-500", chip: "bg-red-50 text-red-700" },
} as const;

export function BudgetsMock() {
  const m = useMock().budgets;
  return (
    <MockStage label={m.aria}>
      <div className={`${mockCard} p-4 sm:p-5`}>
        <CardHead icon={<Target className="h-4 w-4" />} title={m.title} />
        <p className="mt-1 pl-9 text-[10.5px] text-slate-500">{m.month}</p>
        <ul className="mt-3 space-y-3">
          {m.rows.map(([cat, spent, pct, status]) => (
            <li key={cat}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-slate-900">{cat}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${budgetTone[status].chip}`}>{m.status[status]}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${budgetTone[status].bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">{spent}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[10.5px] font-medium text-amber-900"><Bell className="h-3.5 w-3.5 shrink-0 text-amber-600" />{m.alert}</p>
      </div>
      <Overlap>
        <div className={`${mockCard} p-3.5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-900"><Target className="h-3.5 w-3.5 text-blue-600" />{m.goal}</span>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1 text-[10.5px] font-semibold text-slate-800"><Plus className="h-3 w-3" />{m.add}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[68%] rounded-full bg-blue-600" /></div>
          <p className="mt-1 text-[10px] tabular-nums text-slate-500">{m.goalText}</p>
        </div>
      </Overlap>
    </MockStage>
  );
}
