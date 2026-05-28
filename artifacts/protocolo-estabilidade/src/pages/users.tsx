import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Users, ArrowLeft, Eye, EyeOff, Shield } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  permissions: string[];
  createdAt: string;
};

type UserFormData = {
  username: string;
  displayName: string;
  password: string;
  role: string;
  permissions: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  analyst: "Analista",
  tecnico_lab: "Técnico de Laboratório",
  controle_qualidade: "Controle de Qualidade",
  responsavel_tecnico: "Responsável Técnico",
};

const ROLE_OPTIONS = [
  { value: "tecnico_lab", label: "Técnico de Laboratório" },
  { value: "controle_qualidade", label: "Controle de Qualidade" },
  { value: "responsavel_tecnico", label: "Responsável Técnico" },
  { value: "analyst", label: "Analista" },
  { value: "admin", label: "Administrador" },
];

// Permissions grouped by category for the UI
const PERMISSION_GROUPS = [
  {
    label: "Protocolos",
    perms: [
      { key: "protocols:view",     label: "Visualizar" },
      { key: "protocols:create",   label: "Criar" },
      { key: "protocols:edit",     label: "Editar" },
      { key: "protocols:delete",   label: "Excluir" },
      { key: "protocols:finalize", label: "Finalizar / Aprovar" },
    ],
  },
  {
    label: "Lotes e Resultados",
    perms: [
      { key: "lots:manage",      label: "Gerenciar lotes" },
      { key: "results:enter",    label: "Lançar resultados" },
      { key: "results:delete",   label: "Excluir resultados" },
    ],
  },
  {
    label: "Assinaturas",
    perms: [
      { key: "signatures:sign",   label: "Assinar certificados" },
      { key: "signatures:delete", label: "Excluir assinaturas" },
    ],
  },
  {
    label: "Sistema",
    perms: [
      { key: "catalog:manage",     label: "Catálogo (tipos de produto, cápsula, etc.)" },
      { key: "attachments:manage", label: "Gerenciar anexos" },
      { key: "settings:manage",    label: "Configurações do sistema" },
    ],
  },
];

// Default permissions per role — mirrors server-side defaultPermissionsForRole
const DEFAULT_PERMS: Record<string, string[]> = {
  admin: PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key)),
  responsavel_tecnico: [
    "protocols:view", "protocols:create", "protocols:edit", "protocols:finalize",
    "lots:manage", "results:enter", "results:delete",
    "signatures:sign", "catalog:manage", "attachments:manage",
  ],
  controle_qualidade: [
    "protocols:view", "protocols:create", "protocols:edit",
    "lots:manage", "results:enter", "signatures:sign", "attachments:manage",
  ],
  tecnico_lab: ["protocols:view", "results:enter", "signatures:sign", "attachments:manage"],
  analyst:     ["protocols:view", "results:enter", "signatures:sign"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, token: string | null, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? `Erro HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {ROLE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function PermissionsEditor({
  permissions,
  role,
  onChange,
}: {
  permissions: string[];
  role: string;
  onChange: (perms: string[]) => void;
}) {
  // Admin implicitly has all permissions — don't show the editor
  if (role === "admin") {
    return (
      <p className="text-xs text-muted-foreground italic">
        Administradores têm acesso total implicitamente.
      </p>
    );
  }

  const toggle = (key: string) => {
    onChange(
      permissions.includes(key)
        ? permissions.filter((p) => p !== key)
        : [...permissions, key],
    );
  };

  return (
    <div className="space-y-3">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {group.perms.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={permissions.includes(key)}
                  onCheckedChange={() => toggle(key)}
                  id={`perm-${key}`}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserForm({
  initial,
  onSave,
  isEdit,
}: {
  initial?: Partial<UserFormData> & { permissions?: string[] };
  onSave: (data: UserFormData) => Promise<void>;
  isEdit?: boolean;
}) {
  const [form, setForm] = useState<UserFormData>({
    username: initial?.username ?? "",
    displayName: initial?.displayName ?? "",
    password: "",
    role: initial?.role ?? "analyst",
    permissions: initial?.permissions ?? DEFAULT_PERMS["analyst"] ?? [],
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  // When the role changes, auto-apply the template (but user can override)
  const handleRoleChange = useCallback((role: string) => {
    setForm((f) => ({ ...f, role, permissions: DEFAULT_PERMS[role] ?? [] }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && form.password.length < 6) {
      toast({ variant: "destructive", title: "Erro", description: "Senha mínima de 6 caracteres." });
      return;
    }
    setLoading(true);
    try {
      await onSave(form);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {!isEdit && (
        <div className="space-y-2">
          <Label>Usuário (login)</Label>
          <Input
            placeholder="ana.paula"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            autoCapitalize="none"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input
          placeholder="Ana Paula Silva"
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Perfil</Label>
        <RoleSelect value={form.role} onChange={handleRoleChange} />
        <p className="text-xs text-muted-foreground">
          Ao trocar o perfil, as permissões são redefinidas para o padrão do novo perfil.
        </p>
      </div>
      <div className="space-y-2">
        <Label>{isEdit ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder={isEdit ? "••••••" : "Mínimo 6 caracteres"}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={isEdit ? 0 : 6}
            required={!isEdit}
            className="pr-10"
            autoComplete={isEdit ? "new-password" : "current-password"}
          />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={() => setShowPassword((s) => !s)}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Permission editor */}
      <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="h-3.5 w-3.5" /> Permissões
        </Label>
        <PermissionsEditor
          permissions={form.permissions}
          role={form.role}
          onChange={(perms) => setForm((f) => ({ ...f, permissions: perms }))}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {isEdit ? "Salvar alterações" : "Criar usuário"}
      </Button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { token, isAdmin, user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<User[]>("/api/users", token),
    enabled: isAdmin,
  });

  const createUser = useMutation({
    mutationFn: (data: UserFormData) =>
      apiFetch<User>("/api/users", token, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setNewOpen(false);
      toast({ title: "Usuário criado com sucesso." });
    },
    onError: (err) => toast({ variant: "destructive", title: "Erro ao criar usuário", description: (err as Error).message }),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserFormData> & { active?: boolean } }) =>
      apiFetch<User>(`/api/users/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditOpen(false);
      toast({ title: "Usuário atualizado." });
    },
    onError: (err) => toast({ variant: "destructive", title: "Erro ao atualizar usuário", description: (err as Error).message }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/users/${id}`, token, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Usuário excluído." });
    },
    onError: (err) => toast({ variant: "destructive", title: "Erro ao excluir usuário", description: (err as Error).message }),
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Acesso restrito a administradores.</p>
        <Button variant="link" onClick={() => navigate("/")} className="mt-2">Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Gerenciamento de Usuários</h2>
          <p className="text-sm text-muted-foreground">Gerencie usuários e permissões de acesso ao sistema.</p>
        </div>
        <div className="ml-auto">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo usuário</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Criar novo usuário</DialogTitle></DialogHeader>
              <UserForm
                onSave={async (d) => { await createUser.mutateAsync(d); }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários cadastrados</CardTitle>
          <CardDescription>{users?.length ?? 0} usuário(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.displayName}
                      {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted-foreground italic">Total (admin)</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {(u.permissions ?? []).length} permissão(ões)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.active}
                          disabled={u.id === currentUser?.id}
                          onCheckedChange={(checked) => updateUser.mutate({ id: u.id, data: { active: checked } })}
                        />
                        <span className="text-sm text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <Dialog
                          open={editOpen && editUser?.id === u.id}
                          onOpenChange={(o) => { setEditOpen(o); if (o) setEditUser(u); }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => { setEditUser(u); setEditOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Editar: {u.displayName}</DialogTitle></DialogHeader>
                            <UserForm
                              isEdit
                              initial={{
                                displayName: u.displayName,
                                role: u.role,
                                permissions: u.permissions ?? [],
                              }}
                              onSave={async (d) => {
                                const payload: Partial<UserFormData> & { active?: boolean } = {
                                  displayName: d.displayName,
                                  role: d.role,
                                  permissions: d.permissions,
                                };
                                if (d.password) payload.password = d.password;
                                await updateUser.mutateAsync({ id: u.id, data: payload });
                              }}
                            />
                          </DialogContent>
                        </Dialog>

                        {/* Delete — hidden for own account */}
                        {u.id !== currentUser?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deleteUser.isPending}
                              >
                                {deleteUser.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O usuário <strong>{u.displayName}</strong> ({u.username}) será removido permanentemente.
                                  Assinaturas históricas feitas por ele serão preservadas.
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteUser.mutate(u.id)}
                                >
                                  Excluir permanentemente
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
