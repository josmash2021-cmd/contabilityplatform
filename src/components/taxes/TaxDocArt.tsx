// An example picture of each tax document (drawn here, generic: no government seals or logos, sample data), so
// the client knows what to look for before taking the photo. Shown small next to each document in "Tus
// documentos" and big in the example window with tips.
import type { ReactNode } from "react";

type Line = { w: number; dark?: boolean };
type Box = { label: string; value?: string; hi?: boolean };

const INK = "#0F172A";
const MUTED = "#94A3B8";
const LINE = "#CBD5E1";
const BLUE = "#2563EB";
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

function Bars({ x, y, lines, gap = 6 }: { x: number; y: number; lines: Line[]; gap?: number }) {
  return <>{lines.map((l, i) => <rect key={i} x={x} y={y + i * gap} width={l.w} height="2.4" rx="1.2" fill={l.dark ? "#64748B" : LINE} />)}</>;
}

/** A form on a sheet: its number big at the top left, the year, and a grid of boxes (one highlighted). */
function Form({ code, sub, boxes }: { code: string; sub: string; boxes: Box[] }) {
  return (
    <>
      <rect x="20" y="3" width="56" height="66" rx="3" fill="#fff" stroke={LINE} />
      <text x="25" y="14" fontFamily={FONT} fontSize="8.5" fontWeight="800" fill={INK}>{code}</text>
      <text x="71" y="10.5" fontFamily={FONT} fontSize="4" fontWeight="600" fill={MUTED} textAnchor="end">2026</text>
      <text x="25" y="19.5" fontFamily={FONT} fontSize="3.6" fill="#64748B">{sub}</text>
      {boxes.map((b, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 24 + col * 25;
        const y = 24 + row * 14.5;
        return (
          <g key={i}>
            <rect x={x} y={y} width="23" height="12.5" rx="1.2" fill={b.hi ? "#EAF1FF" : "#fff"} stroke={b.hi ? "#93C5FD" : LINE} strokeWidth="0.7" />
            <text x={x + 1.6} y={y + 4} fontFamily={FONT} fontSize="2.8" fill="#64748B">{b.label}</text>
            {b.value ? <text x={x + 1.6} y={y + 10} fontFamily={FONT} fontSize="4.2" fontWeight="700" fill={b.hi ? BLUE : INK}>{b.value}</text>
              : <rect x={x + 1.6} y={y + 7} width="13" height="2" rx="1" fill={LINE} />}
          </g>
        );
      })}
    </>
  );
}

/** A card (ID or Social Security): rounded, with a band, a photo or a number. */
function Card({ x = 6, y = 10, kind, shade = 0 }: { x?: number; y?: number; kind: "id" | "ssn"; shade?: number }) {
  if (kind === "id") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect width="84" height="54" rx="5" fill={shade ? "#F1F5F9" : "#EFF6FF"} stroke="#BFD3FB" />
        <rect width="84" height="11" rx="5" fill={shade ? "#64748B" : BLUE} />
        <rect y="6" width="84" height="5" fill={shade ? "#64748B" : BLUE} />
        <text x="5" y="8" fontFamily={FONT} fontSize="5" fontWeight="700" fill="#fff">ID · LICENCIA</text>
        <rect x="5" y="16" width="22" height="28" rx="2.5" fill="#E2E8F0" />
        <circle cx="16" cy="26" r="5" fill={MUTED} />
        <path d="M7.5 42c1.5-6 5-8 8.5-8s7 2 8.5 8" fill={MUTED} />
        <text x="32" y="21" fontFamily={FONT} fontSize="4.6" fontWeight="700" fill={INK}>MARÍA LÓPEZ</text>
        <Bars x={32} y={26} lines={[{ w: 40 }, { w: 30 }, { w: 36 }]} />
        <text x="32" y="47" fontFamily={FONT} fontSize="3.6" fill="#64748B">DL 0123 4567</text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="84" height="54" rx="5" fill={shade ? "#F8FAFC" : "#F5F9FF"} stroke="#BFD3FB" />
      <path d="M0 40 Q 21 32 42 40 T 84 40 V 49 a5 5 0 0 1 -5 5 H5 a5 5 0 0 1 -5 -5 Z" fill="#DBEAFE" opacity="0.6" />
      <text x="42" y="12" fontFamily={FONT} fontSize="4.6" fontWeight="800" fill="#1E3A8A" textAnchor="middle" letterSpacing="0.6">SEGURO SOCIAL</text>
      <text x="42" y="25" fontFamily="ui-monospace, Menlo, monospace" fontSize="7.4" fontWeight="700" fill={INK} textAnchor="middle">XXX-XX-6789</text>
      <rect x="22" y="30" width="40" height="0.8" fill={LINE} />
      <text x="42" y="36.5" fontFamily={FONT} fontSize="4.2" fontWeight="600" fill="#334155" textAnchor="middle">{shade ? "SOFÍA LÓPEZ" : "MARÍA LÓPEZ"}</text>
    </g>
  );
}

/** A sheet with a title and rows (pay stub, letter, mileage log, receipt, other). */
function Sheet({ title, rows, total, clip }: { title: string; rows: Array<[string, string]>; total?: [string, string]; clip?: boolean }) {
  return (
    <>
      <rect x="20" y="3" width="56" height="66" rx="3" fill="#fff" stroke={LINE} />
      <text x="25" y="12.5" fontFamily={FONT} fontSize="5" fontWeight="800" fill={INK}>{title}</text>
      {rows.map(([a, b], i) => (
        <g key={i}>
          <text x="25" y={21 + i * 7} fontFamily={FONT} fontSize="3.6" fill="#64748B">{a}</text>
          <text x="71" y={21 + i * 7} fontFamily={FONT} fontSize="3.6" fontWeight="600" fill={INK} textAnchor="end">{b}</text>
          <rect x="25" y={23 + i * 7} width="46" height="0.5" fill="#E2E8F0" />
        </g>
      ))}
      {total && (
        <g>
          <rect x="24" y="56" width="48" height="9" rx="1.6" fill="#EAF1FF" />
          <text x="27" y="62" fontFamily={FONT} fontSize="3.8" fontWeight="600" fill="#1E3A8A">{total[0]}</text>
          <text x="69" y="62.2" fontFamily={FONT} fontSize="4.6" fontWeight="800" fill={BLUE} textAnchor="end">{total[1]}</text>
        </g>
      )}
      {clip && <path d="M66 0 v10 a4 4 0 0 0 8 0 V2 a2.5 2.5 0 0 0 -5 0 v8" fill="none" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round" />}
    </>
  );
}

const ART: Record<string, () => ReactNode> = {
  id: () => <Card kind="id" />,
  spouse: () => <><Card kind="id" x={14} y={4} shade={1} /><Card kind="id" x={4} y={14} /></>,
  ssn: () => <Card kind="ssn" />,
  deps: () => <><Card kind="ssn" x={14} y={4} shade={1} /><Card kind="ssn" x={4} y={14} /></>,
  w2: () => <Form code="W-2" sub="Salarios y retenciones" boxes={[{ label: "1 Salarios", value: "$48,250", hi: true }, { label: "2 Retenido", value: "$5,120", hi: true }, { label: "a Seg. Social" }, { label: "b EIN" }, { label: "c Empleador" }, { label: "16 Estatal" }]} />,
  k1099: () => <Form code="1099-NEC" sub="Pagos a no empleados" boxes={[{ label: "1 Pagos", value: "$12,400", hi: true }, { label: "4 Retenido", value: "$0" }, { label: "Pagador" }, { label: "Tu número" }, { label: "Dirección" }, { label: "Estado" }]} />,
  int: () => <Form code="1099-INT" sub="Intereses de tu banco" boxes={[{ label: "1 Intereses", value: "$184", hi: true }, { label: "4 Retenido", value: "$0" }, { label: "Banco" }, { label: "Tu número" }]} />,
  home: () => <Form code="1098" sub="Intereses de hipoteca" boxes={[{ label: "1 Intereses", value: "$9,860", hi: true }, { label: "2 Saldo", value: "$212,000" }, { label: "Prestamista" }, { label: "Dirección" }]} />,
  mkt: () => <Form code="1095-A" sub="Seguro médico del Marketplace" boxes={[{ label: "A Prima", value: "$412", hi: true }, { label: "C Ayuda", value: "$318", hi: true }, { label: "Póliza" }, { label: "Cubiertos" }]} />,
  payroll: () => <Form code="941" sub="Nómina del trimestre" boxes={[{ label: "2 Salarios", value: "$36,000", hi: true }, { label: "3 Retenido", value: "$3,840" }, { label: "EIN" }, { label: "Trimestre" }]} />,
  prior: () => <Form code="1040" sub="Declaración del año pasado" boxes={[{ label: "11 Ingreso", value: "$51,300", hi: true }, { label: "34 Reembolso", value: "$1,610" }, { label: "Estado civil" }, { label: "Dependientes" }]} />,
  pay: () => <Sheet title="Talón de pago" rows={[["Horas", "80"], ["Pago bruto", "$1,840.00"], ["Impuestos", "−$232.10"], ["Seguro Social", "−$114.08"]]} total={["Neto", "$1,493.82"]} />,
  ein: () => <Sheet title="Carta del EIN" rows={[["Negocio", "Taller López LLC"], ["Fecha", "12 mar 2024"], ["Tipo", "LLC"]]} total={["EIN", "12-3456789"]} />,
  vehicle: () => <Sheet title="Registro de millas" rows={[["2 ene · Cliente Vega", "34 mi"], ["5 ene · Home Depot", "12 mi"], ["9 ene · Obra Ruiz", "48 mi"], ["12 ene · Proveedor", "21 mi"]]} total={["Total del año", "8,420 mi"]} />,
  assets: () => <Sheet title="Factura de compra" rows={[["Compresor de aire", "$1,299"], ["Escalera 24 pies", "$389"], ["Taladro inalámbrico", "$249"]]} total={["Total", "$1,937.00"]} />,
  other: () => <Sheet title="Otro documento" rows={[["1098-T escuela", "✓"], ["Guardería", "✓"], ["Donaciones", "✓"]]} clip />,
};

/** The example picture of a document kind (96×72, scales to its box). */
export function TaxDocArt({ kind, className, title }: { kind: string; className?: string; title?: string }) {
  const draw = ART[kind] ?? ART.other;
  return (
    <svg viewBox="0 0 96 72" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {draw()}
    </svg>
  );
}

/** Kinds with a photo of a sample document (public/tax-examples/<kind>.webp; real form layouts, sample data, MUESTRA). */
const PHOTOS = new Set(["id", "ssn", "spouse", "deps", "w2", "k1099", "pay", "int", "home", "mkt", "other", "ein", "payroll", "vehicle", "assets", "prior"]);

/** The example of a document as a photo of a sample (the drawing when there's no photo for that kind). */
export function TaxDocPhoto({ kind, className, title }: { kind: string; className?: string; title?: string }) {
  if (!PHOTOS.has(kind)) return <TaxDocArt kind={kind} className={className} title={title} />;
  return <img src={`/tax-examples/${kind}.webp`} alt={title ?? ""} loading="lazy" decoding="async" draggable={false} className={className} />;
}
