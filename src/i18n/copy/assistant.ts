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
  used: "Ya usaste todas las preguntas de este mes.",
  changePlan: "Cambiar de plan",
  notReady: "El asistente se está activando. Vuelve en unos minutos.",
  noPlan: "Tu plan no incluye el asistente.",
  empty: "¿En qué te ayudo?",
  emptyText: "Leo tus números para contestarte. Prueba con una de estas:",
  suggestions: {
    business: ["¿Cuánto vendí este mes?", "¿En qué gasté más este mes?", "¿Quiénes son mis mejores clientes?", "Compara este mes con el mes pasado"],
    personal: ["¿En qué gasté más este mes?", "¿Cuánto pago en suscripciones?", "¿Cómo voy con mis metas?", "¿Cuánto entró a mi cuenta este mes?"],
  } as Record<"business" | "personal", string[]>,
  placeholder: "Escribe tu pregunta",
  send: "Enviar",
  thinking: "Revisando tus números…",
  you: "Tú",
  assistant: "Asistente",
  clear: "Borrar conversación",
  clearConfirm: "¿Borrar la conversación? Las preguntas de este mes se siguen contando.",
  disclaimer: "El asistente puede equivocarse. Revisa los números importantes antes de decidir.",
  error: "No pude contestar ahora. Inténtalo de nuevo.",
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
  used: "You've used all of this month's questions.",
  changePlan: "Change plan",
  notReady: "The assistant is being set up. Please come back in a few minutes.",
  noPlan: "Your plan doesn't include the assistant.",
  empty: "How can I help?",
  emptyText: "I read your numbers to answer you. Try one of these:",
  suggestions: {
    business: ["How much did I sell this month?", "What did I spend the most on this month?", "Who are my best clients?", "Compare this month with last month"],
    personal: ["What did I spend the most on this month?", "How much do I pay in subscriptions?", "How am I doing with my goals?", "How much came into my account this month?"],
  },
  placeholder: "Write your question",
  send: "Send",
  thinking: "Checking your numbers…",
  you: "You",
  assistant: "Assistant",
  clear: "Clear conversation",
  clearConfirm: "Clear the conversation? This month's questions still count.",
  disclaimer: "The assistant can make mistakes. Check important numbers before deciding.",
  error: "I couldn't answer right now. Please try again.",
};

export const assistantCopy: Record<Lang, AssistantCopy> = { es, en };
