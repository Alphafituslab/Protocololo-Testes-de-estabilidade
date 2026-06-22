import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAtivoReferences,
  useCreateAtivoReference,
  useUpdateAtivoReference,
  useDeleteAtivoReference,
  getListAtivoReferencesQueryKey,
  type AtivoReference,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, FlaskConical } from "lucide-react";
import { UnlockDialog } from "@/components/unlock-dialog";

async function verifyMasterPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: body.error ?? "Senha incorreta." };
  } catch {
    return { ok: false, error: "Erro de conexão. Tente novamente." };
  }
}

type RefForm = {
  parameter: string;
  minValue: string;
  maxValue: string;
  unit: string;
  overage: string;
  notes: string;
};

const emptyForm: RefForm = { parameter: "", minValue: "", maxValue: "", unit: "mg", overage: "", notes: "" };

const UNITS = ["mg", "mcg", "UI", "UFC/g", "g", "%"];

export default function AtivoReferencesPage() {
  const queryClient = useQueryClient();
  const { data: refs = [], isLoading } = useListAtivoReferences({
    query: { queryKey: getListAtivoReferencesQueryKey() },
  });

  const createRef = useCreateAtivoReference();
  const updateRef = useUpdateAtivoReference();
  const deleteRef = useDeleteAtivoReference();

  const [form, setForm] = useState<RefForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AtivoReference | null>(null);
  const [search, setSearch] = useState("");

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.parameter.trim()) {
      setError("O nome do ativo é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        parameter: form.parameter.trim(),
        minValue: form.minValue.trim() || null,
        maxValue: form.maxValue.trim() || null,
        unit: form.unit || "mg",
        overage: form.overage.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId !== null) {
        await updateRef.mutateAsync({ id: editingId, data: payload });
      } else {
        await createRef.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });
      resetForm();
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (ref: AtivoReference) => {
    setEditingId(ref.id);
    setForm({
      parameter: ref.parameter,
      minValue: ref.minValue ?? "",
      maxValue: ref.maxValue ?? "",
      unit: ref.unit ?? "mg",
      overage: ref.overage ?? "",
      notes: ref.notes ?? "",
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (ref: AtivoReference) => {
    setPendingDelete(ref);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteRef.mutateAsync({ id: pendingDelete.id });
    queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });
    if (editingId === pendingDelete.id) resetForm();
    setPendingDelete(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Banco de Limites ANVISA</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os limites padrão por ativo. Eles serão preenchidos automaticamente em novos protocolos.
          </p>
        </div>
      </div>

      {/* Form card */}
      <Card className="border-indigo-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-indigo-700 uppercase tracking-wide">
            {editingId !== null ? "Editar entrada" : "Nova entrada"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Nome do Ativo <span className="text-red-500">*</span>
              </label>
              <input
                value={form.parameter}
                onChange={e => setForm(f => ({ ...f, parameter: e.target.value }))}
                placeholder="ex: Cálcio, Vitamina D, Zinco…"
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Unidade</label>
              <select
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Mínimo ANVISA{" "}
                <span className="text-muted-foreground font-normal">(opcional — use "livre" se não houver)</span>
              </label>
              <input
                type="text"
                value={form.minValue}
                onChange={e => setForm(f => ({ ...f, minValue: e.target.value }))}
                placeholder="ex: 400  ou  livre"
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Máximo ANVISA{" "}
                <span className="text-muted-foreground font-normal">(opcional — use "livre" se não houver)</span>
              </label>
              <input
                type="text"
                value={form.maxValue}
                onChange={e => setForm(f => ({ ...f, maxValue: e.target.value }))}
                placeholder="ex: 750  ou  livre"
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-amber-700">
                Overage{" "}
                <span className="text-muted-foreground font-normal">(% extra adicionada na manufatura)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={form.overage}
                  onChange={e => setForm(f => ({ ...f, overage: e.target.value }))}
                  placeholder="0"
                  className="border border-amber-300 bg-amber-50 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-28 text-right"
                />
                <span className="text-sm font-medium text-amber-700">%</span>
                {form.overage && form.minValue && (() => {
                  const min = parseFloat(form.minValue.replace(",", "."));
                  const ov = parseFloat(form.overage.replace(",", "."));
                  if (!isNaN(min) && !isNaN(ov) && ov > 0) {
                    const mfg = min * (1 + ov / 100);
                    return (
                      <span className="text-xs text-amber-600">
                        → {mfg % 1 === 0 ? mfg : mfg.toFixed(2)} {form.unit} manufaturado
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Qtd manufaturada = declarada × (1 + overage%). Garante o teor mínimo ao final do prazo de validade.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Observações / Referência normativa</label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ex: RDC 269/2005, Portaria 32/1998…"
              className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              {saving ? "Salvando…" : editingId !== null ? "Atualizar" : "Adicionar ao banco"}
            </Button>
            {editingId !== null && (
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            Referências cadastradas
            <span className="bg-indigo-100 text-indigo-700 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {refs.length}
            </span>
          </CardTitle>
          {/* Search */}
          <div className="relative mt-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ativo…"
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm leading-none"
              >✕</button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-6">Carregando…</p>
          ) : refs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-6">
              Nenhuma entrada cadastrada. Adicione a primeira acima.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">Ativo</th>
                    <th className="text-right px-3 py-2 font-medium">Mín.</th>
                    <th className="text-right px-3 py-2 font-medium">Máx.</th>
                    <th className="text-left px-3 py-2 font-medium">Unidade</th>
                    <th className="text-right px-3 py-2 font-medium text-amber-600">Overage</th>
                    <th className="text-left px-3 py-2 font-medium">Observações</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {refs
                    .filter(r => !search.trim() || r.parameter.toLowerCase().includes(search.trim().toLowerCase()))
                    .map((ref, i) => (
                    <tr
                      key={ref.id}
                      className={`border-b last:border-0 transition-colors ${editingId === ref.id ? "bg-indigo-50" : i % 2 === 0 ? "bg-white" : "bg-muted/20"} hover:bg-indigo-50/60`}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{ref.parameter}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm">
                        {ref.minValue ? (
                          <span className="text-indigo-700">{ref.minValue}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm">
                        {ref.maxValue ? (
                          <span className="text-indigo-700">{ref.maxValue}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{ref.unit}</td>
                      <td className="px-3 py-2.5 text-right">
                        {ref.overage ? (
                          <span className="text-amber-600 font-medium font-mono">{ref.overage}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">
                        {ref.notes ?? ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleEdit(ref)}
                            title="Editar"
                            className="p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ref)}
                            title="Remover"
                            className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground pb-4">
        Os limites cadastrados aqui são preenchidos automaticamente em novos protocolos (exceto "Qtd declarada", que é específica de cada fórmula). Use o botão "↩ banco" na aba Resultados para restaurar os valores padrão em protocolos já existentes.
      </p>

      <UnlockDialog
        open={pendingDelete !== null}
        onOpenChange={open => { if (!open) setPendingDelete(null); }}
        onUnlock={verifyMasterPassword}
        onSuccess={confirmDelete}
        title="Confirmar exclusão"
        description={`Remover "${pendingDelete?.parameter}" do banco de limites? Esta ação não pode ser desfeita. Digite a senha mestra para confirmar.`}
        submitLabel="Confirmar exclusão"
      />
    </div>
  );
}
