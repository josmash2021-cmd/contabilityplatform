import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Target, Plus, Trash2, TrendingUp } from "lucide-react";

export default function PersonalGoals() {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();

  const { data: goals, isLoading } = trpc.personal.listGoals.useQuery();

  const createMut = trpc.personal.createGoal.useMutation({
    onSuccess: () => { utils.personal.listGoals.invalidate(); setShowForm(false); toast.success("Meta creada"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.personal.deleteGoal.useMutation({
    onSuccess: () => { utils.personal.listGoals.invalidate(); toast.success("Meta eliminada"); },
  });
  const updateMut = trpc.personal.updateGoal.useMutation({
    onSuccess: () => { utils.personal.listGoals.invalidate(); toast.success("Progreso actualizado"); },
  });

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-black">Metas de Ahorro</h1>
          <p className="text-xs text-neutral-500">{(goals ?? []).filter(g => g.isActive).length} activas</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-black text-white hover:bg-neutral-800 rounded-lg h-9 text-sm">
          <Plus className="w-4 h-4 mr-1.5" /> Nueva Meta
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Cargando...</p>
      ) : (goals ?? []).length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-400">No tienes metas de ahorro aun</p>
          <p className="text-xs text-neutral-400 mt-1">Crea tu primera meta para empezar a ahorrar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(goals ?? []).map((goal) => {
            const current = Number(goal.currentAmount);
            const target = Number(goal.targetAmount);
            const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const remaining = Math.max(target - current, 0);

            return (
              <div key={goal.id} className="border border-neutral-200 rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-black">{goal.name}</h3>
                    <p className="text-[11px] text-neutral-500">{goal.category} {goal.deadline ? `· Vence ${new Date(goal.deadline).toLocaleDateString("es")}` : ""}</p>
                  </div>
                  <button onClick={() => { if (confirm("Eliminar esta meta?")) deleteMut.mutate({ id: goal.id }); }} className="text-neutral-300 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-600">{formatCurrency(current)} de {formatCurrency(target)}</span>
                    <span className="font-medium text-black">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-black rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-neutral-500">Faltan {formatCurrency(remaining)}</p>
                  <AddProgressButton goalId={goal.id} current={current} onAdd={(amount) => updateMut.mutate({ id: goal.id, currentAmount: current + amount })} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Goal Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-base">Nueva Meta de Ahorro</DialogTitle></DialogHeader>
          <GoalForm onSubmit={(data) => createMut.mutate(data)} isPending={createMut.isPending} />
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}

function GoalForm({ onSubmit, isPending }: { onSubmit: (data: any) => void; isPending: boolean }) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !targetAmount) return;
    onSubmit({ name, targetAmount: parseFloat(targetAmount), deadline: deadline || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><Label className="text-xs">Nombre de la meta</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Vacaciones 2026" className="h-9 text-sm" required /></div>
      <div><Label className="text-xs">Monto objetivo ($)</Label><Input type="number" step="0.01" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} className="h-9 text-sm" required /></div>
      <div><Label className="text-xs">Fecha limite (opcional)</Label><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="h-9 text-sm" /></div>
      <Button type="submit" disabled={isPending} className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-9 text-sm">{isPending ? "Creando..." : "Crear Meta"}</Button>
    </form>
  );
}

function AddProgressButton({ goalId, current, onAdd }: { goalId: number; current: number; onAdd: (amount: number) => void }) {
  const [amount, setAmount] = useState("");
  const [show, setShow] = useState(false);

  if (!show) return <Button variant="ghost" size="sm" onClick={() => setShow(true)} className="h-7 text-xs text-neutral-500 hover:text-black">+ Agregar</Button>;

  return (
    <div className="flex items-center gap-1">
      <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$" className="h-7 w-20 text-xs" autoFocus />
      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => { if (amount) onAdd(parseFloat(amount)); setShow(false); setAmount(""); }}><TrendingUp className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-neutral-400" onClick={() => setShow(false)}><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}
