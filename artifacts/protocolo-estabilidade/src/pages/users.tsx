import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Users, ArrowLeft } from "lucide-react";

type User = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  createdAt: string;
};

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

type UserFormData = { username: string; displayName: string; password: string; role: string };

function UserForm({ initial, onSave, isEdit }: { initial?: Partial<UserFormData>; onSave: (data: UserFormData & { password?: string }) => Promise<void>; isEdit?: boolean }) {
  const [form, setForm] = useState<UserFormData>({ username: initial?.username ?? "", displayName: initial?.displayName ?? "", password: "", role: initial?.role ?? "analyst" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && form.password.length < 6) { toast({ variant: "destructive", title: "Erro", description: "Senha mínima de 6 caracteres." }); return; }
    setLoading(true);
    try {
      await onSave(form);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: (err as Error).message });
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {!isEdit && (
        <div className="space-y-2">
          <Label>Usuário (login)</Label>
          <Input placeholder="ana.paula" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required autoCapitalize="none" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input placeholder="Ana Paula Silva" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label>Perfil</Label>
        <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="analyst">Analista</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isEdit ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
        <Input type="password" placeholder={isEdit ? "••••••" : "Mínimo 6 caracteres"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} minLength={isEdit ? 0 : 6} required={!isEdit} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {isEdit ? "Salvar alterações" : "Criar usuário"}
      </Button>
    </form>
  );
}

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
    mutationFn: (data: UserFormData) => apiFetch<User>("/api/users", token, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setNewOpen(false); toast({ title: "Usuário criado com sucesso." }); },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserFormData> & { active?: boolean } }) =>
      apiFetch<User>(`/api/users/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setEditOpen(false); toast({ title: "Usuário atualizado." }); },
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
          <p className="text-sm text-muted-foreground">Gerencie os usuários com acesso ao sistema.</p>
        </div>
        <div className="ml-auto">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar novo usuário</DialogTitle></DialogHeader>
              <UserForm onSave={async (d) => { await createUser.mutateAsync(d as UserFormData); }} />
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.displayName}{u.id === currentUser?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "Admin" : "Analista"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={u.active} disabled={u.id === currentUser?.id}
                          onCheckedChange={(checked) => updateUser.mutate({ id: u.id, data: { active: checked } })}
                        />
                        <span className="text-sm text-muted-foreground">{u.active ? "Ativo" : "Inativo"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog open={editOpen && editUser?.id === u.id} onOpenChange={(o) => { setEditOpen(o); if (o) setEditUser(u); }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => { setEditUser(u); setEditOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Editar: {u.displayName}</DialogTitle></DialogHeader>
                          <UserForm isEdit initial={{ displayName: u.displayName, role: u.role }}
                            onSave={async (d) => {
                              const payload: Partial<UserFormData> = { displayName: d.displayName, role: d.role };
                              if (d.password) payload.password = d.password;
                              await updateUser.mutateAsync({ id: u.id, data: payload });
                            }}
                          />
                        </DialogContent>
                      </Dialog>
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
