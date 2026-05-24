import { trpc } from "@/providers/trpc";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { useState } from "react";
import { AnimatedPage } from "@/components/AnimatedPage";

const PAYMENT_LABELS: Record<string, string> = { cash: "Caja", zelle: "Zelle", card: "Tarjeta", mixed: "Mixto" };
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Completada", cls: "bg-neutral-100 text-neutral-600" },
  pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700" },
  cancelled: { label: "Cancelada", cls: "bg-red-50 text-red-600" },
  refunded: { label: "Reembolsada", cls: "bg-neutral-50 text-neutral-400" },
};

export default function Transactions() {
  const { data: salesList } = trpc.sales.list.useQuery();
  const [sel, setSel] = useState<number | null>(null);
  const { data: detail } = trpc.sales.byId.useQuery({ id: sel! }, { enabled: !!sel });

  const total = (salesList ?? []).reduce((s: number, v: NonNullable<typeof salesList>[0]) => s + Number(v.total), 0);

  return (
    <div className="p-8 lg:p-10 space-y-6 bg-white min-h-screen">
      <AnimatedPage>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-medium text-black">Transacciones</h1>
            <p className="text-neutral-400 text-sm mt-1">{salesList?.length ?? 0} ventas - Total: {formatCurrency(total)}</p>
          </div>
        </div>
      </AnimatedPage>
      <AnimatedPage delay={80}>
        <div className="border border-neutral-200 rounded-lg overflow-hidden hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-100 hover:bg-transparent">
                <TableHead className="text-neutral-400 text-xs font-normal">Factura</TableHead>
                <TableHead className="text-neutral-400 text-xs font-normal">Cliente</TableHead>
                <TableHead className="text-neutral-400 text-xs font-normal">Metodo</TableHead>
                <TableHead className="text-neutral-400 text-xs font-normal">Total</TableHead>
                <TableHead className="text-neutral-400 text-xs font-normal">Estado</TableHead>
                <TableHead className="text-neutral-400 text-xs font-normal">Fecha</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(salesList ?? []).map((s: NonNullable<typeof salesList>[0]) => (
                <TableRow key={s.id} className="border-neutral-100 hover:bg-neutral-50 transition-colors duration-150">
                  <TableCell className="text-sm text-black font-medium">{s.invoiceNumber}</TableCell>
                  <TableCell className="text-sm text-neutral-600">{s.customerName || "General"}</TableCell>
                  <TableCell><span className="text-xs text-neutral-400">{PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod}</span></TableCell>
                  <TableCell className="text-sm text-black font-medium">{formatCurrency(s.total)}</TableCell>
                  <TableCell><Badge className={`${STATUS_LABELS[s.status]?.cls || ""} text-[10px] font-normal`}>{STATUS_LABELS[s.status]?.label || s.status}</Badge></TableCell>
                  <TableCell className="text-xs text-neutral-400">{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell className="text-right"><button onClick={() => setSel(s.id)} className="text-neutral-300 hover:text-black transition-colors duration-150"><Eye className="w-4 h-4" /></button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AnimatedPage>
      <Dialog open={!!sel} onOpenChange={() => setSel(null)}>
        <DialogContent className="bg-white border-neutral-200 max-w-md">
          <DialogHeader><DialogTitle className="text-black font-medium text-base">Venta {detail?.invoiceNumber}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-neutral-400">Cliente</span><span className="text-black">{detail.customerName || "General"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-neutral-400">Metodo</span><span className="text-neutral-600">{PAYMENT_LABELS[detail.paymentMethod] || detail.paymentMethod}</span></div>
              <div className="border-t border-neutral-100 pt-2 space-y-1.5">
                {(detail.items ?? []).map((i: NonNullable<typeof detail.items>[0]) => (
                  <div key={i.id} className="flex justify-between text-sm"><span className="text-neutral-600">{i.serviceName} x{i.quantity}</span><span className="text-black">{formatCurrency(i.total)}</span></div>
                ))}
              </div>
              <div className="border-t border-neutral-100 pt-2 flex justify-between"><span className="text-black font-medium">Total</span><span className="text-black font-medium">{formatCurrency(detail.total)}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
