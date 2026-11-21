import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { money } from "./personalUtils";
import { pbtnPrimary, pinput, plabel } from "./planKit";
import type { Today } from "./planDates";
import type { SubItem } from "./SubDetailSheet";

type Freq = "week" | "month" | "year";

/**
 * The prototype's "Agregar una suscripción" (subAddPanel): something paid often that the bank doesn't show
 * (cash, another card). Name, how often, how much, the charge day (and month or weekday) and whether it's
 * paid through Apple or Google Play. A name already in the list is refused with what to do instead; one
 * removed earlier comes back with its history.
 */
export function SubAddSheet({ items, removed, today, onClose, onDone }: {
  items: readonly SubItem[];
  removed: ReadonlyArray<{ key: string; name: string }>;
  today: Today;
  onClose: () => void;
  onDone: (msg: string, undo?: () => void) => void;
}) {
  const t = useCopy(personalPagesCopy).subs.p;
  const a = t.add;
  const uid = useId();
  const [name, setName] = useState("");
  const [freq, setFreq] = useState<Freq>("month");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(10);
  const [month, setMonth] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [via, setVia] = useState<"" | "apple" | "google">("");
  const [err, setErr] = useState("");
  const add = trpc.subs.addManual.useMutation({ onError: (e) => setErr(e.message) });
  const setStatus = trpc.subs.setStatus.useMutation({ onError: (e) => setErr(e.message) });
  const removeManual = trpc.subs.removeManual.useMutation();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!nm) { setErr(a.errName); return; }
    if (!(amt > 0)) { setErr(a.errAmount); return; }
    const same = items.find((s) => s.name.trim().toLowerCase() === nm.toLowerCase());
    if (same) { setErr(same.status === "on" ? a.dupOn(same.name) : same.status === "pending" ? a.dupPending(same.name) : a.dupCancelled(same.name)); return; }
    const back = removed.find((s) => s.name.trim().toLowerCase() === nm.toLowerCase());
    if (back) {
      setStatus.mutate({ key: back.key, name: back.name, status: "on", today: today.key }, {
        onSuccess: () => onDone(t.toast.restored(back.name), () => setStatus.mutate({ key: back.key, name: back.name, status: "removed", today: today.key })),
      });
      return;
    }
    if (freq === "year" && day > new Date(Date.UTC(2028, month, 0)).getUTCDate()) { setErr(a.badDate); return; }
    setErr("");
    add.mutate({ name: nm, amount: amt, freq, day, month: freq === "year" ? month : null, weekday: freq === "week" ? weekday : null, via: via || null }, {
      onSuccess: (r) => onDone(t.toast.added(nm, money(amt, true), t.freq[freq].toLowerCase()), () => removeManual.mutate({ id: r.id })),
    });
  };

  const days = (max: number) => Array.from({ length: max }, (_, i) => i + 1);
  const busy = add.isPending || setStatus.isPending;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-base font-bold text-slate-900">{a.title}</SheetTitle>
          <SheetDescription className="text-sm text-slate-500">{a.sub}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="px-5 py-5">
          <label htmlFor={`${uid}-n`} className={plabel}>{a.name}</label>
          <input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} placeholder={a.namePh} autoComplete="off" maxLength={120} className={pinput} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-f`} className={plabel}>{a.freq}</label>
              <select id={`${uid}-f`} value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className={pinput}>
                <option value="week">{t.freq.week}</option><option value="month">{t.freq.month}</option><option value="year">{t.freq.year}</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-a`} className={plabel}>{a.amount}</label>
              <input id={`${uid}-a`} type="number" inputMode="decimal" min={0.5} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.99" className={pinput} />
            </div>
          </div>
          <div className="mt-3">
            {freq === "week" ? (
              <>
                <label htmlFor={`${uid}-w`} className={plabel}>{a.day}</label>
                <select id={`${uid}-w`} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={pinput}>
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{a.weekday(a.weekdays[w])}</option>)}
                </select>
              </>
            ) : freq === "year" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-d`} className={plabel}>{a.day}</label>
                  <select id={`${uid}-d`} value={day} onChange={(e) => setDay(Number(e.target.value))} className={pinput}>{days(31).map((d) => <option key={d} value={d}>{d}</option>)}</select>
                </div>
                <div>
                  <label htmlFor={`${uid}-m`} className={plabel}>{a.month}</label>
                  <select id={`${uid}-m`} value={month} onChange={(e) => setMonth(Number(e.target.value))} className={pinput}>{a.months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </div>
              </div>
            ) : (
              <>
                <label htmlFor={`${uid}-d`} className={plabel}>{a.day}</label>
                <select id={`${uid}-d`} value={Math.min(day, 28)} onChange={(e) => setDay(Number(e.target.value))} className={pinput}>{days(28).map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </>
            )}
          </div>
          <div className="mt-3">
            <label htmlFor={`${uid}-v`} className={plabel}>{a.via}</label>
            <select id={`${uid}-v`} value={via} onChange={(e) => setVia(e.target.value as "" | "apple" | "google")} className={pinput}>
              <option value="">{a.viaDirect}</option><option value="apple">{a.viaApple}</option><option value="google">{a.viaGoogle}</option>
            </select>
          </div>
          {err && <p className="mt-2 text-[13px] text-red-600" role="alert">{err}</p>}
          <div className="mt-3.5">
            <button type="submit" disabled={busy} className={pbtnPrimary}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{a.submit}</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
