import { useState } from "react";
import {
  useListContainerTypes, useListCapsuleTypes, useListProductTypes,
  useCreateContainerType, useUpdateContainerType, useDeleteContainerType,
  useCreateCapsuleType, useUpdateCapsuleType, useDeleteCapsuleType,
  useCreateProductType, useUpdateProductType, useDeleteProductType,
  getListContainerTypesQueryKey, getListCapsuleTypesQueryKey, getListProductTypesQueryKey,
  type CatalogItem, type ProductTypeItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUnlock } from "@/hooks/use-unlock";
import { UnlockDialog } from "@/components/unlock-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, Package, Pill, FlaskConical } from "lucide-react";

type CatalogSection = "container" | "capsule" | "product";

function CatalogTable({
  title,
  icon: Icon,
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  icon: React.ElementType;
  items: CatalogItem[];
  onAdd: (name: string, description: string) => void;
  onEdit: (id: number, name: string, description: string) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  function startEdit(item: CatalogItem) {
    setEditId(item.id);
    setEditName(item.name);
    setEditDesc(item.description ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditDesc("");
  }

  function submitEdit() {
    if (!editName.trim() || editId === null) return;
    onEdit(editId, editName.trim(), editDesc.trim());
    cancelEdit();
  }

  function submitAdd() {
    if (!addName.trim()) return;
    onAdd(addName.trim(), addDesc.trim());
    setAddName("");
    setAddDesc("");
    setAdding(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {adding && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mb-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                autoFocus
                placeholder="Nome *"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); } }}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Descrição (opcional)"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); } }}
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" className="h-8 px-3" onClick={submitAdd} disabled={!addName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAdding(false); setAddName(""); setAddDesc(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum item cadastrado. Clique em "Adicionar" para começar.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 group">
            {editId === item.id ? (
              <>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição (opcional)"
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                </div>
                <Button size="sm" className="h-7 px-2" onClick={submitEdit} disabled={!editName.trim()}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground ml-2">{item.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProductTypeTable({
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: ProductTypeItem[];
  onAdd: (name: string, description: string, isPowder: boolean) => void;
  onEdit: (id: number, name: string, description: string, isPowder: boolean) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addIsPowder, setAddIsPowder] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIsPowder, setEditIsPowder] = useState(false);

  function startEdit(item: ProductTypeItem) {
    setEditId(item.id);
    setEditName(item.name);
    setEditDesc(item.description ?? "");
    setEditIsPowder(item.isPowder);
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditDesc("");
    setEditIsPowder(false);
  }

  function submitEdit() {
    if (!editName.trim() || editId === null) return;
    onEdit(editId, editName.trim(), editDesc.trim(), editIsPowder);
    cancelEdit();
  }

  function submitAdd() {
    if (!addName.trim()) return;
    onAdd(addName.trim(), addDesc.trim(), addIsPowder);
    setAddName("");
    setAddDesc("");
    setAddIsPowder(false);
    setAdding(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Tipos de Produto</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {adding && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mb-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                autoFocus
                placeholder="Nome *"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); } }}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Descrição (opcional)"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); } }}
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addIsPowder}
                onChange={(e) => setAddIsPowder(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              Em pó
            </label>
            <Button size="sm" className="h-8 px-3" onClick={submitAdd} disabled={!addName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAdding(false); setAddName(""); setAddDesc(""); setAddIsPowder(false); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum item cadastrado. Clique em "Adicionar" para começar.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 group">
            {editId === item.id ? (
              <>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição (opcional)"
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="h-7 text-sm"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsPowder}
                    onChange={(e) => setEditIsPowder(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                  />
                  Em pó
                </label>
                <Button size="sm" className="h-7 px-2" onClick={submitEdit} disabled={!editName.trim()}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.isPowder && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Em pó</span>
                  )}
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function CatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { unlock } = useUnlock();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ section: CatalogSection; id: number; name: string } | null>(null);

  const { data: containerTypes = [] } = useListContainerTypes();
  const { data: capsuleTypes = [] } = useListCapsuleTypes();
  const { data: productTypes = [] } = useListProductTypes();

  const createContainer = useCreateContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateContainer = useUpdateContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteContainer = useDeleteContainerType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListContainerTypesQueryKey() }); toast({ title: "Tipo de pote excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  const createCapsule = useCreateCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateCapsule = useUpdateCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteCapsule = useDeleteCapsuleType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCapsuleTypesQueryKey() }); toast({ title: "Tipo de cápsula excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  const createProduct = useCreateProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto adicionado" }); }, onError: () => toast({ title: "Erro ao adicionar", variant: "destructive" }) } });
  const updateProduct = useUpdateProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto atualizado" }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });
  const deleteProduct = useDeleteProductType({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductTypesQueryKey() }); toast({ title: "Tipo de produto excluído" }); setPendingDelete(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) } });

  function handleDelete(section: CatalogSection, id: number, name: string) {
    setPendingDelete({ section, id, name });
    setUnlockOpen(true);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os tipos de produto, pote e cápsula utilizados nos protocolos.
        </p>
      </div>

      <ProductTypeTable
        items={productTypes}
        onAdd={(name, description, isPowder) => createProduct.mutate({ data: { name, description, isPowder } })}
        onEdit={(id, name, description, isPowder) => updateProduct.mutate({ id, data: { name, description, isPowder } })}
        onDelete={(id, name) => handleDelete("product", id, name)}
      />

      <CatalogTable
        title="Tipos de Pote / Embalagem"
        icon={Package}
        items={containerTypes}
        onAdd={(name, description) => createContainer.mutate({ data: { name, description } })}
        onEdit={(id, name, description) => updateContainer.mutate({ id, data: { name, description } })}
        onDelete={(id, name) => handleDelete("container", id, name)}
      />

      <CatalogTable
        title="Tipos de Cápsula"
        icon={Pill}
        items={capsuleTypes}
        onAdd={(name, description) => createCapsule.mutate({ data: { name, description } })}
        onEdit={(id, name, description) => updateCapsule.mutate({ id, data: { name, description } })}
        onDelete={(id, name) => handleDelete("capsule", id, name)}
      />

      <UnlockDialog
        open={unlockOpen}
        onOpenChange={(open) => { setUnlockOpen(open); if (!open) setPendingDelete(null); }}
        onUnlock={unlock}
        onSuccess={() => {
          if (!pendingDelete) return;
          if (pendingDelete.section === "container") deleteContainer.mutate({ id: pendingDelete.id });
          else if (pendingDelete.section === "capsule") deleteCapsule.mutate({ id: pendingDelete.id });
          else deleteProduct.mutate({ id: pendingDelete.id });
        }}
        title="Confirmar exclusão"
        description={pendingDelete ? `Digite a senha mestra para excluir "${pendingDelete.name}".` : ""}
        submitLabel="Excluir"
      />
    </div>
  );
}
