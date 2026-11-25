// "Hazlo por mí" for a goal (owner, 2026-11-24): the bubble creates it in the real "Nueva meta" form and, at each
// part, stops and asks in its cloud with a suggestion from their bank (what's left each month, their savings), or
// "Sugiéreme todo" to fill the rest with the best for their numbers. It never decides alone: before pressing
// "Crear meta" it asks "¿La creo así?". The person can also answer by touching the form itself.
import type { BubbleTask } from "@contracts/bubble";
import type { Choice, ScriptKit } from "./guide";
import { visible } from "./guide";
import type { TaskCtx } from "./tasks";

type Goal = Extract<BubbleTask, { task: "goal" }>;
type Kind = "emergency" | "trip" | "car" | "other";
/** Their numbers for the suggestions (Metas' own goalOptions). */
export type GoalHints = {
  monthIn: number | null;
  monthOut: number | null;
  savings: Array<{ id: number; name: string; balance: number; usedBy: string | null }>;
};
/** What it ended up creating (for its "Listo"). */
export type GoalResult = { name: string; amount: number; created: boolean };

const g = (name: string) => `[data-guide="${name}"]`;
const shown = (sel: string) => [...document.querySelectorAll(sel)].some(visible);
const KINDS: Kind[] = ["emergency", "trip", "car", "other"];
const ym = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const up10 = (n: number) => Math.ceil(n / 10) * 10;

export function goalScript(task: Goal, c: TaskCtx, h: GoalHints, result: GoalResult) {
  const A = c.t.goalAsk;
  const money = c.money;
  const left = h.monthIn !== null && h.monthOut !== null ? Math.round(h.monthIn - h.monthOut) : null;
  /** A total that fits their numbers, by what it's for. */
  const suggestAmount = (k: Kind | null) => {
    if (k === "emergency" && h.monthOut) return Math.ceil((h.monthOut * 3) / 100) * 100;
    if (k === "trip") return 1500;
    if (k === "car") return 5000;
    return left && left > 0 ? Math.max(500, Math.round((left * 0.3 * 8) / 100) * 100) : 1000;
  };
  /** A monthly amount that doesn't squeeze them: at most 30% of what's left, reaching it in 3 to 24 months. */
  const suggestMonthly = (amount: number) => {
    if (left && left > 0) {
      const months = Math.max(3, Math.min(24, Math.ceil(amount / (left * 0.3))));
      return up10(amount / months);
    }
    return up10(amount / 12);
  };

  return async (k: ScriptKit): Promise<"done" | "missing"> => {
    let n = 1;
    const step = () => A.step(n++);
    const typeIfNew = async (el: HTMLInputElement, v: number | string) => { if (el.value !== String(v)) await k.type(el, String(v)); };
    /** "Lo escribo yo": the field is theirs until they tap "Sigue". */
    const theirs = async (el: HTMLElement, label: string, text: string) => {
      el.focus({ preventScroll: true });
      return k.ask(el, label, text, [{ label: A.next, value: "ok", kind: "yes" }], { allow: el });
    };
    let all = false;

    if (location.pathname !== "/personal/goals") await k.nav("/personal/goals", c.t.navTo(c.t.goal.page), step());
    const add = await k.find(g("goal-new"));
    if (!add) return "missing";
    await k.tap(add, step(), c.t.goal.new.auto);
    const list = await k.find(g("goal-tpls"));
    if (!list) return "missing";

    // ── What it's for (the real list: they can also tap one themselves) ──
    const offered = KINDS.filter((x) => shown(g(`goal-tpl-${x}`)));
    let kind: Kind | null = task.kind && offered.includes(task.kind) ? task.kind : null;
    if (!kind) {
      const sug: Kind = offered.includes("emergency") ? "emergency" : offered.includes("car") ? "car" : offered[0] ?? "other";
      const v = await k.ask(list, step(), A.kind(A.kinds[sug], A.kindWhy[sug]), [
        ...offered.map((x): Choice => ({ label: A.kinds[x], value: x, hint: x === sug ? A.suggested : undefined })),
        { label: A.all, value: "all", kind: "all" },
      ], { allow: list, until: () => shown(g("goal-name")) });
      if (v === null) return "done";
      if (v === "all") { all = true; kind = sug; } else if (v !== "dom") kind = v as Kind;
    }
    if (kind && !shown(g("goal-name"))) {
      const b = await k.find(g(`goal-tpl-${kind}`));
      if (!b) return "missing";
      await k.tap(b);
    }
    const nameEl = await k.find(g("goal-name")) as HTMLInputElement | null;
    const amountEl = await k.find(g("goal-amount")) as HTMLInputElement | null;
    const monthlyEl = await k.find(g("goal-monthly")) as HTMLInputElement | null;
    const dateEl = await k.find(g("goal-date"), 2000) as HTMLSelectElement | null;
    if (!nameEl || !amountEl || !monthlyEl) return "missing";

    // ── How much ──
    let amount = task.amount ?? (Number(amountEl.value) || 0);
    const sugAmount = amount || suggestAmount(kind);
    if (task.amount) await typeIfNew(amountEl, task.amount);
    else if (all) await typeIfNew(amountEl, sugAmount);
    else {
      const v = await k.ask(amountEl, step(), A.amount(money(sugAmount), A.amountWhy[kind ?? "other"], left && left > 0 ? money(left) : null), [
        { label: money(sugAmount), value: String(sugAmount), hint: A.suggested },
        { label: A.mine, value: "me" },
        { label: A.all, value: "all", kind: "all" },
      ], { allow: amountEl });
      if (v === null) return "done";
      if (v === "all") { all = true; await typeIfNew(amountEl, sugAmount); }
      else if (v === "me") { if (await theirs(amountEl, A.step(n - 1), A.writeIt) === null) return "done"; if (!(Number(amountEl.value) > 0)) await k.type(amountEl, String(sugAmount)); }
      else await typeIfNew(amountEl, v);
    }
    amount = Number(amountEl.value) || sugAmount;

    // ── How much a month ──
    const sugMonthly = suggestMonthly(amount);
    if (task.monthly) await typeIfNew(monthlyEl, task.monthly);
    else if (all) await typeIfNew(monthlyEl, sugMonthly);
    else {
      const faster = up10(sugMonthly * 2);
      // Without enough bank history, a plain "in a year"; with it, the 30% rule (or a gentle start when money is tight).
      const text = left === null ? A.monthlyYear(money(sugMonthly)) : left > 0 ? A.monthly(money(sugMonthly)) : A.monthlyTight(money(sugMonthly));
      const v = await k.ask(monthlyEl, step(), text, [
        { label: money(sugMonthly), value: String(sugMonthly), hint: A.suggested },
        ...(left && faster <= left * 0.6 && faster < amount ? [{ label: money(faster), value: String(faster), hint: A.faster }] : []),
        { label: A.mine, value: "me" },
        { label: A.all, value: "all", kind: "all" as const },
      ], { allow: monthlyEl });
      if (v === null) return "done";
      if (v === "all") { all = true; await typeIfNew(monthlyEl, sugMonthly); }
      else if (v === "me") { if (await theirs(monthlyEl, A.step(n - 1), A.writeIt) === null) return "done"; if (!(Number(monthlyEl.value) > 0)) await k.type(monthlyEl, String(sugMonthly)); }
      else await typeIfNew(monthlyEl, v);
    }
    const monthly = Number(monthlyEl.value) || sugMonthly;

    // ── By when ──
    if (dateEl) {
      const months = Math.max(2, Math.min(36, Math.ceil(amount / monthly)));
      const opt = [...dateEl.options].find((o) => o.value.startsWith(task.date ?? ym(months)));
      if (task.date && opt) await k.pick(dateEl, opt.value);
      else if (opt && all) await k.pick(dateEl, opt.value);
      else if (opt) {
        const v = await k.ask(dateEl, step(), A.when(opt.textContent ?? "", money(monthly)), [
          { label: opt.textContent ?? "", value: opt.value, hint: A.suggested },
          { label: A.noDate, value: "" },
          { label: A.pickMine, value: "me" },
          { label: A.all, value: "all", kind: "all" },
        ], { allow: dateEl });
        if (v === null) return "done";
        if (v === "all") { all = true; await k.pick(dateEl, opt.value); }
        else if (v === "me") { if (await theirs(dateEl, A.step(n - 1), A.pickIt) === null) return "done"; }
        else await k.pick(dateEl, v);
      }
    }

    // ── How it's followed (it thinks: a savings account that already has more would make it "done" today) ──
    const accts = h.savings.filter((s) => !s.usedBy && shown(g(`goal-track-${s.id}`)));
    const manualEl = document.querySelector<HTMLElement>(g("goal-track-manual"));
    if (accts.length && manualEl) {
      const fits = accts.find((s) => s.balance < amount);
      const full = accts.find((s) => s.balance >= amount);
      const sug = task.track ?? (fits ? fits.id : "manual");
      const sugEl = () => document.querySelector<HTMLElement>(g(`goal-track-${sug}`));
      if (task.track !== null || all) { const el = sugEl(); if (el) await k.tap(el); }
      else {
        const text = fits ? A.track(fits.name) : A.trackFull(full?.name ?? "", money(full?.balance ?? 0));
        const v = await k.ask(manualEl.parentElement ?? manualEl, step(), text, [
          ...(fits ? [{ label: A.withAcct(fits.name), value: String(fits.id), hint: A.suggested }, { label: A.manual, value: "manual" }]
            : [{ label: A.manual, value: "manual", hint: A.suggested }, ...(full ? [{ label: A.withAcct(full.name), value: String(full.id) }] : [])]),
          { label: A.all, value: "all", kind: "all" as const },
        ], { allow: manualEl.parentElement ?? manualEl });
        if (v === null) return "done";
        const pickId = v === "all" ? String(sug) : v;
        if (v === "all") all = true;
        const el = document.querySelector<HTMLElement>(g(`goal-track-${pickId}`));
        if (el) await k.tap(el);
      }
    }

    // ── Its name ──
    const current = nameEl.value.trim();
    if (task.name) await typeIfNew(nameEl, task.name);
    else if (!all) {
      const v = current
        ? await k.ask(nameEl, step(), A.name(current), [{ label: A.nameKeep, value: "keep", kind: "yes" }, { label: A.nameMine, value: "me" }], { allow: nameEl })
        : await k.ask(nameEl, step(), A.nameEmpty, [{ label: A.defaultName, value: "default", hint: A.suggested }, { label: A.nameMine, value: "me" }], { allow: nameEl });
      if (v === null) return "done";
      if (v === "me") { nameEl.select(); if (await theirs(nameEl, A.step(n - 1), A.writeIt) === null) return "done"; }
      if (v === "default") await k.type(nameEl, A.defaultName);
    }
    if (!nameEl.value.trim()) await k.type(nameEl, A.defaultName);

    // ── Before creating: one confirmation, with everything it's going to save ──
    const save = await k.find(g("goal-save"));
    if (!save) return "missing";
    for (;;) {
      const acct = h.savings.find((s) => document.querySelector<HTMLInputElement>(`${g(`goal-track-${s.id}`)} input`)?.checked);
      const date = dateEl?.value ? dateEl.selectedOptions[0]?.textContent ?? "" : A.noDate.toLowerCase();
      const sum = [nameEl.value.trim(), money(Number(amountEl.value) || 0), A.perMonth(money(Number(monthlyEl.value) || 0)), date, acct ? A.byAcct(acct.name) : A.byManual].join(" · ");
      const v = await k.ask(save, step(), A.confirm(sum), [{ label: A.yes, value: "yes", kind: "yes" }, { label: A.change, value: "change" }], { allow: save.closest("form") ?? save });
      if (v === null) return "done";
      if (v === "yes") break;
      n--;
      if (await k.ask(save, A.step(n), A.changeSay, [{ label: A.ready, value: "ok", kind: "yes" }], { allow: save.closest("form") ?? save }) === null) return "done";
    }
    result.name = nameEl.value.trim();
    result.amount = Number(amountEl.value) || amount;
    await k.tap(save);
    // It closes when it's saved.
    for (let i = 0; i < 40 && shown(g("goal-name")); i++) await new Promise((r) => setTimeout(r, 100));
    result.created = !shown(g("goal-name"));
    return result.created ? "done" : "missing";
  };
}
