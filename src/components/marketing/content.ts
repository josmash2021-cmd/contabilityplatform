// Shared marketing copy and prices. Prices must match api/lib/plans.ts.

export const TRIAL_DAYS = 7;

export const NAV_LINKS = [
  { href: "/#producto", label: "Producto" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#seguridad", label: "Seguridad" },
  { href: "/#precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
] as const;

export type PlanKey = "personal" | "business";

export const PLANS: Record<
  PlanKey,
  { name: string; tagline: string; monthly: number; annual: number; features: string[] }
> = {
  personal: {
    name: "Personal",
    tagline: "Para organizar tus finanzas y las de tu hogar.",
    monthly: 40,
    annual: 400,
    features: [
      "Conexión segura con tu banco",
      "Movimientos clasificados automáticamente",
      "Detector de suscripciones y cobros recurrentes",
      "Metas de ahorro con seguimiento",
      "Resumen mensual de ingresos y gastos",
    ],
  },
  business: {
    name: "Negocio",
    tagline: "Para negocios, emprendedores y profesionales independientes.",
    monthly: 80,
    annual: 800,
    features: [
      "Punto de venta: efectivo, Zelle y tarjeta",
      "Clientes y catálogo de servicios",
      "Registro de gastos por categoría",
      "Cuentas bancarias conectadas y conciliación",
      "Estado de resultados, balance general y libro diario",
      "Exportación de reportes a CSV (compatible con Excel)",
    ],
  },
};

/** Whole-dollar monthly equivalent of the annual price, e.g. 800 -> "$67". */
export function annualPerMonth(annual: number): string {
  return `$${Math.round(annual / 12)}`;
}
