// Which language a message is written in (owner, 2026-11-24): the assistant answers in Spanish OR English, never
// mixed. Spanish when they write in Spanish (even with some English words, "los biles"); English when they write in
// English; when it can't tell ("ok", "300") the caller keeps the conversation's language, and English by default.

const ES_MARKS = /[ñáéíóúü¿¡]/i;
// Common words of each language that the other doesn't use (ambiguous ones like "a", "me", "no", "ok", "tour" are out).
const ES_WORDS = new Set([
  "el", "la", "los", "las", "lo", "de", "del", "que", "qué", "como", "cómo", "cuanto", "cuánto", "cuanta", "cuánta", "cuantos", "cuántos",
  "donde", "dónde", "cuando", "cuándo", "por", "para", "mi", "mis", "tu", "tus", "su", "sus", "un", "una", "unos", "unas", "es", "son", "y",
  "en", "con", "sin", "al", "quiero", "puedo", "puedes", "hazlo", "hazme", "házmelo", "hazmelo", "ponme", "pon", "dame", "dime", "cambia",
  "cambiame", "cámbiame", "agrega", "agregame", "ayuda", "ayudame", "ayúdame", "enseñame", "enséñame", "ensename", "presupuesto",
  "presupuestos", "meta", "metas", "banco", "cuenta", "cuentas", "gasto", "gastos", "dinero", "movimiento", "movimientos", "factura",
  "facturas", "cliente", "clientes", "recibo", "porque", "pero", "si", "sí", "este", "esta", "esto", "eso", "ese", "mes", "hoy", "ahora",
  "gracias", "hola", "buenos", "buenas", "necesito", "tengo", "tiene", "hay", "algo", "nada", "cuadra", "aplicación", "aplicacion", "página",
  "pagina", "contraseña", "también", "tambien", "más", "mas", "muy", "ya", "está", "esta", "estoy", "fue", "se", "le", "les", "nos",
]);
const EN_WORDS = new Set([
  "the", "an", "my", "your", "how", "what", "where", "when", "why", "which", "do", "does", "did", "is", "are", "was", "it", "it's", "for",
  "to", "of", "and", "or", "in", "on", "with", "without", "i", "i'm", "want", "need", "can", "could", "please", "set", "show", "add",
  "change", "make", "budget", "budgets", "goal", "goals", "bank", "account", "accounts", "money", "spent", "spend", "spending", "invoice",
  "invoices", "client", "clients", "customer", "receipt", "this", "that", "these", "month", "today", "now", "thanks", "thank", "hi", "hello",
  "help", "teach", "much", "many", "much", "page", "password", "also", "more", "very", "already", "will", "would", "should", "have", "has",
  "get", "give", "tell", "connect", "save", "put", "up", "out", "about",
]);

/** "es", "en", or null when it can't tell. */
export function detectLang(text: string | null | undefined): "es" | "en" | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  let es = ES_MARKS.test(t) ? 2 : 0, en = 0;
  for (const w of t.split(/[^a-záéíóúüñ']+/i)) {
    if (!w) continue;
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
  }
  if (es > en) return "es";
  if (en > es) return "en";
  return null;
}

/** The language to answer in: this message's, else the last one of theirs that showed it, else English. */
export function replyLanguage(question: string, earlier: string[]): "es" | "en" {
  const now = detectLang(question);
  if (now) return now;
  for (let i = earlier.length - 1; i >= 0; i--) {
    const l = detectLang(earlier[i]);
    if (l) return l;
  }
  return "en";
}
