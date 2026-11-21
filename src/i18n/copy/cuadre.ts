// Copy for "Cuadrar con tu estado de cuenta" (src/components/bank/ReconcileCard.tsx).
// The rules (balance at the statement's end date, likely causes, closing) live in api/lib/reconcile.ts.
import type { Lang } from "../lang";

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-15" → "15 nov" (with the year when it isn't `currentYear`). */
const dayEs = (iso: string, currentYear?: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_ES[Number(m) - 1]}${currentYear && y !== currentYear ? ` ${y}` : ""}`;
};
const dayEn = (iso: string, currentYear?: string) => {
  const [y, m, d] = iso.split("-");
  return `${MONTHS_EN[Number(m) - 1]} ${Number(d)}${currentYear && y !== currentYear ? `, ${y}` : ""}`;
};

const es = {
  day: dayEs,
  range: (start: string, end: string, currentYear?: string) => `${dayEs(start, start.slice(0, 4) !== end.slice(0, 4) ? "-" : currentYear)} – ${dayEs(end, currentYear)}`,
  title: "Cuadrar con tu estado de cuenta",
  sub: (account: string, start: string, end: string) => `${account} · periodo del ${start} al ${end}`,
  reopenedOn: (date: string) => `reabierto el ${date}`,
  changePeriod: "Cambiar",
  changePeriodAria: "Cambiar la cuenta o el periodo",
  step: (n: number) => `Paso ${n} de 3`,
  closedTag: "Cerrado",
  loadError: "No pudimos cargar el cuadre de esta cuenta.",
  retry: "Reintentar",
  locked: {
    badge: "Disponible en Pro y Negocio",
    text: "Compara el saldo de tu estado de cuenta con tus registros y cierra cada periodo para que nada cambie por error.",
    cta: "Ver qué incluye cada plan",
  },
  editor: {
    title: "Cuenta y periodo",
    account: "Cuenta",
    from: "Desde",
    to: "Hasta",
    help: "Usa las fechas que trae tu estado de cuenta.",
    apply: "Usar este periodo",
    cancel: "Cancelar",
    order: "La fecha de inicio tiene que ser antes de la final.",
    future: (today: string) => `El periodo no puede terminar después de hoy (${today}).`,
    missing: "Elige las dos fechas.",
  },
  s1: {
    title: "Saldo final de tu estado de cuenta",
    inputAria: (end: string) => `Saldo final al ${end}`,
    compare: "Comparar",
    hint: (end: string, debt: boolean) => debt
      ? `Está en la primera página del estado de cuenta: “Saldo nuevo” o “New balance” al ${end}.`
      : `Está en la primera página del estado de cuenta: “Saldo final” o “Ending balance” al ${end}.`,
    bad: "Escribe el saldo final tal como sale en tu estado de cuenta, por ejemplo 11,794.21.",
    at: (end: string) => `al ${end}`,
    change: "Cambiar",
    changeAria: "Cambiar el saldo final",
  },
  s2: {
    title: "Comparamos con tus registros",
    meta: "Te decimos si cuadra y, si no, qué movimiento falta o sobra.",
    comparing: "Comparando con tus registros…",
    error: "No pudimos comparar. Inténtalo de nuevo.",
    ok: (amount: string) => `Cuadra al centavo: tus registros también dicen ${amount}.`,
    notBy: "No cuadra por",
    likely: "Lo más probable:",
    noCause: (end: string) => `y no encontramos un movimiento que lo explique. Revisa que escribiste el saldo del ${end} tal como sale en tu estado de cuenta.`,
    book: (amount: string, end: string) => `Tus registros dicen ${amount} al ${end}.`,
    periodMismatch: (prevEnd: string, prevAmount: string) =>
      `Tu saldo de hoy sí coincide, pero los movimientos de este periodo no suman desde tu cierre del ${prevEnd} (${prevAmount}): falta o sobra alguno.`,
    changeBalance: "Cambiar el saldo",
    seeMovements: "Ver en Movimientos",
    resolve: "Resolverlo en Por revisar",
    cause: {
      exact: "es justo la diferencia.",
      where: {
        after: "Tiene fecha después del cierre: si tu banco lo contó en este estado de cuenta, de ahí viene.",
        inside: "Revisa que sí esté en tu estado de cuenta y que sea de esta cuenta.",
        before: "Tiene fecha antes del periodo: revisa en qué estado de cuenta lo puso tu banco.",
      },
      duplicate: "Puede estar repetido:",
      twice: (date: string) => `aparece 2 veces el ${date}.`,
      isDifference: "Es justo la diferencia.",
      edgeEnd: (end: string) => `Movimientos cerca del cierre (${end}): tu banco a veces los cuenta en otra fecha.`,
      edgeStart: (start: string) => `Movimientos cerca del inicio (${start}): tu banco a veces los cuenta en otra fecha.`,
      stale: (date: string) => `El saldo de esta cuenta se actualizó por última vez el ${date}. Actualízala y vuelve a comparar.`,
      unreviewed: (n: number) => (n === 1 ? "1 movimiento de este periodo sigue en Por revisar." : `${n} movimientos de este periodo siguen en Por revisar.`),
      of: (description: string, amount: string, date: string) => `${description} ${amount} del ${date}`,
    },
  },
  s3: {
    title: "Cerrar el periodo",
    meta: "Así nadie cambia estos movimientos por error. Si encuentras un error, lo puedes reabrir.",
    close: "Cerrar el periodo",
    closing: "Cerrando…",
    reviewFirst: (n: number) => (n === 1
      ? "Antes de cerrar, revisa el movimiento de este periodo que sigue en Por revisar."
      : `Antes de cerrar, revisa los ${n} movimientos de este periodo que siguen en Por revisar.`),
    overlap: (range: string) => `Ya cerraste un periodo que se cruza con estas fechas (${range}). Elige las de otro estado de cuenta.`,
    ownerOnly: "Solo el dueño de la cuenta puede cerrar el periodo.",
    closedToast: "Periodo cerrado. Ya no se puede cambiar por error.",
    error: "No pudimos cerrar el periodo. Inténtalo de nuevo.",
  },
  closedBox: (start: string, end: string, nextEnd: string) =>
    `El periodo del ${start} al ${end} quedó cerrado. El siguiente se cuadra cuando llegue tu estado de cuenta del ${nextEnd}.`,
  history: {
    title: "Periodos anteriores",
    meta: "Cuadró al centavo · cerrado",
    empty: "Todavía no has cerrado ningún periodo de esta cuenta.",
    reopen: "Reabrir",
    reopenAria: (range: string) => `Reabrir el periodo ${range}`,
    ask: "Reabrir permite cambiar movimientos que ya cuadraron. Hazlo solo si encontraste un error.",
    yes: "Sí, reabrir",
    no: "Cancelar",
    reopenedToast: "Periodo reabierto. Corrige lo que necesites y vuelve a cerrarlo.",
    error: "No pudimos reabrir el periodo. Inténtalo de nuevo.",
  },
};

const en: typeof es = {
  day: dayEn,
  range: (start: string, end: string, currentYear?: string) => `${dayEn(start, start.slice(0, 4) !== end.slice(0, 4) ? "-" : currentYear)} – ${dayEn(end, currentYear)}`,
  title: "Reconcile with your bank statement",
  sub: (account: string, start: string, end: string) => `${account} · period from ${start} to ${end}`,
  reopenedOn: (date: string) => `reopened on ${date}`,
  changePeriod: "Change",
  changePeriodAria: "Change the account or the period",
  step: (n: number) => `Step ${n} of 3`,
  closedTag: "Closed",
  loadError: "We couldn't load this account's reconciliation.",
  retry: "Try again",
  locked: {
    badge: "Available on Pro and Business",
    text: "Compare your statement's balance with your records and close each period so nothing changes by mistake.",
    cta: "See what each plan includes",
  },
  editor: {
    title: "Account and period",
    account: "Account",
    from: "From",
    to: "To",
    help: "Use the dates printed on your statement.",
    apply: "Use this period",
    cancel: "Cancel",
    order: "The start date has to be before the end date.",
    future: (today: string) => `The period can't end after today (${today}).`,
    missing: "Pick both dates.",
  },
  s1: {
    title: "Ending balance on your statement",
    inputAria: (end: string) => `Ending balance on ${end}`,
    compare: "Compare",
    hint: (end: string, debt: boolean) => debt
      ? `It's on the first page of the statement: “New balance” on ${end}.`
      : `It's on the first page of the statement: “Ending balance” on ${end}.`,
    bad: "Type the ending balance exactly as it shows on your statement, for example 11,794.21.",
    at: (end: string) => `on ${end}`,
    change: "Change",
    changeAria: "Change the ending balance",
  },
  s2: {
    title: "We compare it with your records",
    meta: "We tell you if it matches and, if not, which transaction is missing or extra.",
    comparing: "Comparing with your records…",
    error: "We couldn't compare. Please try again.",
    ok: (amount: string) => `Matches to the cent: your records also say ${amount}.`,
    notBy: "It's off by",
    likely: "Most likely:",
    noCause: (end: string) => `and we couldn't find a transaction that explains it. Check that you typed the ${end} balance exactly as it shows on your statement.`,
    book: (amount: string, end: string) => `Your records say ${amount} on ${end}.`,
    periodMismatch: (prevEnd: string, prevAmount: string) =>
      `Today's balance does match, but this period's transactions don't add up from your ${prevEnd} close (${prevAmount}): one is missing or extra.`,
    changeBalance: "Change the balance",
    seeMovements: "See in Transactions",
    resolve: "Resolve it in To review",
    cause: {
      exact: "is exactly the difference.",
      where: {
        after: "It's dated after the closing day: if your bank counted it in this statement, that's where it comes from.",
        inside: "Check that it's on your statement and that it belongs to this account.",
        before: "It's dated before the period: check which statement your bank put it on.",
      },
      duplicate: "It may be repeated:",
      twice: (date: string) => `shows up twice on ${date}.`,
      isDifference: "It's exactly the difference.",
      edgeEnd: (end: string) => `Transactions near the closing day (${end}): banks sometimes count them on another date.`,
      edgeStart: (start: string) => `Transactions near the start (${start}): banks sometimes count them on another date.`,
      stale: (date: string) => `This account's balance was last updated on ${date}. Refresh it and compare again.`,
      unreviewed: (n: number) => (n === 1 ? "1 transaction of this period is still in To review." : `${n} transactions of this period are still in To review.`),
      of: (description: string, amount: string, date: string) => `${description} ${amount} on ${date}`,
    },
  },
  s3: {
    title: "Close the period",
    meta: "So nobody changes these transactions by mistake. If you find an error, you can reopen it.",
    close: "Close the period",
    closing: "Closing…",
    reviewFirst: (n: number) => (n === 1
      ? "Before closing, review this period's transaction that's still in To review."
      : `Before closing, review this period's ${n} transactions that are still in To review.`),
    overlap: (range: string) => `You already closed a period that overlaps these dates (${range}). Pick another statement's dates.`,
    ownerOnly: "Only the account owner can close the period.",
    closedToast: "Period closed. It can't be changed by mistake anymore.",
    error: "We couldn't close the period. Please try again.",
  },
  closedBox: (start: string, end: string, nextEnd: string) =>
    `The period from ${start} to ${end} is closed. The next one gets reconciled when your ${nextEnd} statement arrives.`,
  history: {
    title: "Previous periods",
    meta: "Matched to the cent · closed",
    empty: "You haven't closed any period for this account yet.",
    reopen: "Reopen",
    reopenAria: (range: string) => `Reopen the period ${range}`,
    ask: "Reopening lets you change transactions that already matched. Only do it if you found an error.",
    yes: "Yes, reopen",
    no: "Cancel",
    reopenedToast: "Period reopened. Fix what you need and close it again.",
    error: "We couldn't reopen the period. Please try again.",
  },
};

export const cuadreCopy: Record<Lang, typeof es> = { es, en };
