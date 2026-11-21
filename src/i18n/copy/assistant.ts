// Copy for the AI assistant page (src/pages/Assistant.tsx).
import type { Lang } from "../lang";

const es = {
  nav: "Asistente",
  title: "Asistente",
  subtitle: {
    business: "Pregúntame sobre tus ventas, tus gastos y tu banco.",
    personal: "Pregúntame sobre tus gastos, tu banco y tus metas.",
  } as Record<"business" | "personal", string>,
  remaining: (left: number, limit: number) => `Te quedan ${left} de ${limit} preguntas este mes`,
  renews: (date: string) => `Se renuevan el ${date}.`,
  usageTitle: "Preguntas de este mes",
  usedOf: (used: number, limit: number) => `Llevas ${used} de ${limit}`,
  left: (n: number) => (n === 1 ? "Te queda 1" : `Te quedan ${n}`),
  used: "Ya usaste todas las preguntas de este mes.",
  changePlan: "Cambiar de plan",
  notReady: {
    title: "El asistente no está disponible por ahora",
    text: "Lo estamos preparando. Tus números siguen al día en el resto de la app; vuelve a intentarlo más tarde.",
    tag: "No disponible por ahora",
  },
  noPlan: "Tu plan no incluye el asistente.",
  empty: "¿En qué te ayudo?",
  emptyText: "Leo tus números para contestarte. Prueba con una de estas:",
  suggestions: {
    business: ["¿Cuánto vendí este mes?", "¿En qué gasté más este mes?", "¿Quiénes son mis mejores clientes?", "Compara este mes con el mes pasado"],
    personal: ["¿En qué gasté más este mes?", "¿Cuánto pago en suscripciones?", "¿Cómo voy con mis metas?", "¿Cuánto entró a mi cuenta este mes?"],
  } as Record<"business" | "personal", string[]>,
  label: "Tu pregunta",
  placeholder: "Escribe tu pregunta",
  send: "Enviar",
  thinking: "Revisando tus números…",
  you: "Tú",
  assistant: "Asistente",
  clear: "Borrar conversación",
  clearShort: "Borrar",
  clearConfirm: "¿Borrar la conversación? Las preguntas de este mes se siguen contando.",
  disclaimer: "El asistente puede equivocarse. Revisa los números importantes antes de decidir.",
  error: "No pude contestar ahora. Inténtalo de nuevo.",
  loadError: "No pudimos abrir el asistente.",
  retry: "Intentar de nuevo",
};

export type AssistantCopy = typeof es;

const en: AssistantCopy = {
  nav: "Assistant",
  title: "Assistant",
  subtitle: {
    business: "Ask me about your sales, your expenses and your bank.",
    personal: "Ask me about your spending, your bank and your goals.",
  },
  remaining: (left: number, limit: number) => `${left} of ${limit} questions left this month`,
  renews: (date: string) => `They renew on ${date}.`,
  usageTitle: "This month's questions",
  usedOf: (used: number, limit: number) => `${used} of ${limit} used`,
  left: (n: number) => `${n} left`,
  used: "You've used all of this month's questions.",
  changePlan: "Change plan",
  notReady: {
    title: "The assistant isn't available right now",
    text: "We're getting it ready. Your numbers are still up to date everywhere else in the app; please try again later.",
    tag: "Not available right now",
  },
  noPlan: "Your plan doesn't include the assistant.",
  empty: "How can I help?",
  emptyText: "I read your numbers to answer you. Try one of these:",
  suggestions: {
    business: ["How much did I sell this month?", "What did I spend the most on this month?", "Who are my best clients?", "Compare this month with last month"],
    personal: ["What did I spend the most on this month?", "How much do I pay in subscriptions?", "How am I doing with my goals?", "How much came into my account this month?"],
  },
  label: "Your question",
  placeholder: "Write your question",
  send: "Send",
  thinking: "Checking your numbers…",
  you: "You",
  assistant: "Assistant",
  clear: "Clear conversation",
  clearShort: "Clear",
  clearConfirm: "Clear the conversation? This month's questions still count.",
  disclaimer: "The assistant can make mistakes. Check important numbers before deciding.",
  error: "I couldn't answer right now. Please try again.",
  loadError: "We couldn't open the assistant.",
  retry: "Try again",
};

export const assistantCopy: Record<Lang, AssistantCopy> = { es, en };
