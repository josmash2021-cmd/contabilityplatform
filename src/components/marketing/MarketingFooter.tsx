import { Link } from "react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

const columns: Array<{ title: string; links: Array<{ label: string; href: string; internal?: boolean }> }> = [
  {
    title: "Producto",
    links: [
      { label: "Funciones", href: "/#producto" },
      { label: "Cómo funciona", href: "/#como-funciona" },
      { label: "Seguridad", href: "/#seguridad" },
      { label: "Precios", href: "/#precios" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { label: "Crear cuenta", href: "/register", internal: true },
      { label: "Iniciar sesión", href: "/login", internal: true },
      { label: "Recuperar contraseña", href: "/forgot-password", internal: true },
    ],
  },
  {
    title: "Ayuda y legal",
    links: [
      { label: "Preguntas frecuentes", href: "/#preguntas" },
      { label: "Política de privacidad", href: "/privacy", internal: true },
    ],
  },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const linkCls = "text-sm text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white";

  return (
    <footer className="bg-[#060B18] text-slate-400" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Pie de página</h2>
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="max-w-sm">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <Logo className="h-9 w-9" />
              <span className="leading-tight">
                <span className="block text-base font-semibold text-white">Ai Aethel</span>
                <span className="block text-xs text-slate-500">Accountant</span>
              </span>
            </Link>
            <p className="mt-5 text-sm leading-relaxed">
              Contabilidad inteligente para negocios y personas. Conecta tu banco, organiza tus números y toma decisiones con claridad.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Conexión bancaria con Plaid</span>
              <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-emerald-400" /> Pagos procesados por Stripe</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold text-white">{col.title}</h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.internal ? (
                        <Link to={l.href} className={linkCls}>{l.label}</Link>
                      ) : (
                        <a href={l.href} className={linkCls}>{l.label}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Ai Aethel Accountant. Todos los derechos reservados.</p>
          <p>Ai Aethel no sustituye la asesoría de un contador o asesor fiscal certificado.</p>
        </div>
      </div>
    </footer>
  );
}
