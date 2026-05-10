import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Printer, Plus, Trash2, FlaskConical, Settings, BarChart3, Download,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Peak {
  id: string;
  name: string;
  retentionTime: number; // minutes
  height: number;        // mAU
  width: number;         // minutes (sigma)
  asymmetry: number;     // tailing factor (1 = symmetric)
}

interface MethodParams {
  column: string;
  mobilePhaseA: string;
  mobilePhaseB: string;
  flowRate: string;
  wavelength: string;
  temperature: string;
  injectionVolume: string;
  runTime: number;
}

interface SampleInfo {
  sampleId: string;
  lotNumber: string;
  operator: string;
  analysisDate: string;
  instrument: string;
  method: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gaussian(t: number, rt: number, sigma: number, height: number, asym: number): number {
  const delta = t - rt;
  const s = delta < 0 ? sigma : sigma * asym;
  return height * Math.exp(-(delta * delta) / (2 * s * s));
}

function buildChromatogram(peaks: Peak[], runTime: number, points = 1200) {
  const data: { time: number; signal: number }[] = [];
  const dt = runTime / points;
  for (let i = 0; i <= points; i++) {
    const t = parseFloat((i * dt).toFixed(4));
    const baseline = 0.3 + 0.02 * Math.sin(t * 0.8); // subtle baseline drift
    let signal = baseline;
    for (const p of peaks) {
      signal += gaussian(t, p.retentionTime, p.width, p.height, p.asymmetry);
    }
    data.push({ time: t, signal: parseFloat(signal.toFixed(3)) });
  }
  return data;
}

function computeArea(peak: Peak): number {
  // Numerical integration (trapezoidal) over ±4σ
  const steps = 400;
  const lo = peak.retentionTime - 4 * peak.width;
  const hi = peak.retentionTime + 4 * peak.width * peak.asymmetry;
  const dt = (hi - lo) / steps;
  let area = 0;
  for (let i = 0; i < steps; i++) {
    const t1 = lo + i * dt;
    const t2 = lo + (i + 1) * dt;
    area += 0.5 * dt * (
      gaussian(t1, peak.retentionTime, peak.width, peak.height, peak.asymmetry) +
      gaussian(t2, peak.retentionTime, peak.width, peak.height, peak.asymmetry)
    );
  }
  return area;
}

function theoreticalPlates(rt: number, w: number): number {
  return Math.round(16 * Math.pow(rt / (4 * w), 2));
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_PEAKS: Peak[] = [
  { id: uid(), name: "Vitamina D3",   retentionTime: 3.42, height: 820, width: 0.12, asymmetry: 1.05 },
  { id: uid(), name: "Colecalciferol",retentionTime: 5.18, height: 1250, width: 0.15, asymmetry: 1.10 },
  { id: uid(), name: "Impureza A",    retentionTime: 7.64, height: 180, width: 0.10, asymmetry: 1.20 },
  { id: uid(), name: "Cálcio (std)", retentionTime:10.31, height: 960, width: 0.18, asymmetry: 1.02 },
];

const DEFAULT_METHOD: MethodParams = {
  column: "C18 Hypersil GOLD (150 × 4.6 mm, 5 µm)",
  mobilePhaseA: "Acetonitrila : Metanol (90:10)",
  mobilePhaseB: "Água : Metanol (80:20)",
  flowRate: "1.0 mL/min",
  wavelength: "265 nm",
  temperature: "30°C",
  injectionVolume: "20 µL",
  runTime: 15,
};

const DEFAULT_SAMPLE: SampleInfo = {
  sampleId: "AF-2026-001",
  lotNumber: "LOT-001/26",
  operator: "Analista 1",
  analysisDate: new Date().toISOString().slice(0, 10),
  instrument: "HPLC-UV Shimadzu LC-2030",
  method: "Met-HPLC-VitD-001",
};

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function ChromTooltip({ active, payload }: { active?: boolean; payload?: { payload: { time: number; signal: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { time, signal } = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs shadow-md font-mono">
      <div className="text-muted-foreground">TR: <span className="text-foreground font-semibold">{time.toFixed(3)} min</span></div>
      <div className="text-muted-foreground">sinal: <span className="text-foreground font-semibold">{signal.toFixed(1)} mAU</span></div>
    </div>
  );
}

// ─── Peak editor dialog ────────────────────────────────────────────────────────

function PeakEditorDialog({ peak, onSave }: { peak: Peak; onSave: (p: Peak) => void }) {
  const [draft, setDraft] = useState<Peak>({ ...peak });
  const field = (key: keyof Peak) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = key === "name" || key === "id" ? e.target.value : parseFloat(e.target.value) || 0;
    setDraft(d => ({ ...d, [key]: val }));
  };
  return (
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>Editar Pico</DialogTitle></DialogHeader>
      <div className="space-y-3 pt-2">
        {([
          ["name", "Nome do Pico", "text"],
          ["retentionTime", "Tempo de Retenção (min)", "number"],
          ["height", "Altura (mAU)", "number"],
          ["width", "Largura σ (min)", "number"],
          ["asymmetry", "Fator de Assimetria (T)", "number"],
        ] as [keyof Peak, string, string][]).map(([k, label, type]) => (
          <div key={k} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              type={type}
              step={type === "number" ? "0.01" : undefined}
              value={draft[k] as string | number}
              onChange={field(k)}
              className="h-8 text-sm font-mono"
            />
          </div>
        ))}
        <Button className="w-full mt-2" size="sm" onClick={() => onSave(draft)}>
          Salvar
        </Button>
      </div>
    </DialogContent>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function HplcSimulator() {
  const [peaks, setPeaks] = useState<Peak[]>(DEFAULT_PEAKS);
  const [method, setMethod] = useState<MethodParams>(DEFAULT_METHOD);
  const [sample, setSample] = useState<SampleInfo>(DEFAULT_SAMPLE);
  const [editingPeak, setEditingPeak] = useState<Peak | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const chromatogram = useMemo(
    () => buildChromatogram(peaks, method.runTime),
    [peaks, method.runTime]
  );

  const peakStats = useMemo(() => {
    const areas = peaks.map(p => computeArea(p));
    const totalArea = areas.reduce((a, b) => a + b, 0);
    return peaks.map((p, i) => ({
      ...p,
      area: areas[i],
      pctArea: totalArea > 0 ? (areas[i] / totalArea) * 100 : 0,
      plates: theoreticalPlates(p.retentionTime, p.width),
      tailing: p.asymmetry,
    }));
  }, [peaks]);

  const yMax = useMemo(() => {
    const max = Math.max(...chromatogram.map(d => d.signal));
    return Math.ceil(max * 1.15 / 50) * 50;
  }, [chromatogram]);

  const addPeak = useCallback(() => {
    const newPeak: Peak = {
      id: uid(),
      name: `Pico ${peaks.length + 1}`,
      retentionTime: parseFloat((Math.random() * (method.runTime - 2) + 1).toFixed(2)),
      height: Math.round(200 + Math.random() * 800),
      width: parseFloat((0.08 + Math.random() * 0.12).toFixed(3)),
      asymmetry: parseFloat((0.95 + Math.random() * 0.3).toFixed(2)),
    };
    setPeaks(ps => [...ps, newPeak]);
  }, [peaks.length, method.runTime]);

  const removePeak = useCallback((id: string) => {
    setPeaks(ps => ps.filter(p => p.id !== id));
  }, []);

  const savePeak = useCallback((updated: Peak) => {
    setPeaks(ps => ps.map(p => p.id === updated.id ? updated : p));
    setDialogOpen(false);
    setEditingPeak(null);
  }, []);

  const methodField = (key: keyof MethodParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = key === "runTime" ? parseFloat(e.target.value) || 15 : e.target.value;
    setMethod(m => ({ ...m, [key]: val }));
  };

  const sampleField = (key: keyof SampleInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSample(s => ({ ...s, [key]: e.target.value }));
  };

  const handlePrint = () => window.print();

  const PEAK_COLORS = ["#2563eb","#16a34a","#d97706","#9333ea","#dc2626","#0891b2","#db2777"];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">Simulador HPLC</h1>
            <p className="text-xs text-muted-foreground">Alphafitus Laboratório Nutracêutico</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
          </Button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 space-y-4">
        {/* Sample info bar */}
        <Card className="no-print">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {([
                ["sampleId", "ID da Amostra"],
                ["lotNumber", "Número do Lote"],
                ["operator", "Operador"],
                ["analysisDate", "Data da Análise"],
                ["instrument", "Instrumento"],
                ["method", "Método"],
              ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={sample[k]}
                    onChange={sampleField(k)}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Print header (visible only when printing) */}
        <div className="hidden print:block mb-4">
          <h2 className="text-xl font-bold">Relatório HPLC — {sample.sampleId}</h2>
          <div className="grid grid-cols-3 gap-2 text-sm mt-2">
            <div><b>Lote:</b> {sample.lotNumber}</div>
            <div><b>Operador:</b> {sample.operator}</div>
            <div><b>Data:</b> {sample.analysisDate}</div>
            <div><b>Instrumento:</b> {sample.instrument}</div>
            <div><b>Método:</b> {sample.method}</div>
          </div>
          <Separator className="mt-3" />
        </div>

        <Tabs defaultValue="chromatogram" className="space-y-4">
          <TabsList className="no-print">
            <TabsTrigger value="chromatogram" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Cromatograma
            </TabsTrigger>
            <TabsTrigger value="method" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Parâmetros do Método
            </TabsTrigger>
          </TabsList>

          {/* ── CHROMATOGRAM TAB ── */}
          <TabsContent value="chromatogram" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

              {/* Chromatogram plot */}
              <Card className="lg:col-span-3">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      Cromatograma — UV {method.wavelength}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground font-mono">
                      {sample.instrument}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={340}>
                    <AreaChart data={chromatogram} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="chromGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 15% 88%)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={[0, method.runTime]}
                        tickCount={Math.min(method.runTime + 1, 16)}
                        tickFormatter={v => v.toFixed(1)}
                        label={{ value: "Tempo (min)", position: "insideBottom", offset: -10, fontSize: 11 }}
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                      />
                      <YAxis
                        domain={[0, yMax]}
                        tickFormatter={v => `${v}`}
                        label={{ value: "mAU", angle: -90, position: "insideLeft", offset: 12, fontSize: 11 }}
                        tick={{ fontSize: 10, fontFamily: "monospace" }}
                        width={52}
                      />
                      <Tooltip content={<ChromTooltip />} />
                      {peaks.map((p, i) => (
                        <ReferenceLine
                          key={p.id}
                          x={p.retentionTime}
                          stroke={PEAK_COLORS[i % PEAK_COLORS.length]}
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{
                            value: p.name,
                            position: "top",
                            fontSize: 9,
                            fill: PEAK_COLORS[i % PEAK_COLORS.length],
                            fontFamily: "monospace",
                          }}
                        />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="signal"
                        stroke="#2563eb"
                        strokeWidth={2}
                        fill="url(#chromGrad)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Peaks panel */}
              <Card className="no-print">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Picos</CardTitle>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addPeak}>
                      <Plus className="h-3 w-3" /> Adicionar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    {peaks.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-md border px-2 py-1.5 bg-muted/30 group"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: PEAK_COLORS[i % PEAK_COLORS.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.retentionTime.toFixed(2)} min</p>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingPeak(p); setDialogOpen(true); }}
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removePeak(p.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {peaks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum pico. Clique em Adicionar.</p>
                    )}
                    {editingPeak && (
                      <PeakEditorDialog peak={editingPeak} onSave={savePeak} />
                    )}
                  </Dialog>
                </CardContent>
              </Card>
            </div>

            {/* Peak results table */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Tabela de Picos</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["#", "Nome do Pico", "TR (min)", "Área (mAU·min)", "Altura (mAU)", "Área %", "Pratos N", "Fator T"].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {peakStats.map((p, i) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
                              style={{ background: PEAK_COLORS[i % PEAK_COLORS.length] }}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-medium">{p.name}</td>
                          <td className="px-4 py-2 font-mono">{p.retentionTime.toFixed(3)}</td>
                          <td className="px-4 py-2 font-mono">{p.area.toFixed(1)}</td>
                          <td className="px-4 py-2 font-mono">{p.height.toFixed(0)}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${p.pctArea}%`,
                                    background: PEAK_COLORS[i % PEAK_COLORS.length],
                                  }}
                                />
                              </div>
                              <span className="font-mono">{p.pctArea.toFixed(2)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 font-mono">{p.plates.toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-2 font-mono">
                            <Badge
                              variant="outline"
                              className={p.tailing >= 0.8 && p.tailing <= 1.5
                                ? "border-green-400 text-green-700 bg-green-50"
                                : "border-red-400 text-red-700 bg-red-50"
                              }
                            >
                              {p.tailing.toFixed(2)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {peaks.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                            Nenhum pico cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {peaks.length > 0 && (
                      <tfoot>
                        <tr className="bg-muted/40 border-t">
                          <td colSpan={3} className="px-4 py-2 font-semibold text-xs">Total</td>
                          <td className="px-4 py-2 font-mono font-semibold">
                            {peakStats.reduce((s, p) => s + p.area, 0).toFixed(1)}
                          </td>
                          <td className="px-4 py-2 font-mono font-semibold">
                            {peakStats.reduce((s, p) => s + p.height, 0).toFixed(0)}
                          </td>
                          <td className="px-4 py-2 font-mono font-semibold">100.00%</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── METHOD TAB ── */}
          <TabsContent value="method">
            <Card>
              <CardHeader className="pb-3 pt-4 px-6">
                <CardTitle className="text-sm">Parâmetros Cromatográficos</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {([
                    ["column", "Coluna"],
                    ["mobilePhaseA", "Fase Móvel A"],
                    ["mobilePhaseB", "Fase Móvel B"],
                    ["flowRate", "Vazão"],
                    ["wavelength", "Comprimento de Onda"],
                    ["temperature", "Temperatura"],
                    ["injectionVolume", "Volume de Injeção"],
                  ] as [keyof MethodParams, string][]).map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input
                        value={method[k] as string}
                        onChange={methodField(k)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tempo de Corrida (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={method.runTime}
                      onChange={methodField("runTime")}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                </div>

                <Separator className="my-5" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Coluna", method.column.split(" ")[0]],
                    ["Vazão", method.flowRate],
                    ["λ detecção", method.wavelength],
                    ["Temp. coluna", method.temperature],
                  ].map(([label, val]) => (
                    <div key={label} className="rounded-lg bg-muted/50 border px-3 py-2.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold font-mono mt-0.5">{val}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print-only method section */}
        <div className="hidden print:block print-break">
          <h3 className="font-bold text-sm mb-2">Parâmetros do Método</h3>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div><b>Coluna:</b> {method.column}</div>
            <div><b>Fase Móvel A:</b> {method.mobilePhaseA}</div>
            <div><b>Fase Móvel B:</b> {method.mobilePhaseB}</div>
            <div><b>Vazão:</b> {method.flowRate}</div>
            <div><b>λ:</b> {method.wavelength}</div>
            <div><b>Temperatura:</b> {method.temperature}</div>
            <div><b>Volume de injeção:</b> {method.injectionVolume}</div>
            <div><b>Tempo de corrida:</b> {method.runTime} min</div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4 no-print">
          Simulador HPLC — Alphafitus Laboratório Nutracêutico · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
