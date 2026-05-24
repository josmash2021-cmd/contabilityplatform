import { useState, useMemo, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, Mail, Phone, MapPin, ShoppingBag, Calendar, Wallet, X, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { formatCurrency } from "@/lib/utils";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PAYMENT_LABELS: Record<string, string> = { cash: "Efectivo", zelle: "Zelle", card: "Tarjeta", mixed: "Mixto" };

export default function Customers() {
  const [letter, setLetter] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", lastName: "", email: "", phone: "", address: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [previewData, setPreviewData] = useState<Array<Record<string, string>>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery({ type: "all" });
  const { data: stats } = trpc.customers.stats.useQuery();

  const create = trpc.customers.create.useMutation({
    onSuccess: () => { utils.customers.list.invalidate(); utils.customers.stats.invalidate(); setShowAdd(false); reset(); toast.success("Cliente creado"); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.customers.update.useMutation({
    onSuccess: () => { utils.customers.list.invalidate(); utils.customers.stats.invalidate(); setEditing(null); reset(); toast.success("Actualizado"); },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.customers.delete.useMutation({
    onSuccess: () => { utils.customers.list.invalidate(); utils.customers.stats.invalidate(); toast.success("Eliminado"); },
    onError: (err) => toast.error(err.message),
  });
  const importExcel = trpc.customers.importExcel.useMutation({
    onSuccess: (res) => { utils.customers.list.invalidate(); utils.customers.stats.invalidate(); toast.success(`${res.created} importados${res.errors > 0 ? `, ${res.errors} errores` : ""}`); setImportOpen(false); setPreviewData([]); },
    onError: (err) => toast.error(err.message),
  });

  const reset = () => setForm({ name: "", lastName: "", email: "", phone: "", address: "" });

  const startEdit = (c: NonNullable<typeof customers>[0]) => {
    setEditing(c.id);
    setForm({ name: c.name, lastName: c.lastName || "", email: c.email || "", phone: c.phone || "", address: c.address || "" });
    setShowAdd(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) update.mutate({ id: editing, ...form });
    else create.mutate(form);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Array<string | number>>(ws, { header: 1 });
        if (data.length < 2) { toast.error("El archivo esta vacio"); return; }
        const headers = (data[0] as Array<string | number>).map((h) => String(h).toLowerCase().trim());
        const rows = data.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
          return obj;
        }).filter((r) => r[headers[0]]);
        const mapped = rows.map((row) => {
          const get = (...keys: string[]) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== "") return row[k]; } return ""; };
          return {
            name: get("nombre", "name", "nombres"), lastName: get("apellido", "lastname", "apellidos"),
            email: get("email", "correo", "e-mail"), phone: get("telefono", "phone", "telf", "celular"),
            address: get("direccion", "address", "dir"), notes: get("notas", "notes"),
          };
        }).filter((m) => m.name);
        setPreviewData(mapped);
      } catch { toast.error("Error al leer el archivo"); }
    };
    reader.readAsBinaryString(file);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return customers ?? [];
    const q = search.toLowerCase();
    return (customers ?? []).filter((c: NonNullable<typeof customers>[0]) => c.name.toLowerCase().includes(q) || (c.lastName || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q));
  }, [customers, search]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof filtered>();
    ALPHABET.forEach((l) => g.set(l, []));
    filtered.forEach((c: typeof filtered[0]) => { const f = c.name.charAt(0).toUpperCase(); if (g.has(f)) g.get(f)!.push(c); });
    return g;
  }, [filtered]);

  return (
    <div className="p-8 lg:p-10 space-y-6 bg-white min-h-screen">
      <AnimatedPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-black">Clientes</h1>
            <p className="text-neutral-400 text-sm mt-1">{stats?.total ?? 0} clientes</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-neutral-200 text-neutral-600 text-sm">Importar Excel</Button>
              </DialogTrigger>
              <DialogContent className="bg-white border-neutral-200 max-w-2xl">
                <DialogHeader><DialogTitle className="text-black font-medium text-base">Importar desde Excel</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-neutral-200 rounded-lg p-6 text-center">
                    <p className="text-xs text-neutral-400 mb-3">Columnas: Nombre, Apellido, Telefono, Email, Direccion</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                    <Button variant="outline" className="border-neutral-200 text-sm" onClick={() => fileRef.current?.click()}>Seleccionar archivo</Button>
                  </div>
                  {previewData.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-black font-medium">{previewData.length} registros</p>
                        <button onClick={() => setPreviewData([])} className="text-neutral-400 hover:text-black transition-colors duration-150"><X className="w-4 h-4" /></button>
                      </div>
                      <ScrollArea className="max-h-64 border border-neutral-200 rounded-lg">
                        <table className="w-full text-xs"><thead className="bg-neutral-50 sticky top-0"><tr>{["Nombre", "Apellido", "Telefono", "Email"].map((h) => (<th key={h} className="text-left px-3 py-2 text-neutral-500 font-normal">{h}</th>))}</tr></thead><tbody>{previewData.slice(0, 50).map((row, idx) => (<tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">{["name", "lastName", "phone", "email"].map((k) => (<td key={k} className="px-3 py-1.5 text-neutral-600">{row[k]}</td>))}</tr>))}</tbody></table>
                      </ScrollArea>
                      <Button className="w-full bg-black hover:bg-neutral-800 text-white" onClick={() => importExcel.mutate(previewData as any)} disabled={importExcel.isPending}>{importExcel.isPending ? "Importando..." : `Importar ${previewData.length}`}</Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button className="bg-black hover:bg-neutral-800 text-white text-sm" onClick={() => { setEditing(null); reset(); }}><Plus className="w-3.5 h-3.5 mr-1" /> Nuevo</Button>
              </DialogTrigger>
              <DialogContent className="bg-white border-neutral-200 max-w-md">
                <DialogHeader><DialogTitle className="text-black font-medium">{editing ? "Editar" : "Nuevo"} Cliente</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-neutral-400 mb-1 block">Nombre *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-neutral-200 text-sm" required /></div>
                    <div><label className="text-xs text-neutral-400 mb-1 block">Apellido</label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="border-neutral-200 text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-neutral-400 mb-1 block">Telefono</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border-neutral-200 text-sm" /></div>
                    <div><label className="text-xs text-neutral-400 mb-1 block">Email</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border-neutral-200 text-sm" /></div>
                  </div>
                  <div><label className="text-xs text-neutral-400 mb-1 block">Direccion</label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border-neutral-200 text-sm" /></div>
                  <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white">{editing ? "Actualizar" : "Crear"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </AnimatedPage>

      <AnimatedPage delay={80}>
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm border-neutral-200" />
        </div>
      </AnimatedPage>

      {!search.trim() && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setLetter(undefined)} className={`text-[11px] w-7 h-7 rounded flex items-center justify-center transition-colors duration-150 ${!letter ? "bg-black text-white" : "text-neutral-400 hover:bg-neutral-100"}`}>#</button>
          {ALPHABET.map((l) => {
            const hasClients = (stats?.alphabet ?? []).some((a) => a.letter === l);
            return (
              <button key={l} onClick={() => setLetter(letter === l ? undefined : l)} className={`text-[11px] w-7 h-7 rounded flex items-center justify-center transition-colors duration-150 ${letter === l ? "bg-black text-white" : hasClients ? "text-neutral-600 hover:bg-neutral-100" : "text-neutral-200 cursor-default"}`}>{l}</button>
            );
          })}
        </div>
      )}

      {search.trim() ? (
        <AnimatedPage delay={160}>
          <div className="space-y-2">
            {filtered.map((c: typeof filtered[0]) => <CustomerCard key={c.id} c={c} onEdit={startEdit} onDelete={(id) => { if (confirm("Eliminar?")) del.mutate({ id }); }} />)}
          </div>
        </AnimatedPage>
      ) : (
        <AnimatedPage delay={160}>
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([l, group]) => {
              if (group.length === 0) return null;
              return (
                <div key={l}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg font-medium text-black w-8">{l}</span>
                    <div className="flex-1 h-px bg-neutral-100" />
                    <span className="text-xs text-neutral-400">{group.length}</span>
                  </div>
                  <div className="space-y-2 pl-8">{group.map((c: typeof group[0]) => <CustomerCard key={c.id} c={c} onEdit={startEdit} onDelete={(id) => { if (confirm("Eliminar?")) del.mutate({ id }); }} />)}</div>
                </div>
              );
            })}
          </div>
        </AnimatedPage>
      )}
    </div>
  );
}

function CustomerCard({ c, onEdit, onDelete }: { c: any; onEdit: (c: any) => void; onDelete: (id: number) => void }) {
  const fullName = `${c.name}${c.lastName ? ` ${c.lastName}` : ""}`;
  const [expanded, setExpanded] = useState(false);
  const { data: purchaseHistory } = trpc.sales.byCustomer.useQuery({ customerId: c.id }, { enabled: expanded });

  return (
    <div className="border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-black font-medium">{fullName}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-neutral-400">
            {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
            {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
            {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Desde {new Date(c.createdAt).toLocaleDateString("es-ES")}</span>
          </div>
        </div>
        <div className="flex gap-1 ml-3">
          <button className="p-1.5 text-neutral-300 hover:text-black transition-colors duration-150" onClick={() => onEdit(c)}><Pencil className="w-3.5 h-3.5" /></button>
          <button className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors duration-150" onClick={() => onDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <button onClick={() => setExpanded(!expanded)} className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-black transition-colors duration-150">
        <ShoppingBag className="w-3.5 h-3.5" />
        {expanded ? "Ocultar historial" : "Ver compras"}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          {purchaseHistory === undefined ? (<p className="text-xs text-neutral-400">Cargando...</p>) :
            purchaseHistory.length === 0 ? (<p className="text-xs text-neutral-400">Sin compras registradas</p>) : (
              <div className="space-y-2">
                {purchaseHistory.map((sale: typeof purchaseHistory[0]) => (
                  <div key={sale.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-black">{sale.invoiceNumber}</span>
                      <span className="text-[10px] text-neutral-400">{new Date(sale.createdAt).toLocaleDateString("es-ES")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] text-neutral-500"><Wallet className="w-3 h-3" />{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>
                      <span className="text-xs font-medium text-black">{formatCurrency(sale.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
