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
import { Loader2, Plus, Pencil, Trash2, Users, ArrowLeft, Eye, EyeOff, Shield, BookOpen, History, Clock, CheckCircle2, XCircle, UserCheck, X, Award, FileText, Printer } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  permissions: string[];
  createdAt: string;
  accessExpiresAt?: string | null;
};

type UserFormData = {
  username: string;
  displayName: string;
  password: string;
  role: string;
  permissions: string[];
  accessExpiresAt?: string;
};

type Protocol = {
  id: number;
  certNumber: string | null;
  productName: string;
  status: string;
};

type ClientProtocolAccess = {
  id: number;
  protocolId: number;
  certNumber: string | null;
  productName: string;
  status: string;
  createdAt: string;
  canViewCertificate: boolean;
  canViewReport: boolean;
  canPrint: boolean;
};

type LoginLogEntry = {
  id: number;
  userId: number | null;
  username: string;
  success: boolean;
  failReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  loggedAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  analyst: "Analista",
  tecnico_lab: "Técnico de Laboratório",
  controle_qualidade: "Controle de Qualidade",
  responsavel_tecnico: "Responsável Técnico",
  cliente: "Cliente",
};

const ROLE_OPTIONS = [
  { value: "tecnico_lab", label: "Técnico de Laboratório" },
  { value: "controle_qualidade", label: "Controle de Qualidade" },
  { value: "responsavel_tecnico", label: "Responsável Técnico" },
  { value: "analyst", label: "Analista" },
  { value: "admin", label: "Administrador" },
  { value: "cliente", label: "Cliente (acesso ao portal)" },
];

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
  cliente:     [],
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function expiryLabel(iso: string | null | undefined): { label: string; color: string } {
  if (!iso) return { label: "Permanente", color: "text-gray-400" };
  const d = new Date(iso);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: `Expirado em ${d.toLocaleDateString("pt-BR")}`, color: "text-red-600" };
  if (daysLeft <= 7) return { label: `Expira em ${daysLeft}d (${d.toLocaleDateString("pt-BR")})`, color: "text-amber-600" };
  return { label: `Até ${d.toLocaleDateString("pt-BR")}`, color: "text-green-700" };
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

function PermissionsEditor({ permissions, role, onChange }: { permissions: string[]; role: string; onChange: (perms: string[]) => void }) {
  if (role === "admin") return <p className="text-xs text-muted-foreground italic">Administradores têm acesso total implicitamente.</p>;
  if (role === "cliente") return <p className="text-xs text-muted-foreground italic">Clientes acessam apenas o Portal do Cliente — sem permissões de sistema.</p>;

  const toggle = (key: string) => {
    onChange(permissions.includes(key) ? permissions.filter((p) => p !== key) : [...permissions, key]);
  };

  return (
    <div className="space-y-3">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group.label}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {group.perms.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={permissions.includes(key)} onCheckedChange={() => toggle(key)} id={`perm-${key}`} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserForm({ initial, onSave, isEdit }: {
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
    accessExpiresAt: initial?.accessExpiresAt ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

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
    try { await onSave(form); }
    catch (err) { toast({ variant: "destructive", title: "Erro", description: (err as Error).message }); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Usuário (login)</Label>
        <Input placeholder="ana.paula" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required autoCapitalize="none" autoComplete="off" />
        {isEdit && <p className="text-xs text-muted-foreground">Alterar o login exige que o usuário use o novo nome na próxima entrada.</p>}
      </div>
      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input placeholder="Ana Paula Silva" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label>Perfil</Label>
        <RoleSelect value={form.role} onChange={handleRoleChange} />
        {form.role !== "cliente" && <p className="text-xs text-muted-foreground">Ao trocar o perfil, as permissões são redefinidas para o padrão do novo perfil.</p>}
      </div>

      {/* Client-only: expiry date */}
      {form.role === "cliente" && (
        <div className="space-y-2 border rounded-lg p-3 bg-blue-50 border-blue-200">
          <Label className="text-blue-800 font-semibold text-sm flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Validade do acesso
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              type="date"
              value={form.accessExpiresAt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, accessExpiresAt: e.target.value }))}
              min={new Date().toISOString().split("T")[0]}
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, accessExpiresAt: "" }))} title="Acesso permanente">
              Permanente
            </Button>
          </div>
          <div className="flex gap-2">
            {[30, 60, 90].map(d => (
              <Button key={d} type="button" variant="outline" size="sm" className="text-xs"
                onClick={() => {
                  const dt = new Date(Date.now() + d * 86400000);
                  setForm((f) => ({ ...f, accessExpiresAt: dt.toISOString().split("T")[0] }));
                }}>
                +{d} dias
              </Button>
            ))}
          </div>
          <p className="text-xs text-blue-700 mt-1">
            {form.accessExpiresAt ? `Expira em ${new Date(form.accessExpiresAt).toLocaleDateString("pt-BR")}` : "Sem prazo definido — acesso permanente."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>{isEdit ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} placeholder={isEdit ? "••••••" : "Mínimo 6 caracteres"} value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={isEdit ? 0 : 6} required={!isEdit} className="pr-10"
            autoComplete={isEdit ? "new-password" : "current-password"} />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((s) => !s)}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="h-3.5 w-3.5" /> Permissões
        </Label>
        <PermissionsEditor permissions={form.permissions} role={form.role} onChange={(perms) => setForm((f) => ({ ...f, permissions: perms }))} />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {isEdit ? "Salvar alterações" : "Criar usuário"}
      </Button>
    </form>
  );
}

// ── Protocol Assignment Panel ─────────────────────────────────────────────────

type AccessPerms = { canViewCertificate: boolean; canViewReport: boolean; canPrint: boolean };

function PermToggle({ label, icon: Icon, checked, onChange }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer select-none transition-colors text-xs font-medium ${checked ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
      <Switch checked={checked} onCheckedChange={onChange} className="h-3.5 w-7 scale-75 origin-left" />
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </label>
  );
}

function ProtocolAssignPanel({ user, token }: { user: User; token: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState("");

  const { data: assigned = [], isLoading } = useQuery<ClientProtocolAccess[]>({
    queryKey: ["client-protocols", user.id],
    queryFn: () => apiFetch(`/api/clients/${user.id}/protocols`, token),
  });

  const { data: allProtocols = [] } = useQuery<Protocol[]>({
    queryKey: ["protocols-simple"],
    queryFn: () => apiFetch("/api/protocols", token),
  });

  const assign = useMutation({
    mutationFn: (protocolId: number) =>
      apiFetch(`/api/clients/${user.id}/protocols`, token, { method: "POST", body: JSON.stringify({ protocolId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-protocols", user.id] }); setSearchId(""); toast({ title: "Protocolo atribuído." }); },
    onError: (err) => toast({ variant: "destructive", title: "Erro", description: (err as Error).message }),
  });

  const updatePerms = useMutation({
    mutationFn: ({ accessId, perms }: { accessId: number; perms: Partial<AccessPerms> }) =>
      apiFetch(`/api/clients/${user.id}/protocols/${accessId}`, token, { method: "PUT", body: JSON.stringify(perms) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-protocols", user.id] }); },
    onError: (err) => toast({ variant: "destructive", title: "Erro", description: (err as Error).message }),
  });

  const remove = useMutation({
    mutationFn: (accessId: number) =>
      apiFetch(`/api/clients/${user.id}/protocols/${accessId}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-protocols", user.id] }); toast({ title: "Acesso removido." }); },
    onError: (err) => toast({ variant: "destructive", title: "Erro", description: (err as Error).message }),
  });

  const assignedIds = new Set(assigned.map(a => a.protocolId));
  const APPROVED = new Set(["aprovado", "aprovado_com_ressalva"]);
  const filtered = allProtocols.filter(p => {
    if (assignedIds.has(p.id)) return false;
    if (!searchId) return APPROVED.has(p.status);
    return (
      p.productName.toLowerCase().includes(searchId.toLowerCase()) ||
      (p.certNumber ?? "").toLowerCase().includes(searchId.toLowerCase())
    );
  }).slice(0, 30);

  return (
    <div className="space-y-4">
      {/* Assigned protocols */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Protocolos atribuídos</p>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">Nenhum protocolo atribuído ainda.</p>
        ) : (
          <div className="space-y-2">
            {assigned.map((a) => (
              <div key={a.id} className="border rounded-lg p-3 bg-muted/30 space-y-2">
                {/* Protocol identity */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{a.productName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{a.certNumber ? `#${a.certNumber}` : "sem nº"} · {a.status}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => remove.mutate(a.id)} disabled={remove.isPending}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Permission toggles */}
                <div className="flex flex-wrap gap-1.5">
                  <PermToggle
                    label="Certificado"
                    icon={Award}
                    checked={a.canViewCertificate}
                    onChange={(v) => updatePerms.mutate({ accessId: a.id, perms: { canViewCertificate: v } })}
                  />
                  <PermToggle
                    label="Relatório"
                    icon={FileText}
                    checked={a.canViewReport}
                    onChange={(v) => updatePerms.mutate({ accessId: a.id, perms: { canViewReport: v } })}
                  />
                  <PermToggle
                    label="Imprimir"
                    icon={Printer}
                    checked={a.canPrint}
                    onChange={(v) => updatePerms.mutate({ accessId: a.id, perms: { canPrint: v } })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add protocol */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Adicionar protocolo
        </p>
        <Input
          placeholder="Filtrar por nome ou nº certificado (ex: CERT-AF-…)"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          className="mb-2"
        />
        {filtered.length > 0 ? (
          <>
            {!searchId && (
              <p className="text-xs text-muted-foreground mb-1.5">
                Mostrando protocolos aprovados disponíveis — clique para atribuir:
              </p>
            )}
            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
              {filtered.map((p) => (
                <button key={p.id} type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                  onClick={() => assign.mutate(p.id)} disabled={assign.isPending}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{p.productName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{p.certNumber ? `#${p.certNumber}` : "sem nº"} · {p.status}</span>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                </button>
              ))}
            </div>
          </>
        ) : searchId ? (
          <p className="text-xs text-muted-foreground italic">Nenhum protocolo encontrado (ou já atribuído).</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhum protocolo aprovado disponível para atribuir.</p>
        )}
      </div>
    </div>
  );
}

// ── Login History Panel ───────────────────────────────────────────────────────

function LoginHistoryPanel({ user, token }: { user: User; token: string | null }) {
  const { data: history = [], isLoading } = useQuery<LoginLogEntry[]>({
    queryKey: ["login-history", user.id],
    queryFn: () => apiFetch(`/api/clients/${user.id}/login-history`, token),
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico de acessos (últimos 100)</p>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">Nenhum acesso registrado ainda.</p>
      ) : (
        <div className="border rounded-md divide-y max-h-72 overflow-y-auto text-sm">
          {history.map((entry) => (
            <div key={entry.id} className={`flex items-start gap-3 px-3 py-2.5 ${entry.success ? "" : "bg-red-50"}`}>
              {entry.success
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-xs ${entry.success ? "text-emerald-700" : "text-red-600"}`}>
                    {entry.success ? "Acesso realizado" : "Falha de acesso"}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(entry.loggedAt)}</span>
                </div>
                {entry.failReason && <p className="text-xs text-red-500 mt-0.5">{entry.failReason}</p>}
                {entry.ipAddress && <p className="text-xs text-muted-foreground mt-0.5">IP: {entry.ipAddress}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [protocolPanelUser, setProtocolPanelUser] = useState<User | null>(null);
  const [historyUser, setHistoryUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<User[]>("/api/users", token),
    enabled: isAdmin,
  });

  const createUser = useMutation({
    mutationFn: (data: UserFormData) =>
      apiFetch<User>("/api/users", token, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setNewOpen(false); toast({ title: "Usuário criado com sucesso." }); },
    onError: (err) => toast({ variant: "destructive", title: "Erro ao criar usuário", description: (err as Error).message }),
  });

  type UserUpdatePayload = { username?: string; displayName?: string; password?: string; role?: string; permissions?: string[]; active?: boolean; accessExpiresAt?: string | null };
  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserUpdatePayload }) =>
      apiFetch<User>(`/api/users/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setEditOpen(false); toast({ title: "Usuário atualizado." }); },
    onError: (err) => toast({ variant: "destructive", title: "Erro ao atualizar usuário", description: (err as Error).message }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean }>(`/api/users/${id}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast({ title: "Usuário excluído." }); },
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

  const staffUsers = users?.filter(u => u.role !== "cliente") ?? [];
  const clientUsers = users?.filter(u => u.role === "cliente") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Gerenciamento de Usuários</h2>
          <p className="text-sm text-muted-foreground">Gerencie usuários, permissões e acessos ao portal do cliente.</p>
        </div>
        <div className="ml-auto">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo usuário</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Criar novo usuário</DialogTitle></DialogHeader>
              <UserForm onSave={async (d) => { await createUser.mutateAsync(d); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Staff users ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Equipe Interna</CardTitle>
          <CardDescription>{staffUsers.length} usuário(s) da equipe</CardDescription>
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
                {staffUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.displayName}
                      {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted-foreground italic">Total (admin)</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{(u.permissions ?? []).length} permissão(ões)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={u.active} disabled={u.id === currentUser?.id}
                          onCheckedChange={(checked) => updateUser.mutate({ id: u.id, data: { active: checked } })} />
                        <span className="text-sm text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Dialog open={editOpen && editUser?.id === u.id} onOpenChange={(o) => { setEditOpen(o); if (o) setEditUser(u); }}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => { setEditUser(u); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Editar: {u.displayName}</DialogTitle></DialogHeader>
                            <UserForm isEdit initial={{ username: u.username, displayName: u.displayName, role: u.role, permissions: u.permissions ?? [] }}
                              onSave={async (d) => {
                                const payload: Partial<UserFormData> & { active?: boolean } = { displayName: d.displayName, role: d.role, permissions: d.permissions };
                                if (d.username && d.username !== u.username) payload.username = d.username;
                                if (d.password) payload.password = d.password;
                                await updateUser.mutateAsync({ id: u.id, data: payload });
                              }} />
                          </DialogContent>
                        </Dialog>
                        {u.id !== currentUser?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteUser.isPending}>
                                {deleteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                                <AlertDialogDescription>O usuário <strong>{u.displayName}</strong> ({u.username}) será removido permanentemente. Assinaturas históricas serão preservadas. Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteUser.mutate(u.id)}>Excluir permanentemente</AlertDialogAction>
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

      {/* ── Client users ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-blue-600" /> Clientes com Acesso ao Portal</CardTitle>
          <CardDescription>{clientUsers.length} cliente(s) cadastrado(s) — acessam apenas certificados e relatórios dos protocolos atribuídos</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : clientUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum cliente cadastrado ainda.</p>
              <p className="text-xs mt-1">Crie um usuário com o perfil <strong>Cliente</strong> para dar acesso ao portal.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clientUsers.map((u) => {
                const exp = expiryLabel(u.accessExpiresAt);
                return (
                  <div key={u.id} className="border rounded-lg overflow-hidden">
                    {/* Row header */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{u.displayName}</span>
                          <span className="text-xs text-muted-foreground font-mono">@{u.username}</span>
                          <span className={`text-xs font-medium ${exp.color}`}><Clock className="h-3 w-3 inline mr-0.5" />{exp.label}</span>
                        </div>
                      </div>
                      {/* Active toggle */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={u.active} onCheckedChange={(checked) => updateUser.mutate({ id: u.id, data: { active: checked } })} />
                        <span className="text-xs text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Protocols */}
                        <Dialog open={protocolPanelUser?.id === u.id} onOpenChange={(o) => setProtocolPanelUser(o ? u : null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Protocolos</Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Protocolos — {u.displayName}</DialogTitle></DialogHeader>
                            <ProtocolAssignPanel user={u} token={token} />
                          </DialogContent>
                        </Dialog>
                        {/* Login history */}
                        <Dialog open={historyUser?.id === u.id} onOpenChange={(o) => setHistoryUser(o ? u : null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><History className="h-3.5 w-3.5" /> Histórico</Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Histórico de login — {u.displayName}</DialogTitle></DialogHeader>
                            <LoginHistoryPanel user={u} token={token} />
                          </DialogContent>
                        </Dialog>
                        {/* Edit */}
                        <Dialog open={editOpen && editUser?.id === u.id} onOpenChange={(o) => { setEditOpen(o); if (o) setEditUser(u); }}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditUser(u); setEditOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Editar cliente: {u.displayName}</DialogTitle></DialogHeader>
                            <UserForm isEdit
                              initial={{ username: u.username, displayName: u.displayName, role: u.role, permissions: [], accessExpiresAt: u.accessExpiresAt ? new Date(u.accessExpiresAt).toISOString().split("T")[0] : undefined }}
                              onSave={async (d) => {
                                const payload: UserUpdatePayload = {
                                  displayName: d.displayName, role: d.role, permissions: [],
                                  accessExpiresAt: d.accessExpiresAt ?? null,
                                };
                                if (d.username && d.username !== u.username) payload.username = d.username;
                                if (d.password) payload.password = d.password;
                                await updateUser.mutateAsync({ id: u.id, data: payload });
                              }} />
                          </DialogContent>
                        </Dialog>
                        {/* Delete */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteUser.isPending}>
                              {deleteUser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                              <AlertDialogDescription>O cliente <strong>{u.displayName}</strong> e todos os seus acessos serão removidos permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteUser.mutate(u.id)}>Excluir permanentemente</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Protocol assignment dialog (kept at root to avoid nesting issues) */}
    </div>
  );
}
