// The closed list of tasks the bubble can do on screen (contracts/bubble.ts), step by step, with the app's own
// buttons (marked with data-guide / data-nav / data-tx-id). Nothing here saves by itself: each step presses or fills
// what the person would. Amounts and names come from the offer the person saw before tapping.
import type { BubbleTask } from "@contracts/bubble";
import type { BubbleCopy } from "@/i18n/copy/bubble";
import type { Step } from "./guide";
import { visible } from "./guide";

export type TaskCtx = {
  t: BubbleCopy["tasks"];
  mode: "business" | "personal";
  money: (n: number) => string;
  catLabel: (cat: string, type: "income" | "expense") => string;
  colorName: (c: string) => string;
  monthName: (iso: string) => string;
};
/** What a task says when it's over: in the panel (`done`), quietly in its cloud (`quiet`), or if a step is missing. */
export type TaskPlan = { steps: Step[]; done: string | null; quiet: string | null; missing: string | null };

const g = (name: string) => `[data-guide="${name}"]`;
/** The page's own title (its visible h1, not a hidden one). */
const pageTitle = () => [...document.querySelectorAll<HTMLElement>("main h1")].find(visible) ?? null;
/** A section of the page by the words of its heading. */
const heading = (re: RegExp) => [...document.querySelectorAll<HTMLElement>("main h2, main h3")].find((h) => visible(h) && re.test(h.textContent ?? "")) ?? null;
const onScreen = (sel: string) => [...document.querySelectorAll(sel)].some(visible);

export function planFor(task: BubbleTask, c: TaskCtx): TaskPlan {
  const t = c.t;
  const plan = (steps: Step[], done: string | null, quiet: string | null = null, missing: string | null = null): TaskPlan => ({ steps, done, quiet, missing });
  switch (task.task) {
    case "tour": {
      // Page by page: it goes there (on a phone through "Más"), lights the page's title and says what it's for, goes
      // down through its sections with the page explaining each one, and at the end: "Esa es toda la página".
      const pages = t.tour[c.mode];
      const steps: Step[] = [{ ...t.tour.intro, label: "" }];
      pages.forEach((p, i) => {
        const label = t.tour.pageOf(i + 1, pages.length);
        steps.push({ ...t.tour.page(p.name), nav: p.path, label });
        steps.push({ auto: p.title, teach: p.title, find: pageTitle, act: "show", optional: "say", label });
        for (const [re, say] of p.sections) steps.push({ auto: say, teach: say, find: () => heading(re), act: "show", optional: "skip", label });
        if (p.rows) steps.push({ auto: p.rows, teach: p.rows, el: "main [data-tx-id]", act: "show", optional: "skip", label });
        const next = pages[i + 1];
        steps.push({ ...(next ? t.tour.whole(next.name) : t.tour.wholeLast), end: true, label });
      });
      return plan(steps, t.tour.done);
    }
    case "budget": {
      const cat = c.catLabel(task.category, "expense"), amt = c.money(task.amount);
      const edit = g(`budget-edit-${task.category}`);
      const has = () => onScreen(edit);
      return plan([
        { ...t.navTo(t.budget.page), nav: "/personal/budgets", via: `${g("home-budgets")}, ${g("home-nobudget")}`, viaSay: t.navHere(t.budget.page) },
        { ...t.budget.edit(cat), el: edit, act: "tap", when: has },
        { ...t.budget.amount(amt), el: g("budget-edit-amt"), act: "type", value: String(task.amount), when: () => onScreen(g("budget-edit-amt")) },
        { ...t.save, el: g("budget-edit-save"), act: "tap", when: () => onScreen(g("budget-edit-save")) },
        { ...t.budget.add, el: g("budget-add"), act: "tap", when: () => !has() && !onScreen(g("budget-edit-amt")) && !onScreen(g("budget-add-cat")) },
        { ...t.budget.pick(cat), el: g("budget-add-cat"), act: "pick", value: task.category, when: () => onScreen(g("budget-add-cat")) },
        { ...t.budget.monthly(amt), el: g("budget-add-amt"), act: "type", value: String(task.amount), when: () => onScreen(g("budget-add-amt")) },
        { ...t.save, el: g("budget-add-save"), act: "tap", when: () => onScreen(g("budget-add-save")) },
      ], t.budget.done(amt, cat));
    }
    case "goal": {
      // "Enséñame" (the person does it); "Hazlo por mí" asks as it goes (goalScript.ts).
      const A = t.goalAsk;
      const steps: Step[] = [
        { ...t.navTo(t.goal.page), nav: "/personal/goals", via: g("home-goal-create"), viaSay: t.navHere(t.goal.page) },
        // (Inicio's "Crear una meta" already opens the form)
        { ...t.goal.new, el: g("goal-new"), act: "tap", when: () => !onScreen(g("goal-tpls")) && !onScreen(g("goal-name")) },
        { ...(task.kind && task.kind !== "other" ? { auto: A.kinds[task.kind], teach: A.kinds[task.kind] } : t.goal.other), el: g(`goal-tpl-${task.kind ?? "other"}`), act: "tap" },
        { ...(task.name ? t.goal.name(task.name) : { auto: A.nameEmpty, teach: A.nameEmpty }), el: g("goal-name"), act: "type", value: task.name ?? "" },
        { ...(task.amount ? t.goal.amount(c.money(task.amount)) : { auto: A.amount("", "", null), teach: A.amount("", "", null).replace(/ Te sugiero \.| I suggest \./, "") }), el: g("goal-amount"), act: "type", value: task.amount ? String(task.amount) : "" },
      ];
      if (task.monthly) steps.push({ ...t.goal.monthly(c.money(task.monthly)), el: g("goal-monthly"), act: "type", value: String(task.monthly) });
      steps.push({ ...t.goal.create, el: g("goal-save"), act: "tap" });
      return plan(steps, task.name && task.amount ? t.goal.done(task.name, c.money(task.amount)) : null);
    }
    case "connect_bank": {
      const personal = c.mode === "personal";
      return plan([
        { ...t.navTo(personal ? t.bank.personalPage : t.bank.businessPage), nav: personal ? "/personal/bank" : "/bank" },
        { ...t.bank.connect, el: g("bank-connect"), act: "tap" },
      ], null, t.bank.done);
    }
    case "change_category": {
      const [y, m] = task.date.split("-").map(Number);
      const cat = c.catLabel(task.category, task.type);
      return plan([
        { ...t.goTo(t.category.page(c.monthName(task.date))), go: `/personal/transactions?month=${m}&year=${y}` },
        { ...t.category.row(task.name), el: `[data-tx-id="${task.transactionId}"]`, act: "tap" },
        { ...t.category.pick(cat), el: g(`cat-${task.category}`), act: "tap" },
      ], t.category.done(task.name, cat));
    }
    case "review":
      return plan([
        { ...t.navTo(t.review.page), nav: "/personal/transactions", via: g("home-review"), viaSay: t.navHere(t.review.page) },
        { ...t.review.all, el: g("review-all"), act: "tap" },
      ], t.review.done, null, t.review.missing);
    case "sync_bank":
      return plan([
        { ...t.navTo(t.sync.page), nav: "/personal/transactions" },
        { ...t.sync.refresh, el: g("bank-refresh"), act: "tap" },
      ], t.sync.done);
    case "user_color": {
      const name = c.colorName(task.color);
      return plan([
        { ...t.goTo(t.color.page), go: `/settings?sec=${c.mode === "personal" ? "perfil" : "cuenta"}` },
        { ...t.color.pick(name), el: g(`color-${task.color}`), act: "tap" },
        { ...t.color.look, el: g("account-circle"), act: "show" },
      ], t.color.done(name));
    }
    case "customer": {
      const full = [task.name, task.lastName].filter(Boolean).join(" ");
      const steps: Step[] = [
        { ...t.navTo(t.customer.page), nav: "/customers" },
        { ...t.customer.new, el: g("customer-new"), act: "tap" },
        { ...t.customer.name(task.name), el: g("customer-name"), act: "type", value: task.name },
      ];
      if (task.lastName) steps.push({ ...t.customer.name(task.lastName), el: g("customer-last"), act: "type", value: task.lastName });
      if (task.phone) steps.push({ ...t.customer.name(task.phone), el: g("customer-phone"), act: "type", value: task.phone });
      if (task.email) steps.push({ ...t.customer.name(task.email), el: g("customer-email"), act: "type", value: task.email });
      steps.push({ ...t.save, el: g("customer-save"), act: "tap" });
      return plan(steps, t.customer.done(full));
    }
    case "invoice":
      return plan([
        { ...t.goTo(t.invoice.page), go: "/invoices?new=1" },
        { ...t.invoice.where, el: g("invoice-customer"), act: "show", hold: 6000 },
      ], null);
    case "receipt":
      return plan([
        { ...t.goTo(t.receipt.page), go: "/expenses?photo=1" },
        { ...t.receipt.where, el: g("receipt-photo"), act: "show", hold: 6000 },
      ], null);
  }
}

/** What the offer will do, in one line under "Hazlo por mí" (so the person sees the values before tapping). */
export function offerLine(task: BubbleTask, c: TaskCtx): string | null {
  switch (task.task) {
    case "budget": return `${c.catLabel(task.category, "expense")} · ${c.money(task.amount)}`;
    case "goal": return [task.name, task.amount ? c.money(task.amount) : null, task.monthly ? c.money(task.monthly) : null, c.t.goalAsk.onScreen].filter(Boolean).join(" · ");
    case "change_category": return `${task.name} → ${c.catLabel(task.category, task.type)}`;
    case "user_color": return c.colorName(task.color);
    case "customer": return [task.name, task.lastName].filter(Boolean).join(" ");
    default: return null;
  }
}
