import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, Wrench, Package } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";

function CurrencyInput({ value, onChange, placeholder, required }: { value: string; onChange: (val: string) => void; placeholder?: string; required?: boolean }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    onChange(raw);
  };
  const displayValue = value ? `$${value}` : "";
  return (
    <div className="relative">
      <Input type="text" inputMode="decimal" placeholder={placeholder || "$0.00"} value={displayValue} onChange={handleChange}
        className="border-neutral-200 text-sm mt-1 pl-6" required={required} />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none" style={{ marginTop: "2px" }}>
        {value ? "" : "$"}
      </span>
    </div>
  );
}

export default function Services() {
  const { data: servicesList, isLoading, error } = trpc.services.list.useQuery();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", cost: "", type: "service" as "service" | "product" });

  const create = trpc.services.create.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); setShowAdd(false); reset(); toast.success("Creado exitosamente"); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.services.update.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); setEditing(null); reset(); toast.success("Actualizado"); },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.services.delete.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); toast.success("Eliminado"); },
    onError: (err) => toast.error(err.message),
  });

  const reset = () => { setForm({ name: "", description: "", price: "", cost: "", type: "service" }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { type, ...rest } = form;
    const data = { ...rest, price: rest.price.replace(/^\$/, ""), cost: rest.cost.replace(/^\$/, "") || undefined };
    if (editing) update.mutate({ id: editing, ...data });
    else create.mutate(data);
  };

  const items = Array.isArray(servicesList) ? servicesList : [];
  const filtered = items.filter((s: any) => (s?.name || "").toLowerCase().includes(search.toLowerCase()));

  const typeLabel = (t?: string) => t === "product" ? "Producto" : "Servicio";

  if (error) {
    return (
      <div className="p-8 lg:p-10 bg-white min-h-screen">
        <p className="text-red-500">Error cargando servicios: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10 space-y-6 bg-white min-h-screen">
      <AnimatedPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-black">Servicios y Productos</h1>
            <p className="text-neutral-400 text-sm mt-1">{items.length} items</p>
          </div>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button className="bg-black hover:bg-neutral-800 text-white text-sm" onClick={() => { setEditing(null); reset(); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-neutral-200">
              <DialogHeader><DialogTitle className="text-black font-medium text-lg">{editing ? "Editar" : "Nuevo"} {form.type === "product" ? "Producto" : "Servicio"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-1.5 p-0.5 bg-neutral-100 rounded-md w-fit mx-auto">
                  <button type="button" onClick={() => setForm({ ...form, type: "service" })} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors duration-150 ${form.type === "service" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}><Wrench className="w-3 h-3" /> Servicio</button>
                  <button type="button" onClick={() => setForm({ ...form, type: "product" })} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors duration-150 ${form.type === "product" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}><Package className="w-3 h-3" /> Producto</button>
                </div>
                <div className="space-y-3">
                  <div><Label className="text-xs text-neutral-500">Nombre del {form.type === "product" ? "producto" : "servicio"} *</Label>
                    <Input placeholder={`Ej: ${form.type === "product" ? "Filtro de aceite" : "Cambio de aceite"}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-neutral-200 text-sm mt-1" required /></div>
                  <div><Label className="text-xs text-neutral-500">Descripcion</Label>
                    <Input placeholder={`Describe el ${form.type === "product" ? "producto" : "servicio"}...`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-neutral-200 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-neutral-500">Precio de venta *</Label><CurrencyInput value={form.price} onChange={(val) => setForm({ ...form, price: val })} placeholder="$0.00" required /></div>
                    <div><Label className="text-xs text-neutral-500">Costo interno</Label><CurrencyInput value={form.cost} onChange={(val) => setForm({ ...form, cost: val })} placeholder="$0.00" /></div>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white h-10">{editing ? "Actualizar" : "Crear"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </AnimatedPage>

      <AnimatedPage delay={80}>
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm border-neutral-200" />
        </div>
      </AnimatedPage>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Cargando...</p>
      ) : (
        <AnimatedPage delay={160}>
          <div className="border border-neutral-200 rounded-lg overflow-hidden hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-100 hover:bg-transparent">
                  <TableHead className="text-neutral-400 text-xs font-normal">Item</TableHead>
                  <TableHead className="text-neutral-400 text-xs font-normal">Tipo</TableHead>
                  <TableHead className="text-neutral-400 text-xs font-normal">Precio de venta</TableHead>
                  <TableHead className="text-neutral-400 text-xs font-normal">Costo interno</TableHead>
                  <TableHead className="text-neutral-400 text-xs font-normal text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s: any) => (
                  <TableRow key={s?.id || Math.random()} className="border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                          {s?.type === "product" ? <Package className="w-5 h-5 text-neutral-400" /> : <Wrench className="w-5 h-5 text-neutral-400" />}
                        </div>
                        <div>
                          <p className="text-sm text-black font-medium">{s?.name || "Sin nombre"}</p>
                          <p className="text-xs text-neutral-400">{s?.description || "-"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{typeLabel(s?.type)}</span></TableCell>
                    <TableCell className="text-sm text-black font-medium">{formatCurrency(s?.price || 0)}</TableCell>
                    <TableCell className="text-sm text-neutral-500">{formatCurrency(s?.cost || 0)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button className="p-1 text-neutral-300 hover:text-black transition-colors duration-150" onClick={() => { setEditing(s?.id); setForm({ name: s?.name || "", description: s?.description || "", price: String(s?.price || ""), cost: String(s?.cost || ""), type: (s?.type as "service" | "product") || "service" }); setShowAdd(true); }}><Pencil className="w-3.5 h-3.5" /></button>
                        <button className="p-1 text-neutral-300 hover:text-red-500 transition-colors duration-150" onClick={() => { if (confirm("Eliminar?")) del.mutate({ id: s?.id }); }}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </AnimatedPage>
      )}
    </div>
  );
}
