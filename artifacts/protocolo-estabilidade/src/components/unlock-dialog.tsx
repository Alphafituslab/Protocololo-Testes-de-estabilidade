import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2 } from "lucide-react";

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: (password: string) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export function UnlockDialog({ open, onOpenChange, onUnlock, onSuccess, title, description, submitLabel }: UnlockDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    const result = await onUnlock(password);
    setLoading(false);
    if (result.ok) {
      setPassword("");
      onOpenChange(false);
      onSuccess?.();
    } else {
      setError(result.error ?? "Senha incorreta.");
      setPassword("");
      inputRef.current?.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-amber-600" />
            <DialogTitle>{title ?? "Protocolo protegido"}</DialogTitle>
          </div>
          <DialogDescription>
            {description ?? "Este protocolo está aprovado ou reprovado. Digite a senha mestra para liberar a edição nesta sessão."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Input
              ref={inputRef}
              type="password"
              placeholder="Senha mestra"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              disabled={loading}
              autoComplete="current-password"
            />
            {error && (
              <p className="text-xs text-destructive mt-1.5 font-medium">{error}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !password.trim()}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitLabel ?? "Desbloquear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
