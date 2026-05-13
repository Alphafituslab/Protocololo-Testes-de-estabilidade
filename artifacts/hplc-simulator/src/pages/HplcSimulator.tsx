import { useState, useMemo, useCallback, useRef } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Printer, Plus, Trash2, Settings, FlaskConical, BarChart3, FileText, Database, Zap, CheckCircle2, XCircle, LogOut, Check, Layers, Download, Users, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, LayoutDashboard, ImageDown, ClipboardCheck, ClipboardX, ScrollText, Activity, ImageIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Peak {
  id: string;
  name: string;
  retentionTime: number;
  height: number;       // mAU
  width: number;        // sigma (min)
  asymmetry: number;
  peakType: string;     // VB, BB, BV, VV...
  manualArea: number;   // 0 = use computed; >0 = override
  amtPerArea: number;   // response factor (Amount/Area)
  amount: number;       // ug/ml
  grp: string;
}

interface SampleInfo {
  dataFile: string;
  sampleName: string;
  acqOperator: string;
  seqLine: string;
  acqInstrument: string;
  location: string;
  injectionDate: string;
  inj: string;
  injVolume: string;
  acqMethod: string;
  lastChanged1: string;
  analysisMethod: string;
  lastChanged2: string;
}

interface DetectorInfo {
  signalName: string;   // "DAD1 A"
  sigWavelength: number;
  sigBandwidth: number;
  refWavelength: number;
  refBandwidth: number;
  runTime: number;      // min
}

interface CalibStandard {
  id: string;
  level: number;
  amount: number;  // ug/ml
  area: number;    // mAU*s
}

interface CalibInfo {
  compoundName: string;
  expRT: number;
  calibDataModified: string;
  multiplier: string;
  dilution: string;
  sortedBy: string;
  curveType: string;
  origin: string;
  weight: string;
}

interface ActiveCompound {
  id: string;
  name: string;
  wavelength: number;    // nm  — detector wavelength for identification
  waveTol: number;       // nm  — ±tolerance for wavelength match
  expectedRT: number;    // min — expected retention time
  rtTol: number;         // min — ±tolerance for RT match
  typicalWidth: number;  // sigma (min) — used when adding a new simulated peak
  typicalAsym: number;
  amtPerArea: number;    // response factor [ug/ml / mAU*s]
  units: string;         // "ug/ml", "mg/L", etc.
  specMin: number;       // specification lower limit (0 = N/A)
  specMax: number;       // specification upper limit (0 = N/A)
  method: string;        // analytical method file
  notes: string;
}

interface LotResult {
  compoundId: string;
  compoundName: string;
  found: boolean;
  concentration: number;   // ug/ml
  retentionTime: number;   // min
  area: number;            // mAU*s
  inSpec: boolean | null;  // null = no spec defined
}

interface Lot {
  id: string;
  formulaId: string;
  lotNumber: string;
  createdAt: string;
  sample: SampleInfo;
  observedPeaks: Peak[];
  results: LotResult[];
  notes: string;
}

interface Formula {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  detector: DetectorInfo;
  activeCompounds: ActiveCompound[];
  standards: CalibStandard[];
  calib: CalibInfo;
}

// ─── Analysis Session types ───────────────────────────────────────────────────

const RUN_COLORS = ["#1560bd", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

interface AnalysisRun {
  id: string;
  runNumber: number;    // 1–5
  label: string;        // "R1", "R2", …
  createdAt: string;
  peaks: Peak[];
  sample: SampleInfo;
  color: string;
}

interface AnalysisSession {
  id: string;
  formulaId: string;
  name: string;
  createdAt: string;
  notes: string;
  runs: AnalysisRun[];
  status: "em_andamento" | "aprovado" | "reprovado" | "laudo_emitido";
  concludedAt?: string;
  laudoEmittedAt?: string;
}

// Pre-analysis setup data (persisted between sessions)
interface SessionSetupData {
  formulaId: string;
  sessionName: string;
  notes: string;
  // Amostra
  sampleName: string;
  lotNumber: string;
  seqLine: string;
  location: string;
  // Instrumento / Método
  acqOperator: string;
  acqInstrument: string;
  injVolume: string;
  acqMethod: string;
  analysisMethod: string;
}

interface HplcSavedImage {
  id: string;
  sessionId: string;
  sessionName: string;
  formulaName: string;
  createdAt: string;
  imageData: string;  // base64 PNG
  notes: string;
}

interface StandardEntry {
  compoundId: string;
  compoundName: string;
  units: string;
  nominalConc: number;  // declared/label concentration (ug/ml)
  stdArea: number;      // 0 = use compound.amtPerArea; >0 = external std area
  stdConc: number;      // external std solution concentration
}

interface FormulaStandard {
  formulaId: string;
  savedAt: string;
  notes: string;
  entries: StandardEntry[];
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function gaussian(t: number, rt: number, sigma: number, h: number, asym: number): number {
  const d = t - rt;
  const s = d < 0 ? sigma : sigma * asym;
  return h * Math.exp(-(d * d) / (2 * s * s));
}

// Deterministic pseudo-noise — same result every render, looks random
function pseudoNoise(i: number): number {
  const a = Math.sin(i * 127.1 + 1.0) * 43758.5453;
  const b = Math.sin(i * 311.7 + 2.3) * 9301.1231;
  const c = Math.sin(i * 53.11 + 4.7) * 2053.3378;
  return ((a + b + c) - Math.floor(a + b + c)) - 0.5; // -0.5 … +0.5
}

function buildChromatogram(peaks: Peak[], runTime: number, pts = 6000) {
  const dt = runTime / pts;
  const noiseAmp  = 1.8;   // mAU  — visible baseline texture
  const driftAmp  = 1.2;   // mAU  — total upward drift over full run
  const pulseAmp  = 0.35;  // mAU  — pump pulsation ripple
  const pulseFreq = 1.6;   // cycles / min

  return Array.from({ length: pts + 1 }, (_, i) => {
    const t = i * dt;

    // Sum all user-defined peaks
    let signal = 0;
    for (const p of peaks) {
      signal += gaussian(t, p.retentionTime, p.width, p.height, p.asymmetry);
    }

    // Correlated baseline noise (2-octave layering for natural feel)
    const n1 = pseudoNoise(i);
    const n2 = pseudoNoise(i * 3 + 4999);
    const noise = noiseAmp * (n1 * 0.65 + n2 * 0.35);

    // Slight linear baseline drift
    const drift = driftAmp * (t / runTime);

    // Pump pressure pulsation
    const pulse = pulseAmp * Math.sin(2 * Math.PI * pulseFreq * t);

    const total = signal + noise + drift + pulse;
    return { time: parseFloat(t.toFixed(4)), signal: parseFloat(Math.max(0, total).toFixed(3)) };
  });
}

function computeArea(p: Peak): number {
  const steps = 600;
  const lo = p.retentionTime - 5 * p.width;
  const hi = p.retentionTime + 5 * p.width * p.asymmetry;
  const dt = (hi - lo) / steps;
  let area = 0;
  for (let i = 0; i < steps; i++) {
    const t1 = lo + i * dt, t2 = lo + (i + 1) * dt;
    area += 0.5 * dt * (gaussian(t1, p.retentionTime, p.width, p.height, p.asymmetry) +
      gaussian(t2, p.retentionTime, p.width, p.height, p.asymmetry));
  }
  return area * 60; // convert mAU·min → mAU·s
}

function linearRegression(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: 0, r: 0, residStdDev: 0 };
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = pts.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const ssRes = pts.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const r = Math.sqrt(Math.abs(r2));
  const residStdDev = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  return { slope, intercept, r, residStdDev };
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtSci2(n: number, exp: number) {
  // format as e.g. "3.92764e-2"
  const man = n / Math.pow(10, exp);
  const sign = exp < 0 ? "-" : "+";
  return `${man.toFixed(5)}e${sign}${Math.abs(exp)}`;
}

function fmtAmt(n: number) { return n.toFixed(5); }
function fmtArea(n: number) { return n.toFixed(5); }

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PEAKS: Peak[] = [
  // Dead-volume / solvent-front artifact — broad, strongly asymmetric, unretained
  {
    id: uid(), name: "", retentionTime: 0.38, height: 7, width: 0.075,
    asymmetry: 2.6, peakType: "BB", manualArea: 0,
    amtPerArea: 0, amount: 0, grp: "",
  },
  // B6 analyte peak — sharp, tall, slight tailing (typical for pyridoxine on C18)
  {
    id: uid(), name: "B6", retentionTime: 2.401, height: 242, width: 0.022,
    asymmetry: 1.22, peakType: "VB", manualArea: 872.10504,
    amtPerArea: 0.0392764, amount: 34.25311, grp: "",
  },
];

const DEFAULT_SAMPLE: SampleInfo = {
  dataFile: "C:\\CHEM32\\1\\DATA\\TESTE B6-290 POTE 2 AMOSTRAS 15G 2025-04-26 12-14-15\\024-2401.D",
  sampleName: "amostra A.p",
  acqOperator: "EDSON",
  seqLine: "24",
  acqInstrument: "Instrument 1",
  location: "Vial 24",
  injectionDate: "4/30/2025 11:53:34 AM",
  inj: "1",
  injVolume: "10.0 µl",
  acqMethod: "C:\\CHEM32\\1\\DATA\\TESTE B6-290 POTE 2 AMOSTRAS 15G 2025-04-26 12-14-15\\B6 TESTE 290.M",
  lastChanged1: "4/25/2025 2:36:55 PM by EDSON",
  analysisMethod: "C:\\CHEM32\\1\\METHODS\\B6.M",
  lastChanged2: "4/30/2025 1:05:09 PM by EDSON",
};

const DEFAULT_DETECTOR: DetectorInfo = {
  signalName: "DAD1 A",
  sigWavelength: 290,
  sigBandwidth: 4,
  refWavelength: 360,
  refBandwidth: 100,
  runTime: 10,
};

const DEFAULT_STANDARDS: CalibStandard[] = [
  { id: uid(), level: 1, amount: 10, area: 296.16348 },
  { id: uid(), level: 2, amount: 25, area: 620.81195 },
  { id: uid(), level: 3, amount: 50, area: 1286.75647 },
  { id: uid(), level: 4, amount: 70, area: 1737.21973 },
  { id: uid(), level: 5, amount: 100, area: 2530.36230 },
];

const DEFAULT_CALIB: CalibInfo = {
  compoundName: "B6",
  expRT: 2.438,
  calibDataModified: "Thursday, April 24, 2025 6:00:25 PM",
  multiplier: "1.0000",
  dilution: "1.0000",
  sortedBy: "Signal",
  curveType: "Linear",
  origin: "Included",
  weight: "Equal",
};

const DEFAULT_ACTIVE_COMPOUNDS: ActiveCompound[] = [
  {
    id: uid(), name: "Vitamina B6", wavelength: 290, waveTol: 8,
    expectedRT: 2.438, rtTol: 0.15, typicalWidth: 0.022, typicalAsym: 1.22,
    amtPerArea: 0.03927, units: "ug/ml", specMin: 20, specMax: 50,
    method: "B6.M", notes: "Piridoxina HCl — C₈H₁₁NO₃·HCl",
  },
  {
    id: uid(), name: "Cafeína", wavelength: 272, waveTol: 8,
    expectedRT: 3.52, rtTol: 0.20, typicalWidth: 0.030, typicalAsym: 1.10,
    amtPerArea: 0.02145, units: "ug/ml", specMin: 0, specMax: 0,
    method: "CAFF.M", notes: "Trimetilxantina — C₈H₁₀N₄O₂",
  },
  {
    id: uid(), name: "Vitamina C", wavelength: 245, waveTol: 8,
    expectedRT: 1.85, rtTol: 0.15, typicalWidth: 0.028, typicalAsym: 1.15,
    amtPerArea: 0.04512, units: "ug/ml", specMin: 0, specMax: 0,
    method: "VIT_C.M", notes: "Ácido ascórbico — C₆H₈O₆",
  },
  {
    id: uid(), name: "Niacinamida", wavelength: 261, waveTol: 8,
    expectedRT: 2.10, rtTol: 0.15, typicalWidth: 0.025, typicalAsym: 1.08,
    amtPerArea: 0.03321, units: "ug/ml", specMin: 0, specMax: 0,
    method: "B3.M", notes: "Vitamina B3 / nicotinamida — C₆H₆N₂O",
  },
  {
    id: uid(), name: "Riboflavina", wavelength: 265, waveTol: 8,
    expectedRT: 4.20, rtTol: 0.20, typicalWidth: 0.035, typicalAsym: 1.18,
    amtPerArea: 0.01876, units: "ug/ml", specMin: 0, specMax: 0,
    method: "B2.M", notes: "Vitamina B2 — C₁₇H₂₀N₄O₆",
  },
  {
    id: uid(), name: "Ácido Fólico", wavelength: 282, waveTol: 8,
    expectedRT: 5.50, rtTol: 0.25, typicalWidth: 0.040, typicalAsym: 1.30,
    amtPerArea: 0.02234, units: "ug/ml", specMin: 0, specMax: 0,
    method: "FOL.M", notes: "Vitamina B9 — C₁₉H₁₉N₇O₆",
  },
  {
    id: uid(), name: "Colecalciferol D3", wavelength: 264, waveTol: 10,
    expectedRT: 8.10, rtTol: 0.30, typicalWidth: 0.045, typicalAsym: 1.15,
    amtPerArea: 0.00985, units: "ug/ml", specMin: 0, specMax: 0,
    method: "VIT_D3.M", notes: "Vitamina D3 — C₂₇H₄₄O",
  },
  {
    id: uid(), name: "Tiamina", wavelength: 247, waveTol: 8,
    expectedRT: 1.50, rtTol: 0.15, typicalWidth: 0.026, typicalAsym: 1.12,
    amtPerArea: 0.03105, units: "ug/ml", specMin: 0, specMax: 0,
    method: "B1.M", notes: "Vitamina B1 — C₁₂H₁₇N₄OS",
  },
  {
    id: uid(), name: "Biotina", wavelength: 200, waveTol: 8,
    expectedRT: 3.80, rtTol: 0.20, typicalWidth: 0.032, typicalAsym: 1.20,
    amtPerArea: 0.01543, units: "ug/ml", specMin: 0, specMax: 0,
    method: "BIOT.M", notes: "Vitamina B7 — C₁₀H₁₆N₂O₃S",
  },
  {
    id: uid(), name: "Pantotenato de Cálcio", wavelength: 210, waveTol: 8,
    expectedRT: 2.70, rtTol: 0.18, typicalWidth: 0.028, typicalAsym: 1.10,
    amtPerArea: 0.02876, units: "ug/ml", specMin: 0, specMax: 0,
    method: "B5.M", notes: "Vitamina B5 — C₁₈H₃₂CaN₂O₁₀",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIVIDER = "    " + "=".repeat(69);
const LINE_DIV = "    " + "-".repeat(69);

function center(text: string, width = 69) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return "    " + " ".repeat(pad) + text;
}

function Div() {
  return <div style={{ whiteSpace: "pre" }}>{DIVIDER}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return (
    <>
      <Div />
      <div style={{ whiteSpace: "pre" }}>{center(title)}</div>
      <Div />
    </>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function ChromTooltip({ active, payload }: { active?: boolean; payload?: { payload: { time: number; signal: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { time, signal } = payload[0].payload;
  return (
    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
      <div>{time.toFixed(3)} min</div>
      <div>{signal.toFixed(3)} mAU</div>
    </div>
  );
}

// ─── Vertical RT label ────────────────────────────────────────────────────────

function PeakLabel({ viewBox, rt, name, dragging }: {
  viewBox?: { x: number; y: number };
  rt: number;
  name?: string;
  dragging?: boolean;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <g>
      {/* Compound name — horizontal, inside chart near the top */}
      {name && (
        <text
          x={x + 5} y={y + 13}
          textAnchor="start"
          style={{ fontFamily: "Courier New, monospace", fontSize: 9, fill: dragging ? "#e05" : "#1560bd", fontWeight: "bold", pointerEvents: "none" }}
        >
          {name}
        </text>
      )}
      {/* RT number — rotated vertical, above chart area */}
      <text
        x={x + 3} y={y - 3}
        textAnchor="start"
        transform={`rotate(-90, ${x + 3}, ${y - 3})`}
        style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, fill: dragging ? "#e05" : "#555", pointerEvents: "none" }}
      >
        {rt.toFixed(3)}
      </text>
      {/* Drag handle indicator — wider clickable zone hint */}
      <line
        x1={x} y1={y} x2={x} y2={y + 260}
        stroke={dragging ? "#e05" : "#1560bd"}
        strokeWidth={dragging ? 2 : 0.5}
        strokeDasharray={dragging ? "none" : "4 3"}
        strokeOpacity={dragging ? 0.6 : 0.3}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

// ─── Peak editor ──────────────────────────────────────────────────────────────

const PEAK_NUM_KEYS: (keyof Peak)[] = ["retentionTime", "height", "width", "asymmetry", "manualArea", "amtPerArea", "amount"];

function peakToStrings(p: Peak): Record<keyof Peak, string> {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) as Record<keyof Peak, string>;
}
function stringsToPeak(base: Peak, s: Record<keyof Peak, string>): Peak {
  const result = { ...base };
  for (const k of PEAK_NUM_KEYS) {
    const parsed = parseFloat(s[k]);
    (result as Record<string, unknown>)[k] = isNaN(parsed) ? 0 : parsed;
  }
  result.name = s.name;
  result.peakType = s.peakType;
  result.grp = s.grp;
  return result;
}

function PeakEditorDialog({ peak, onSave, children }: { peak: Peak; onSave: (p: Peak) => void; children: React.ReactNode }) {
  const [draft, setDraft] = useState<Record<keyof Peak, string>>(() => peakToStrings(peak));
  const [open, setOpen] = useState(false);
  const field = (key: keyof Peak) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [key]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (v) setDraft(peakToStrings(peak)); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle style={{ fontFamily: "Courier New, monospace" }}>Editar Pico</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onSave(stringsToPeak(peak, draft)); setOpen(false); }} className="space-y-2 pt-1">
          {([
            ["name", "Nome (ex: B6)", "text"],
            ["retentionTime", "Ret. Time [min]", "number"],
            ["peakType", "Tipo (VB/BB/BV/BB)", "text"],
            ["manualArea", "Área [mAU*s] (0 = calculada)", "number"],
            ["height", "Altura pico (mAU) — visual", "number"],
            ["width", "Largura σ (min) — visual", "number"],
            ["asymmetry", "Assimetria — visual", "number"],
            ["amtPerArea", "Amt/Area (ex: 0.03927)", "number"],
            ["amount", "Amount [ug/ml]", "number"],
            ["grp", "Grupo", "text"],
          ] as [keyof Peak, string, string][]).map(([k, label, type]) => (
            <div key={k} className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type={type} step="any"
                value={draft[k]}
                onChange={field(k)}
                className="h-7 text-xs font-mono"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            Área = 0 → calculada automaticamente pelo modelo Gaussiano.<br />
            Área &gt; 0 → valor exato usado no relatório.
          </p>
          <Button type="submit" className="w-full" size="sm">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable panel box ───────────────────────────────────────────────────────

function ControlBox({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ccc", padding: "10px 12px", borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold" }}>{title}</p>
        {extra}
      </div>
      {children}
    </div>
  );
}

function SmallField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string;
}) {
  return (
    <div className="mb-1.5">
      <Label style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", display: "block" }}>{label}</Label>
      <Input type={type} value={value} onChange={onChange} className="h-6 px-1.5" style={{ fontFamily: "Courier New, monospace", fontSize: 10 }} />
    </div>
  );
}

// ─── Active Compound Dialog ────────────────────────────────────────────────────

const COMPOUND_NUM_KEYS: (keyof ActiveCompound)[] = [
  "wavelength", "waveTol", "expectedRT", "rtTol", "typicalWidth",
  "typicalAsym", "amtPerArea", "specMin", "specMax",
];

function compoundToStrings(c: ActiveCompound): Record<keyof ActiveCompound, string> {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Record<keyof ActiveCompound, string>;
}
function stringsToCompound(base: ActiveCompound, s: Record<keyof ActiveCompound, string>): ActiveCompound {
  const result = { ...base };
  for (const k of COMPOUND_NUM_KEYS) {
    const parsed = parseFloat(s[k]);
    (result as Record<string, unknown>)[k] = isNaN(parsed) ? 0 : parsed;
  }
  result.name = s.name;
  result.units = s.units;
  result.method = s.method;
  result.notes = s.notes;
  return result;
}

function ActiveCompoundDialog({ compound, onSave, children }: {
  compound: ActiveCompound; onSave: (c: ActiveCompound) => void; children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Record<keyof ActiveCompound, string>>(() => compoundToStrings(compound));
  const [open, setOpen] = useState(false);
  const field = (key: keyof ActiveCompound) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [key]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (v) setDraft(compoundToStrings(compound)); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Courier New, monospace" }}>
            {compound.name || "Novo Ativo"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onSave(stringsToCompound(compound, draft)); setOpen(false); }} className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
          {([
            ["name",         "Nome do Composto",        "text",   "col-span-2"],
            ["notes",        "Notas / Fórmula",         "text",   "col-span-2"],
            ["method",       "Método (.M)",             "text",   "col-span-2"],
            ["wavelength",   "λ Sinal (nm)",            "number", ""],
            ["waveTol",      "±Tol λ (nm)",             "number", ""],
            ["expectedRT",   "TR Esperado (min)",       "number", ""],
            ["rtTol",        "±Tol TR (min)",           "number", ""],
            ["amtPerArea",   "Amt/Area (ug/ml/mAU*s)",  "number", "col-span-2"],
            ["units",        "Unidades",                "text",   ""],
            ["typicalWidth", "Largura σ (min)",         "number", ""],
            ["typicalAsym",  "Assimetria",              "number", ""],
            ["specMin",      "Spec Mín (ug/ml, 0=N/A)", "number", ""],
            ["specMax",      "Spec Máx (ug/ml, 0=N/A)", "number", ""],
          ] as [keyof ActiveCompound, string, string, string][]).map(([k, label, type, cls]) => (
            <div key={k} className={cls || ""}>
              <Label className="text-xs text-muted-foreground font-mono">{label}</Label>
              <Input type={type} step="any" value={draft[k]}
                onChange={field(k)} className="h-7 text-xs font-mono" />
            </div>
          ))}
          <Button type="submit" className="w-full col-span-2 mt-2" size="sm">
            Salvar Ativo
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "hplc_simulator_state_v1";

interface PersistedState {
  peaks: Peak[];
  sample: SampleInfo;
  detector: DetectorInfo;
  standards: CalibStandard[];
  calib: CalibInfo;
  activeCompounds: ActiveCompound[];
}

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch { return null; }
}

function saveState(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ─── Formula / Lot persistence ────────────────────────────────────────────────

const FORMULAS_KEY = "hplc_formulas_v1";
const LOTS_KEY = "hplc_lots_v1";

function loadFormulas(): Formula[] {
  try { return JSON.parse(localStorage.getItem(FORMULAS_KEY) ?? "[]") as Formula[]; }
  catch { return []; }
}
function saveFormulas(f: Formula[]) {
  try { localStorage.setItem(FORMULAS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}
function loadLots(): Lot[] {
  try { return JSON.parse(localStorage.getItem(LOTS_KEY) ?? "[]") as Lot[]; }
  catch { return []; }
}
function saveLots(l: Lot[]) {
  try { localStorage.setItem(LOTS_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

const SESSIONS_KEY = "hplc_analysis_sessions_v1";
const STANDARDS_KEY = "hplc_formula_standards_v1";

function loadSessions(): AnalysisSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as AnalysisSession[]; }
  catch { return []; }
}
function saveSessions(s: AnalysisSession[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function loadFormulaStandards(): FormulaStandard[] {
  try { return JSON.parse(localStorage.getItem(STANDARDS_KEY) ?? "[]") as FormulaStandard[]; }
  catch { return []; }
}
function saveFormulaStandards(s: FormulaStandard[]) {
  try { localStorage.setItem(STANDARDS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const SETUP_KEY = "hplc_session_setup_v1";
function loadLastSetup(): Partial<SessionSetupData> {
  try { return JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") as Partial<SessionSetupData>; }
  catch { return {}; }
}
function saveLastSetup(s: Partial<SessionSetupData>) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const IMAGES_KEY = "hplc_images_v1";
function loadSavedImages(): HplcSavedImage[] {
  try { return JSON.parse(localStorage.getItem(IMAGES_KEY) ?? "[]") as HplcSavedImage[]; }
  catch { return []; }
}
function saveSavedImages(imgs: HplcSavedImage[]) {
  try { localStorage.setItem(IMAGES_KEY, JSON.stringify(imgs)); } catch { /* ignore */ }
}

// Generates a full Agilent ChemStation-style report PNG for the session
function buildChromatogramPng(
  session: AnalysisSession,
  formula: Formula,
  formulaStd: FormulaStandard | null,
): string | null {
  if (session.runs.length === 0) return null;

  const W = 960;
  const MAX_H = 8000;
  const FONT = "11px 'Courier New', Courier, monospace";
  const FONT_SM = "9px 'Courier New', Courier, monospace";
  const FONT_BOLD = "bold 11px 'Courier New', Courier, monospace";
  const LINE = 13.5;
  const ML = 20;
  const CHART_H = 210;
  const SEP = "=".repeat(88);

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = MAX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, MAX_H);

  let y = 10;

  const txt = (s: string, x = ML, color = "#000", font = FONT) => {
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(s, x, y);
  };
  const nl = (n = 1) => { y += LINE * n; };
  const sep = () => {
    ctx.font = FONT_SM; ctx.fillStyle = "#999";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(SEP, ML, y);
    ctx.fillStyle = "#000";
    nl();
  };

  // Draw one run's chromatogram chart
  const drawRunChart = (run: AnalysisRun) => {
    const chartTop = y;
    const ML_c = ML + 46;
    const cW = W - ML_c - 36;
    const runTime = formula.detector.runTime;
    const chrom = buildChromatogram(run.peaks, runTime, 1600);
    const maxSig = Math.max(10, ...chrom.map(p => p.signal)) * 1.1;

    const xS = (t: number) => ML_c + (t / runTime) * cW;
    const yS = (s: number) => chartTop + CHART_H - (s / maxSig) * CHART_H;

    // mAU label (rotated)
    ctx.save();
    ctx.font = FONT_SM; ctx.fillStyle = "#555";
    ctx.translate(ML + 10, chartTop + CHART_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("mAU", 0, 0);
    ctx.restore();

    // Y-axis grid + tick labels
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const gy = chartTop + (i / ySteps) * CHART_H;
      const val = (((ySteps - i) / ySteps) * maxSig).toFixed(0);
      ctx.strokeStyle = "#e2e2e2"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(ML_c, gy); ctx.lineTo(ML_c + cW, gy); ctx.stroke();
      ctx.font = FONT_SM; ctx.fillStyle = "#555";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(val, ML_c - 3, gy);
    }

    // X-axis grid + tick labels
    const xSteps = Math.min(Math.ceil(runTime), 10);
    for (let i = 0; i <= xSteps; i++) {
      const t = (i / xSteps) * runTime;
      const gx = xS(t);
      ctx.strokeStyle = "#e2e2e2"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(gx, chartTop); ctx.lineTo(gx, chartTop + CHART_H); ctx.stroke();
      ctx.font = FONT_SM; ctx.fillStyle = "#555";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(t.toFixed(1), gx, chartTop + CHART_H + 2);
    }

    // "min" label
    ctx.font = FONT_SM; ctx.fillStyle = "#555";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("min", ML_c + cW + 4, chartTop + CHART_H + 2);

    // Axes
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ML_c, chartTop); ctx.lineTo(ML_c, chartTop + CHART_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ML_c, chartTop + CHART_H); ctx.lineTo(ML_c + cW, chartTop + CHART_H); ctx.stroke();

    // Chromatogram — Agilent ChemStation blue
    ctx.strokeStyle = "#1560bd"; ctx.lineWidth = 1;
    ctx.beginPath();
    chrom.forEach((pt, i) => {
      const px = xS(pt.time); const py = yS(pt.signal);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Peak labels — rotated retention time above peak apex
    run.peaks.filter(p => p.height > 1).sort((a, b) => a.retentionTime - b.retentionTime).forEach((p) => {
      const px = xS(p.retentionTime);
      const py = yS(p.height);
      ctx.save();
      ctx.translate(px + 2, py - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.font = "8px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#333";
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(p.retentionTime.toFixed(3), 0, 0);
      ctx.restore();
    });

    y = chartTop + CHART_H + 16;
  };

  // ── Render each run as a full ChemStation page ──────────────────────────
  for (let ri = 0; ri < session.runs.length; ri++) {
    const run = session.runs[ri];
    const det = formula.detector;

    // --- Header ---
    txt("Data File  " + run.sample.dataFile); nl();
    txt("Sample Name: " + run.sample.sampleName); nl(2);

    sep();

    // --- Operator block ---
    const pad = (s: string, n: number) => s.padEnd(n);
    txt(`    Acq. Operator   : ${pad(run.sample.acqOperator, 28)}Seq. Line :  ${run.sample.seqLine}`); nl();
    txt(`    Acq. Instrument : ${pad(run.sample.acqInstrument, 28)}Location  : ${run.sample.location}`); nl();
    txt(`    Injection Date  : ${pad(run.sample.injectionDate, 36)}Inj :  ${run.sample.inj}`); nl();
    txt(`    ${" ".repeat(55)}Inj Volume : ${run.sample.injVolume}`); nl();
    txt(`    Acq. Method     : ${run.sample.acqMethod}`); nl();
    txt(`    Last changed    : ${run.sample.lastChanged1}`); nl();
    txt(`    Analysis Method : ${run.sample.analysisMethod}`); nl();
    txt(`    Last changed    : ${run.sample.lastChanged2}`); nl();
    txt(`                      (modified after loading)`); nl(2);

    sep();

    // --- Signal info ---
    const refStr = det.refWavelength > 0
      ? `${det.refWavelength},${det.refBandwidth}`
      : "off";
    txt(`Signal ${ri + 1}: ${det.signalName || "DAD1 A"}, Sig=${det.sigWavelength},${det.sigBandwidth} Ref=${refStr}`);
    nl(1.8);

    // --- Chromatogram chart ---
    drawRunChart(run);

    nl(0.5);
    sep();

    // --- Peak table ---
    const sortedPeaks = [...run.peaks]
      .filter(p => p.height > 0.5)
      .sort((a, b) => a.retentionTime - b.retentionTime);
    const totalArea = sortedPeaks.reduce((s, p) => s + (p.manualArea > 0 ? p.manualArea : computeArea(p)), 0);

    txt(` ${"#".padEnd(3)} ${"RetTime".padEnd(8)} ${"Type".padEnd(5)} ${"Width".padEnd(8)} ${"Area".padEnd(13)} ${"Height".padEnd(11)} Area%`); nl();
    txt(`     [min]     |      [min]  |  [mAU*s]      [mAU]`); nl();
    ctx.fillStyle = "#888"; txt("-".repeat(82)); ctx.fillStyle = "#000"; nl();

    sortedPeaks.forEach((p, i) => {
      const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
      const areaPct = totalArea > 0 ? (area / totalArea) * 100 : 0;
      txt(
        ` ${String(i + 1).padStart(2)}  ${p.retentionTime.toFixed(3).padEnd(8)} ${p.peakType.padEnd(5)} ${p.width.toFixed(4).padEnd(8)} ${area.toFixed(5).padEnd(13)} ${p.height.toFixed(5).padEnd(11)} ${areaPct.toFixed(3)}`
      ); nl();
    });

    ctx.fillStyle = "#888"; txt("-".repeat(82)); ctx.fillStyle = "#000"; nl();
    txt(`Totals :                              ${totalArea.toFixed(5)}`); nl(2);

    sep();

    // --- Results section ---
    txt("Results obtained with enhanced integrator!"); nl(2);

    const compounds = formula.activeCompounds ?? [];
    if (compounds.length > 0) {
      txt(`${"Compound Name".padEnd(22)}  ${"CAS".padEnd(12)}  ${"Conc [mg/mL]".padEnd(14)}  ${"Nominal".padEnd(10)}  Teor%`); nl();
      ctx.fillStyle = "#888"; txt("-".repeat(80)); ctx.fillStyle = "#000"; nl();

      compounds.forEach(compound => {
        const peakMatch = sortedPeaks.find(
          p => Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol,
        );
        if (peakMatch) {
          const area = peakMatch.manualArea > 0 ? peakMatch.manualArea : computeArea(peakMatch);
          const stdEntry = formulaStd?.entries.find(e => e.compoundId === compound.id) ?? null;
          const { calcConc, teorPct } = calcTeorPct(area, compound, stdEntry);
          const nominal = stdEntry?.nominalConc ?? 0;
          txt(
            `${compound.name.padEnd(22)}  ${"".padEnd(12)}  ${calcConc.toFixed(4).padEnd(14)}  ${nominal > 0 ? nominal.toFixed(4).padEnd(10) : "N/D".padEnd(10)}  ${teorPct !== null ? teorPct.toFixed(2) + " %" : "N/D"}`
          );
        } else {
          txt(`${compound.name.padEnd(22)}  ${"".padEnd(12)}  ${"Not Found".padEnd(14)}  ${"N/D".padEnd(10)}  N/D`);
        }
        nl();
      });
      nl();
      sep();
    }

    y += 22; // gap between runs
  }

  // ── Multi-run summary ────────────────────────────────────────────────────
  if (session.runs.length > 1) {
    txt(`SUMÁRIO DA SESSÃO: ${session.name}`, ML, "#1d4ed8", FONT_BOLD); nl(2);
    sep();

    const compounds = formula.activeCompounds ?? [];
    if (compounds.length > 0) {
      compounds.forEach(compound => {
        const vals = session.runs.map(run => {
          const p = run.peaks.find(p => Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol);
          if (!p) return null;
          const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
          const stdEntry = formulaStd?.entries.find(e => e.compoundId === compound.id) ?? null;
          const { teorPct } = calcTeorPct(area, compound, stdEntry);
          return teorPct;
        }).filter((v): v is number => v !== null);

        if (vals.length > 0) {
          const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
          const sd = vals.length > 1
            ? Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (vals.length - 1))
            : 0;
          const cv = mean > 0 ? (sd / mean) * 100 : 0;
          txt(`${compound.name}  —  Média = ${mean.toFixed(2)} %    DP = ${sd.toFixed(3)}    %CV = ${cv.toFixed(2)} %    (n = ${vals.length})`, ML, "#000", FONT_BOLD); nl();

          session.runs.forEach((run, ri) => {
            const p = run.peaks.find(p => Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol);
            if (!p) return;
            const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
            const stdEntry = formulaStd?.entries.find(e => e.compoundId === compound.id) ?? null;
            const { calcConc, teorPct } = calcTeorPct(area, compound, stdEntry);
            txt(
              `   ${run.label}:  Área = ${area.toFixed(4).padEnd(12)}  Conc = ${calcConc.toFixed(4)} mg/mL  Teor = ${teorPct !== null ? teorPct.toFixed(2) + " %" : "N/D"}`
            ); nl();
          });
          nl();
        }
      });
      sep();
    } else {
      // No compounds — just list peak areas per run
      txt(`${"Corrida".padEnd(10)}  ${"Pico".padEnd(24)}  ${"RT (min)".padEnd(10)}  ${"Área (mAU*s)".padEnd(14)}  Area%`); nl();
      ctx.fillStyle = "#888"; txt("-".repeat(80)); ctx.fillStyle = "#000"; nl();
      session.runs.forEach(run => {
        const peaks = [...run.peaks].filter(p => p.height > 0.5).sort((a, b) => a.retentionTime - b.retentionTime);
        const tot = peaks.reduce((s, p) => s + (p.manualArea > 0 ? p.manualArea : computeArea(p)), 0);
        peaks.forEach(p => {
          const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
          txt(`${run.label.padEnd(10)}  ${(p.name || "—").padEnd(24)}  ${p.retentionTime.toFixed(3).padEnd(10)}  ${area.toFixed(5).padEnd(14)}  ${tot > 0 ? ((area / tot) * 100).toFixed(3) : "N/D"}`); nl();
        });
      });
      sep();
    }
  }

  // ── Status footer ────────────────────────────────────────────────────────
  nl();
  const statusLabel: Record<string, string> = {
    em_andamento: "EM ANÁLISE", aprovado: "APROVADO",
    reprovado: "REPROVADO", laudo_emitido: "LAUDO EMITIDO",
  };
  const statusColor: Record<string, string> = {
    em_andamento: "#1d4ed8", aprovado: "#16a34a",
    reprovado: "#dc2626", laudo_emitido: "#7c3aed",
  };
  txt(
    `Resultado da Sessão: ${statusLabel[session.status] ?? session.status}`,
    ML, statusColor[session.status] ?? "#000", FONT_BOLD,
  ); nl();
  if (session.concludedAt) {
    txt(`Concluído em: ${new Date(session.concludedAt).toLocaleString("pt-BR")}`, ML, "#666"); nl();
  }
  if (session.laudoEmittedAt) {
    txt(`Laudo emitido em: ${new Date(session.laudoEmittedAt).toLocaleString("pt-BR")}`, ML, "#666"); nl();
  }

  y += 24;

  // Trim canvas to actual content height
  const out = document.createElement("canvas");
  out.width = W; out.height = Math.min(y, MAX_H);
  out.getContext("2d")?.drawImage(canvas, 0, 0);
  return out.toDataURL("image/png");
}

// Applies ±2% deterministic variation to peaks so runs look slightly different
function applyRunVariation(peaks: Peak[], runIndex: number): Peak[] {
  return peaks.map((p, pi) => {
    const seed = ((runIndex + 1) * 13 + pi * 7) % 100;
    const v = (seed / 100 - 0.5) * 0.04; // ±2%
    return {
      ...p,
      height: parseFloat((p.height * (1 + v)).toFixed(3)),
      manualArea: p.manualArea > 0 ? parseFloat((p.manualArea * (1 + v)).toFixed(3)) : 0,
    };
  });
}

function calcTeorPct(
  runArea: number,
  compound: ActiveCompound,
  stdEntry: StandardEntry | null,
): { calcConc: number; teorPct: number | null } {
  let calcConc = 0;
  if (stdEntry && stdEntry.stdArea > 0) {
    calcConc = (runArea / stdEntry.stdArea) * stdEntry.stdConc;
  } else if (compound.amtPerArea > 0) {
    calcConc = runArea * compound.amtPerArea;
  }
  const nominal = stdEntry?.nominalConc ?? 0;
  const teorPct = nominal > 0 && calcConc > 0 ? parseFloat(((calcConc / nominal) * 100).toFixed(2)) : null;
  return { calcConc: parseFloat(calcConc.toFixed(4)), teorPct };
}

function computeLotResults(
  peaks: Peak[],
  compounds: ActiveCompound[],
  detectorWavelength: number,
): LotResult[] {
  return compounds.map(compound => {
    const wavMatch = Math.abs(compound.wavelength - detectorWavelength) <= compound.waveTol;
    const peakMatch = peaks.find(p =>
      wavMatch && Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol,
    );
    if (!peakMatch) {
      return { compoundId: compound.id, compoundName: compound.name, found: false, concentration: 0, retentionTime: 0, area: 0, inSpec: null };
    }
    const area = peakMatch.manualArea > 0 ? peakMatch.manualArea : computeArea(peakMatch);
    const conc = parseFloat((area * compound.amtPerArea).toFixed(4));
    const inSpec = compound.specMin > 0 && compound.specMax > 0
      ? conc >= compound.specMin && conc <= compound.specMax
      : null;
    return { compoundId: compound.id, compoundName: compound.name, found: true, concentration: conc, retentionTime: peakMatch.retentionTime, area: parseFloat(area.toFixed(4)), inSpec };
  });
}

// ─── Save Formula Dialog ──────────────────────────────────────────────────────

function SaveFormulaDialog({ onSave, children }: { onSave: (name: string, description: string) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-mono">Salvar como Fórmula</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; onSave(name.trim(), description.trim()); setOpen(false); setName(""); setDescription(""); }} className="space-y-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Nome da Fórmula *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Multivitamínico V1" className="h-7 text-xs font-mono mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Descrição (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Cápsulas 500mg — formulação padrão" className="h-7 text-xs font-mono mt-1" />
          </div>
          <Button type="submit" className="w-full" size="sm" disabled={!name.trim()}>
            Salvar Fórmula
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Lot Dialog ───────────────────────────────────────────────────────────

function AddLotDialog({ onSave, children }: { onSave: (lotNumber: string, notes: string) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-mono">Registrar Lote Analisado</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (!lotNumber.trim()) return; onSave(lotNumber.trim(), notes.trim()); setOpen(false); setLotNumber(""); setNotes(""); }} className="space-y-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Número do Lote *</Label>
            <Input value={lotNumber} onChange={e => setLotNumber(e.target.value)} placeholder="Ex: LOT-2025-001" className="h-7 text-xs font-mono mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Observações (opcional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Amostra Pote A — 2ª corrida" className="h-7 text-xs font-mono mt-1" />
          </div>
          <p className="text-xs text-muted-foreground font-mono">O cromatograma atual (picos configurados) será salvo como resultado deste lote.</p>
          <Button type="submit" className="w-full" size="sm" disabled={!lotNumber.trim()}>
            Registrar Lote
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Session Dialog ───────────────────────────────────────────────────────

function NewSessionDialog({ formulas, onSave, children }: {
  formulas: Formula[];
  onSave: (setup: SessionSetupData) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const defaults = (): SessionSetupData => {
    const last = loadLastSetup();
    const f0 = formulas[0];
    return {
      formulaId:      last.formulaId      ?? f0?.id ?? "",
      sessionName:    last.sessionName    ?? "",
      notes:          "",
      sampleName:     last.sampleName     ?? "",
      lotNumber:      last.lotNumber      ?? "",
      seqLine:        last.seqLine        ?? "1",
      location:       last.location       ?? "Vial 1",
      acqOperator:    last.acqOperator    ?? "",
      acqInstrument:  last.acqInstrument  ?? "Instrument 1",
      injVolume:      last.injVolume      ?? "10.0 µl",
      acqMethod:      last.acqMethod      ?? "",
      analysisMethod: last.analysisMethod ?? "",
    };
  };

  const [d, setD] = useState<SessionSetupData>(defaults);
  const set = (k: keyof SessionSetupData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setD(prev => ({ ...prev, [k]: e.target.value }));

  const handleOpen = (v: boolean) => {
    if (v) setD(defaults());
    setOpen(v);
  };

  const section = (title: string) => (
    <div className="text-xs font-mono font-bold text-blue-700 border-b border-blue-100 pb-0.5 mt-3 mb-1.5 uppercase tracking-wide">
      {title}
    </div>
  );

  const field = (label: string, key: keyof SessionSetupData, placeholder = "", required = false) => (
    <div className="flex items-center gap-2">
      <Label className="text-xs font-mono text-muted-foreground w-36 shrink-0 text-right">
        {label}{required ? " *" : ""}
      </Label>
      <Input
        value={d[key] as string}
        onChange={set(key)}
        placeholder={placeholder}
        required={required}
        className="h-6 text-xs font-mono flex-1"
      />
    </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.formulaId || !d.sessionName.trim()) return;
    saveLastSetup({ ...d, notes: undefined as unknown as string });
    onSave({ ...d, sessionName: d.sessionName.trim() });
    setOpen(false);
  };

  const canSubmit = !!d.formulaId && !!d.sessionName.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            Configuração Prévia da Análise
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">
            Preencha os dados antes de iniciar a sessão. Os valores são lembrados para a próxima análise.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-1.5 pt-1">

          {/* ── SESSÃO ─────────────────────────────────────────────── */}
          {section("Sessão de Análise")}

          <div className="flex items-center gap-2">
            <Label className="text-xs font-mono text-muted-foreground w-36 shrink-0 text-right">Fórmula / Método *</Label>
            <select
              value={d.formulaId}
              onChange={set("formulaId")}
              required
              className="h-6 text-xs font-mono border border-input rounded px-2 bg-background flex-1"
            >
              {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {field("Nome da Sessão", "sessionName", "Ex: Análise LOT-2025-001", true)}

          {/* ── AMOSTRA ────────────────────────────────────────────── */}
          {section("Informações da Amostra")}

          {field("Nome da Amostra", "sampleName", "Ex: VITAMINA D3 500mg cáp")}
          {field("Nº Lote / Batch", "lotNumber", "Ex: LOT-2025-042")}
          {field("Seq. Line (nº inj.)", "seqLine", "1")}
          {field("Local / Vial", "location", "Ex: Vial 1")}

          {/* ── INSTRUMENTO / MÉTODO ───────────────────────────────── */}
          {section("Instrumento e Método")}

          {field("Operador", "acqOperator", "Nome do analista", true)}
          {field("Instrumento", "acqInstrument", "Instrument 1")}
          {field("Volume de Injeção", "injVolume", "10.0 µl")}
          {field("Método de Aquisição", "acqMethod", "C:\\CHEM32\\METHODS\\...")}
          {field("Método de Análise", "analysisMethod", "C:\\CHEM32\\METHODS\\...")}

          {/* ── OBSERVAÇÕES ────────────────────────────────────────── */}
          {section("Observações")}
          <div className="flex items-start gap-2">
            <Label className="text-xs font-mono text-muted-foreground w-36 shrink-0 text-right pt-1">Obs.</Label>
            <textarea
              value={d.notes}
              onChange={set("notes")}
              placeholder="Condições especiais, desvios, referências..."
              rows={2}
              className="flex-1 text-xs font-mono border border-input rounded px-2 py-1 bg-background resize-none"
            />
          </div>

          <div className="pt-3 border-t">
            <Button type="submit" className="w-full" size="sm" disabled={!canSubmit}>
              <FlaskConical className="h-3.5 w-3.5 mr-2" /> Iniciar Análise
            </Button>
            <p className="text-xs text-center text-muted-foreground font-mono mt-1.5">
              Até 5 corridas (injeções) por sessão · Cromatogramas sobrepostos + Teor%
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set Standard Dialog ──────────────────────────────────────────────────────

function SetStandardDialog({ compounds, existing, onSave, children }: {
  compounds: ActiveCompound[];
  existing: FormulaStandard | null;
  onSave: (entries: StandardEntry[], notes: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [entries, setEntries] = useState<Record<string, { nominalConc: string; stdArea: string; stdConc: string }>>({});

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setNotes(existing?.notes ?? "");
      const init: typeof entries = {};
      for (const c of compounds) {
        const ex = existing?.entries.find(e => e.compoundId === c.id);
        init[c.id] = {
          nominalConc: String(ex?.nominalConc ?? (c.specMin > 0 && c.specMax > 0 ? ((c.specMin + c.specMax) / 2).toFixed(3) : "")),
          stdArea: String(ex?.stdArea ?? "0"),
          stdConc: String(ex?.stdConc ?? "0"),
        };
      }
      setEntries(init);
    }
  };

  const setField = (cid: string, field: "nominalConc" | "stdArea" | "stdConc", val: string) =>
    setEntries(e => ({ ...e, [cid]: { ...e[cid], [field]: val } }));

  const handleSave = () => {
    const parsed: StandardEntry[] = compounds.map(c => ({
      compoundId: c.id,
      compoundName: c.name,
      units: c.units,
      nominalConc: parseFloat(entries[c.id]?.nominalConc ?? "0") || 0,
      stdArea: parseFloat(entries[c.id]?.stdArea ?? "0") || 0,
      stdConc: parseFloat(entries[c.id]?.stdConc ?? "0") || 0,
    }));
    onSave(parsed, notes.trim());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-mono">Configurar Padrão de Referência</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-3 pt-1 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground font-mono">
            Para cada composto, informe a concentração nominal (declarada na fórmula) e, opcionalmente, os dados do padrão externo.
          </p>
          {compounds.map(c => (
            <div key={c.id} className="border rounded p-2 space-y-1.5">
              <div className="text-xs font-mono font-bold">{c.name} <span className="text-muted-foreground font-normal">({c.units})</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Conc. Nominal *</Label>
                  <Input type="number" step="any" value={entries[c.id]?.nominalConc ?? ""}
                    onChange={e => setField(c.id, "nominalConc", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="ug/ml" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Área Padrão</Label>
                  <Input type="number" step="any" value={entries[c.id]?.stdArea ?? ""}
                    onChange={e => setField(c.id, "stdArea", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="mAU*s" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Conc. Padrão</Label>
                  <Input type="number" step="any" value={entries[c.id]?.stdConc ?? ""}
                    onChange={e => setField(c.id, "stdConc", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="ug/ml" />
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground font-mono">Área Padrão = 0 → usa Amt/Area da calibração</div>
            </div>
          ))}
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Observações</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-7 text-xs font-mono mt-1" />
          </div>
          <Button type="submit" className="w-full" size="sm">Salvar Padrão</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type PageMode = "painel" | "chromatogram" | "ativos" | "lotes" | "report" | "usuarios" | "analise";

interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  hplcAccess: boolean;
  createdAt: string;
}

export default function HplcSimulator() {
  const { user, token, logout, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [page, setPage] = useState<PageMode>("chromatogram");
  const [isDirty, setIsDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [peaks, setPeaks] = useState<Peak[]>(() => loadState()?.peaks ?? DEFAULT_PEAKS);
  const [sample, setSample] = useState<SampleInfo>(() => loadState()?.sample ?? DEFAULT_SAMPLE);
  const [detector, setDetector] = useState<DetectorInfo>(() => loadState()?.detector ?? DEFAULT_DETECTOR);
  const [standards, setStandards] = useState<CalibStandard[]>(() => loadState()?.standards ?? DEFAULT_STANDARDS);
  const [calib, setCalib] = useState<CalibInfo>(() => loadState()?.calib ?? DEFAULT_CALIB);
  const [activeCompounds, setActiveCompounds] = useState<ActiveCompound[]>(() => loadState()?.activeCompounds ?? DEFAULT_ACTIVE_COMPOUNDS);
  const [lastIdentified, setLastIdentified] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(true);
  const [showStdPeak, setShowStdPeak] = useState(false);
  const [formulas, setFormulas] = useState<Formula[]>(() => loadFormulas());
  const [lots, setLots] = useState<Lot[]>(() => loadLots());
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>(() => loadSessions());
  const [formulaStandards, setFormulaStandards] = useState<FormulaStandard[]>(() => loadFormulaStandards());
  const [savedImages, setSavedImages] = useState<HplcSavedImage[]>(() => loadSavedImages());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userList, setUserList] = useState<UserRecord[]>([]);
  const [userListLoading, setUserListLoading] = useState(false);
  const [userListError, setUserListError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteSessionDialog, setDeleteSessionDialog] = useState<{ id: string; name: string } | null>(null);
  const [deleteSessionPwd, setDeleteSessionPwd] = useState("");
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false);

  const markDirty = useCallback(() => { setIsDirty(true); setConfirmed(false); }, []);

  // Tracks the compound name as of the last confirm, so we can cascade renames
  const prevCalibNameRef = useRef(calib.compoundName);

  const handleConfirm = useCallback(() => {
    const oldName = prevCalibNameRef.current;
    const newName = calib.compoundName.trim();

    // Cascade compound name change → peaks and active compounds
    let finalPeaks = peaks;
    let finalActives = activeCompounds;
    if (newName && newName !== oldName) {
      finalPeaks = peaks.map(p =>
        p.name === oldName ? { ...p, name: newName } : p
      );
      finalActives = activeCompounds.map(c =>
        c.name === oldName ? { ...c, name: newName } : c
      );
      setPeaks(finalPeaks);
      setActiveCompounds(finalActives);
      prevCalibNameRef.current = newName;
    }

    saveState({ peaks: finalPeaks, sample, detector, standards, calib, activeCompounds: finalActives });
    setIsDirty(false);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
  }, [peaks, sample, detector, standards, calib, activeCompounds]);

  // ── Peak drag (left/right on chromatogram) ───────────────────────────────────

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const peakDragRef = useRef<{ peakId: string } | null>(null);
  const [draggingPeakId, setDraggingPeakId] = useState<string | null>(null);

  // chart inner-area constants (must match ComposedChart margin + YAxis width)
  const CM_LEFT = 54;  // margin.left(8) + YAxis.width(46)
  const CM_RIGHT = 16; // margin.right

  const xToTime = useCallback((clientX: number): number => {
    if (!chartContainerRef.current) return 0;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const innerW = rect.width - CM_LEFT - CM_RIGHT;
    const t = ((clientX - rect.left - CM_LEFT) / innerW) * detector.runTime;
    return parseFloat(Math.max(0.05, Math.min(detector.runTime * 0.98, t)).toFixed(3));
  }, [detector.runTime]);

  const timeToClientX = useCallback((t: number): number => {
    if (!chartContainerRef.current) return 0;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const innerW = rect.width - CM_LEFT - CM_RIGHT;
    return rect.left + CM_LEFT + (t / detector.runTime) * innerW;
  }, [detector.runTime]);

  const handleChartMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const innerW = rect.width - CM_LEFT - CM_RIGHT;
    const mouseX = e.clientX - rect.left;
    let best: { id: string; dist: number } | null = null;
    for (const p of peaks.filter(pp => pp.name)) {
      const px = CM_LEFT + (p.retentionTime / detector.runTime) * innerW;
      const d = Math.abs(mouseX - px);
      if (d < 16 && (!best || d < best.dist)) best = { id: p.id, dist: d };
    }
    if (best) {
      peakDragRef.current = { peakId: best.id };
      setDraggingPeakId(best.id);
      e.preventDefault();
      e.stopPropagation();
    }
  }, [peaks, detector.runTime]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!peakDragRef.current) return;
    const newRT = xToTime(e.clientX);
    const pid = peakDragRef.current.peakId;
    setPeaks(ps => ps.map(p => p.id === pid ? { ...p, retentionTime: newRT } : p));
  }, [xToTime]);

  const handleChartMouseUp = useCallback(() => {
    if (peakDragRef.current) {
      peakDragRef.current = null;
      setDraggingPeakId(null);
      markDirty();
    }
  }, [markDirty]);

  // ── Chromatogram data ────────────────────────────────────────────────────────

  const chromatogram = useMemo(() => buildChromatogram(peaks, detector.runTime), [peaks, detector.runTime]);

  // Standard reference peak overlay — simulates the mid-level calibration standard
  const stdPeakInfo = useMemo(() => {
    if (!showStdPeak || standards.length === 0) return null;
    const sorted = [...standards].sort((a, b) => a.amount - b.amount);
    const midStd = sorted[Math.floor(sorted.length / 2)];
    const namedPeak = peaks.find(p => p.name === calib.compoundName) ?? peaks.find(p => p.name);
    if (!namedPeak) return null;
    const stdHeight = midStd.area / (namedPeak.width * Math.sqrt(2 * Math.PI));
    const stdPeakObj: Peak = {
      ...namedPeak, id: "std-ovl", name: "STD", height: stdHeight, manualArea: 0,
    };
    const chrom = buildChromatogram([stdPeakObj], detector.runTime);
    return { chrom, midStd, namedPeak, stdHeight, level: Math.floor(sorted.length / 2) + 1, total: sorted.length };
  }, [showStdPeak, standards, peaks, calib.compoundName, detector.runTime]);

  const mergedChrom = useMemo(() => {
    if (!stdPeakInfo) return chromatogram;
    const stdMap = new Map(stdPeakInfo.chrom.map(pt => [pt.time, pt.signal]));
    return chromatogram.map(pt => ({ ...pt, stdSignal: stdMap.get(pt.time) ?? 0 }));
  }, [chromatogram, stdPeakInfo]);

  const peakStats = useMemo(() =>
    [...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map((p, i) => ({
      ...p, peakNum: i + 1,
      computedArea: computeArea(p),
      displayArea: p.manualArea > 0 ? p.manualArea : computeArea(p),
    })),
    [peaks]
  );
  const totalAmount = peakStats.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0);

  const yMax = useMemo(() => {
    const max = Math.max(...chromatogram.map(d => d.signal), 10);
    return Math.ceil(max * 1.15 / 50) * 50;
  }, [chromatogram]);

  const xTicks = useMemo(() => {
    const t: number[] = [];
    for (let v = 0; v <= detector.runTime; v += 2) t.push(parseFloat(v.toFixed(1)));
    return t;
  }, [detector.runTime]);

  const yTicks = useMemo(() => {
    const step = yMax <= 200 ? 50 : yMax <= 500 ? 100 : yMax <= 2000 ? 500 : 1000;
    const t: number[] = [];
    for (let v = 0; v <= yMax; v += step) t.push(v);
    return t;
  }, [yMax]);

  // ── Calibration ──────────────────────────────────────────────────────────────

  const reg = useMemo(() => {
    const pts = standards.map(s => ({ x: s.amount, y: s.area }));
    return linearRegression(pts);
  }, [standards]);

  const calibXMax = useMemo(() => Math.max(...standards.map(s => s.amount)) * 1.15, [standards]);
  const calibYMax = useMemo(() => Math.max(...standards.map(s => s.area)) * 1.2, [standards]);

  const calibChartData = useMemo(() => {
    const sorted = [...standards].sort((a, b) => a.amount - b.amount);
    const regPts = Array.from({ length: 80 }, (_, i) => {
      const x = (i / 79) * calibXMax;
      return { x: parseFloat(x.toFixed(4)), reg: reg.slope * x + reg.intercept, pt: undefined as number | undefined };
    });
    sorted.forEach(s => {
      const nearest = regPts.reduce((best, _p, i) =>
        Math.abs(regPts[i].x - s.amount) < Math.abs(regPts[best].x - s.amount) ? i : best, 0);
      regPts[nearest].x = s.amount;
      regPts[nearest].reg = reg.slope * s.amount + reg.intercept;
      regPts[nearest].pt = s.area;
    });
    return regPts;
  }, [standards, calibXMax, reg]);

  // ── Signal label ─────────────────────────────────────────────────────────────

  const signalLabel = `${detector.signalName}, Sig=${detector.sigWavelength},${detector.sigBandwidth} Ref=${detector.refWavelength},${detector.refBandwidth}`;

  // ── Now ───────────────────────────────────────────────────────────────────────

  const now = new Date().toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  // ── Peaks ────────────────────────────────────────────────────────────────────

  const addPeak = useCallback(() => {
    setPeaks(ps => [...ps, {
      id: uid(), name: "", peakType: "BB", grp: "", amtPerArea: 0, amount: 0, manualArea: 0,
      retentionTime: parseFloat((1 + Math.random() * (detector.runTime - 2)).toFixed(3)),
      height: Math.round(10 + Math.random() * 80),
      width: parseFloat((0.04 + Math.random() * 0.08).toFixed(3)),
      asymmetry: parseFloat((0.95 + Math.random() * 0.2).toFixed(2)),
    }]);
    markDirty();
  }, [detector.runTime, markDirty]);

  const removePeak = (id: string) => { setPeaks(ps => ps.filter(p => p.id !== id)); markDirty(); };
  const savePeak = (updated: Peak) => { setPeaks(ps => ps.map(p => p.id === updated.id ? updated : p)); markDirty(); };

  const addStandard = () => {
    const n = standards.length + 1;
    setStandards(ss => [...ss, { id: uid(), level: n, amount: 10 * n, area: Math.round(reg.slope * 10 * n + reg.intercept) }]);
    markDirty();
  };
  const removeStandard = (id: string) => { setStandards(ss => ss.filter(s => s.id !== id)); markDirty(); };
  const updateStandard = (id: string, key: "amount" | "area", val: number) => {
    setStandards(ss => ss.map(s => s.id === id ? { ...s, [key]: val } : s));
    markDirty();
  };

  const sField = (k: keyof SampleInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSample(s => ({ ...s, [k]: e.target.value }));
    markDirty();
  };
  const dField = (k: keyof DetectorInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDetector(d => ({ ...d, [k]: (["runTime", "sigWavelength", "sigBandwidth", "refWavelength", "refBandwidth"] as (keyof DetectorInfo)[]).includes(k) ? parseFloat(e.target.value) || 0 : e.target.value }));
    markDirty();
  };
  const cField = (k: keyof CalibInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCalib(c => ({ ...c, [k]: (["expRT"] as (keyof CalibInfo)[]).includes(k) ? parseFloat(e.target.value) || 0 : e.target.value }));
    markDirty();
  };

  // ── Active Compounds ─────────────────────────────────────────────────────────

  const addActiveCompound = () => {
    setActiveCompounds(cs => [...cs, {
      id: uid(), name: "Novo Ativo", wavelength: detector.sigWavelength, waveTol: 8,
      expectedRT: 2.0, rtTol: 0.15, typicalWidth: 0.030, typicalAsym: 1.15,
      amtPerArea: 0.03, units: "ug/ml", specMin: 0, specMax: 0,
      method: "", notes: "",
    }]);
    markDirty();
  };

  const saveActiveCompound = (updated: ActiveCompound) => {
    setActiveCompounds(cs => cs.map(c => c.id === updated.id ? updated : c));
    markDirty();
  };

  const removeActiveCompound = (id: string) => {
    setActiveCompounds(cs => cs.filter(c => c.id !== id));
    markDirty();
  };

  const autoIdentifyPeaks = () => {
    const identified: string[] = [];
    setPeaks(ps => ps.map(peak => {
      let bestMatch: ActiveCompound | null = null;
      let bestDeltaRT = Infinity;
      for (const compound of activeCompounds) {
        const wavOk = Math.abs(compound.wavelength - detector.sigWavelength) <= compound.waveTol;
        const rtDelta = Math.abs(compound.expectedRT - peak.retentionTime);
        const rtOk = rtDelta <= compound.rtTol;
        if (wavOk && rtOk && rtDelta < bestDeltaRT) {
          bestDeltaRT = rtDelta;
          bestMatch = compound;
        }
      }
      if (bestMatch) {
        identified.push(bestMatch.name);
        const displayArea = peak.manualArea > 0 ? peak.manualArea : computeArea(peak);
        return {
          ...peak,
          name: bestMatch.name,
          amtPerArea: bestMatch.amtPerArea,
          amount: parseFloat((displayArea * bestMatch.amtPerArea).toFixed(4)),
        };
      }
      return peak;
    }));
    setLastIdentified(identified);
    markDirty();
  };

  // ── User management handlers (admin only) ────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setUserListLoading(true);
    setUserListError(null);
    try {
      const res = await fetch("/api/users", { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro ao carregar usuários.");
      setUserList(await res.json() as UserRecord[]);
    } catch (e) {
      setUserListError((e as Error).message);
    } finally {
      setUserListLoading(false);
    }
  }, [token]);

  const toggleHplcAccess = async (userId: number, current: boolean) => {
    if (!token || togglingId) return;
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hplcAccess: !current }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar acesso.");
      const updated = await res.json() as UserRecord;
      setUserList(ul => ul.map(u => u.id === userId ? { ...u, hplcAccess: updated.hplcAccess } : u));
    } finally {
      setTogglingId(null);
    }
  };

  // ── Formula / Lot handlers ──────────────────────────────────────────────────

  const handleSaveFormula = (name: string, description: string) => {
    const formula: Formula = {
      id: uid(), name, description,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      detector, activeCompounds, standards, calib,
    };
    setFormulas(fs => { const updated = [...fs, formula]; saveFormulas(updated); return updated; });
    setSelectedFormulaId(formula.id);
    setPage("lotes");
  };

  const handleDeleteFormula = (id: string) => {
    setFormulas(fs => { const updated = fs.filter(f => f.id !== id); saveFormulas(updated); return updated; });
    setLots(ls => { const updated = ls.filter(l => l.formulaId !== id); saveLots(updated); return updated; });
    if (selectedFormulaId === id) setSelectedFormulaId(null);
  };

  const handleLoadFormula = (formula: Formula) => {
    setDetector(formula.detector);
    setActiveCompounds(formula.activeCompounds);
    setStandards(formula.standards);
    setCalib(formula.calib);
    setPage("chromatogram");
    markDirty();
  };

  const handleAddLot = (lotNumber: string, notes: string) => {
    if (!selectedFormulaId) return;
    const formula = formulas.find(f => f.id === selectedFormulaId);
    if (!formula) return;
    const results = computeLotResults(peaks, formula.activeCompounds, formula.detector.sigWavelength);
    const lot: Lot = {
      id: uid(), formulaId: selectedFormulaId, lotNumber,
      createdAt: new Date().toISOString(), sample, observedPeaks: [...peaks], results, notes,
    };
    setLots(ls => { const updated = [...ls, lot]; saveLots(updated); return updated; });
  };

  const handleDeleteLot = (id: string) => {
    setLots(ls => { const updated = ls.filter(l => l.id !== id); saveLots(updated); return updated; });
  };

  // ── Analysis Session handlers ─────────────────────────────────────────────────

  const handleCreateSession = (setup: SessionSetupData) => {
    // Build injection date + data file path from setup
    const now = new Date();
    const injDate = now.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, "-");
    const nameSafe = (setup.sampleName || setup.sessionName).replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
    const dataFile = `C:\\CHEM32\\1\\DATA\\${nameSafe}_${dateSlug}\\001-0001.D`;
    const operatorTag = `${injDate} by ${setup.acqOperator || "USER"}`;

    // Apply setup values to the sample state so runs inherit them
    setSample({
      dataFile,
      sampleName:    setup.sampleName    || setup.sessionName,
      acqOperator:   setup.acqOperator   || "",
      seqLine:       setup.seqLine       || "1",
      acqInstrument: setup.acqInstrument || "Instrument 1",
      location:      setup.location      || "Vial 1",
      injectionDate: injDate,
      inj:           "1",
      injVolume:     setup.injVolume     || "10.0 µl",
      acqMethod:     setup.acqMethod     || "",
      lastChanged1:  operatorTag,
      analysisMethod: setup.analysisMethod || "",
      lastChanged2:  operatorTag,
    });
    markDirty();

    const session: AnalysisSession = {
      id: uid(), formulaId: setup.formulaId,
      name: setup.sessionName, notes: setup.notes,
      createdAt: now.toISOString(), runs: [], status: "em_andamento",
    };
    setAnalysisSessions(ss => { const u = [...ss, session]; saveSessions(u); return u; });
    setCurrentSessionId(session.id);
    setPage("analise");
  };

  const handleRegisterRun = () => {
    if (!currentSessionId) return;
    setAnalysisSessions(ss => {
      const session = ss.find(s => s.id === currentSessionId);
      if (!session || session.runs.length >= 5) return ss;
      const runIndex = session.runs.length;
      const run: AnalysisRun = {
        id: uid(),
        runNumber: runIndex + 1,
        label: `R${runIndex + 1}`,
        createdAt: new Date().toISOString(),
        peaks: applyRunVariation([...peaks], runIndex),
        sample: { ...sample },
        color: RUN_COLORS[runIndex],
      };
      const updated = ss.map(s => s.id === currentSessionId ? { ...s, runs: [...s.runs, run] } : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleDeleteRun = (sessionId: string, runId: string) => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId
        ? { ...s, runs: s.runs.filter(r => r.id !== runId).map((r, i) => ({ ...r, runNumber: i + 1, label: `R${i + 1}`, color: RUN_COLORS[i] })) }
        : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleDeleteSession = (id: string) => {
    setAnalysisSessions(ss => { const u = ss.filter(s => s.id !== id); saveSessions(u); return u; });
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  const openDeleteSessionDialog = (id: string, name: string) => {
    setDeleteSessionDialog({ id, name });
    setDeleteSessionPwd("");
    setDeleteSessionError(null);
  };

  const confirmDeleteSession = async () => {
    if (!deleteSessionDialog) return;
    setDeleteSessionLoading(true);
    setDeleteSessionError(null);
    try {
      const token = sessionStorage.getItem("alphafitus_token") ?? "";
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deleteSessionPwd }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setDeleteSessionError(data.error ?? "Senha incorreta.");
        return;
      }
      handleDeleteSession(deleteSessionDialog.id);
      setDeleteSessionDialog(null);
      setDeleteSessionPwd("");
    } catch {
      setDeleteSessionError("Erro ao verificar senha.");
    } finally {
      setDeleteSessionLoading(false);
    }
  };

  const handleConcludeSession = (sessionId: string, status: "aprovado" | "reprovado") => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId ? { ...s, status, concludedAt: new Date().toISOString() } : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleEmitLaudo = (sessionId: string) => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId ? { ...s, status: "laudo_emitido" as const, laudoEmittedAt: new Date().toISOString() } : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleSavePng = (sessionId: string) => {
    const session = analysisSessions.find(s => s.id === sessionId);
    const formula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
    if (!session || !formula || session.runs.length === 0) return;
    const std = formulaStandards.find(s => s.formulaId === session.formulaId) ?? null;
    const dataUrl = buildChromatogramPng(session, formula, std);
    if (!dataUrl) return;
    // Download
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${session.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_cromatograma.png`;
    link.click();
    // Save to library
    const img: HplcSavedImage = {
      id: uid(), sessionId: session.id, sessionName: session.name,
      formulaName: formula.name, createdAt: new Date().toISOString(),
      imageData: dataUrl, notes: "",
    };
    setSavedImages(imgs => { const u = [...imgs, img]; saveSavedImages(u); return u; });
  };

  const handleDeleteSavedImage = (imgId: string) => {
    setSavedImages(imgs => { const u = imgs.filter(i => i.id !== imgId); saveSavedImages(u); return u; });
  };

  const handleSaveStandard = (formulaId: string, entries: StandardEntry[], notes: string) => {
    const std: FormulaStandard = { formulaId, entries, notes, savedAt: new Date().toISOString() };
    setFormulaStandards(ss => {
      const updated = [...ss.filter(s => s.formulaId !== formulaId), std];
      saveFormulaStandards(updated);
      return updated;
    });
  };

  const handleDeleteStandard = (formulaId: string) => {
    setFormulaStandards(ss => { const u = ss.filter(s => s.formulaId !== formulaId); saveFormulaStandards(u); return u; });
  };

  const addCompoundAsPeak = (compound: ActiveCompound) => {
    setPeaks(ps => [...ps, {
      id: uid(),
      name: compound.name,
      peakType: "BB",
      grp: "",
      retentionTime: compound.expectedRT,
      height: 200,
      width: compound.typicalWidth,
      asymmetry: compound.typicalAsym,
      amtPerArea: compound.amtPerArea,
      amount: 0,
      manualArea: 0,
    }]);
    setPage("chromatogram");
    markDirty();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const MONO: React.CSSProperties = { fontFamily: "Courier New, monospace" };

  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", padding: "12px 8px" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="no-print max-w-[1160px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        <FlaskConical className="h-5 w-5 text-blue-700" />
        <span style={{ ...MONO, fontWeight: "bold", fontSize: 13 }}>Simulador HPLC — Agilent ChemStation</span>
        <div className="flex-1" />
        <div style={{ display: "flex", border: "1px solid #bbb", borderRadius: 4, overflow: "hidden" }}>
          {(([
            ["painel", "Painel", LayoutDashboard, false],
            ["chromatogram", "Cromatograma", BarChart3, false],
            ["ativos", "Ativos", Database, false],
            ["lotes", "Lotes", Layers, false],
            ["analise", "Análise", FlaskConical, false],
            ["report", "Relatório", FileText, false],
            ["usuarios", "Usuários", Users, true],
          ] as [PageMode, string, React.ElementType, boolean][]).filter(([,, , adminOnly]) => !adminOnly || isAdmin)).map(([mode, label, Icon], idx) => (
            <button key={mode} onClick={() => {
              setPage(mode);
              if (mode === "usuarios") fetchUsers();
            }} style={{
              ...MONO, fontSize: 11, padding: "4px 12px", cursor: "pointer",
              background: page === mode ? "#1d4ed8" : "#fff",
              color: page === mode ? "#fff" : "#333",
              border: "none", borderLeft: idx !== 0 ? "1px solid #bbb" : "none",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <Icon style={{ width: 13, height: 13 }} /> {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowControls(v => !v)}>
          <Settings className="h-3.5 w-3.5" /> {showControls ? "Ocultar" : "Controles"}
        </Button>

        {/* ── Confirm / saved feedback ──────────────────────────────────── */}
        {isDirty && (
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white shadow-md"
            onClick={handleConfirm}
          >
            <Check className="h-3.5 w-3.5" /> Confirmar alterações
          </Button>
        )}
        {confirmed && !isDirty && (
          <span className="flex items-center gap-1 text-xs text-green-700 font-medium px-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
          </span>
        )}

        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </Button>
        {user && (
          <div className="flex items-center gap-2 border-l border-gray-300 pl-3 ml-1">
            <span style={{ ...MONO, fontSize: 11, color: "#444" }}>{user.displayName}</span>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={async () => { await logout(); navigate("/login"); }}>
              <LogOut className="h-3.5 w-3.5" /> Sair
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-[1160px] mx-auto flex gap-3 items-start">

        {/* ── LEFT: controls ───────────────────────────────────────────────── */}
        {showControls && (
          <div className="no-print w-60 flex-shrink-0 space-y-3" style={{ maxHeight: "calc(100vh - 80px)", overflowY: "auto", paddingRight: 2 }}>
            {page === "chromatogram" && (
              <>
                {/* Sample Info — all fields including dataFile */}
                <ControlBox title="Sample Info">
                  {/* ── Quick-fill from active compound bank ── */}
                  {activeCompounds.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-blue-100">
                      <label className="text-xs font-mono font-bold text-blue-700">
                        Buscar Ativo →
                      </label>
                      <select
                        defaultValue=""
                        onChange={e => {
                          const c = activeCompounds.find(ac => ac.id === e.target.value);
                          if (!c) return;
                          setSample(s => ({ ...s, sampleName: c.name, acqMethod: c.method || s.acqMethod }));
                          setDetector(d => ({ ...d, sigWavelength: c.wavelength }));
                          setCalib(cb => ({ ...cb, compoundName: c.name, expRT: c.expectedRT }));
                          prevCalibNameRef.current = c.name;
                          // Update the matching peak (by name or the first peak) with compound parameters
                          setPeaks(ps => {
                            const idx = ps.findIndex(p => p.name === c.name || p.name === calib.compoundName);
                            if (idx === -1 && ps.length === 0) return ps;
                            const target = idx >= 0 ? idx : 0;
                            return ps.map((p, i) => i === target
                              ? { ...p, name: c.name, retentionTime: c.expectedRT, width: c.typicalWidth, asymmetry: c.typicalAsym }
                              : p
                            );
                          });
                          markDirty();
                          e.target.value = "";
                        }}
                        className="w-full h-6 text-xs font-mono border border-input rounded px-1 bg-background mt-0.5"
                      >
                        <option value="">— selecionar composto —</option>
                        {activeCompounds.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} (λ={c.wavelength}nm, TR={c.expectedRT}min)
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5" style={{ fontSize: 9 }}>
                        Preenche Sample Name, λ, TR esperado e método automaticamente.
                      </p>
                    </div>
                  )}
                  {([
                    ["dataFile", "Data File (caminho)"],
                    ["sampleName", "Sample Name"],
                    ["acqOperator", "Acq. Operator"],
                    ["seqLine", "Seq. Line"],
                    ["acqInstrument", "Acq. Instrument"],
                    ["location", "Location"],
                    ["injectionDate", "Injection Date"],
                    ["inj", "Inj #"],
                    ["injVolume", "Inj Volume"],
                    ["acqMethod", "Acq. Method"],
                    ["lastChanged1", "Last changed (Acq.)"],
                    ["analysisMethod", "Analysis Method"],
                    ["lastChanged2", "Last changed (Ana.)"],
                  ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                    <SmallField key={k} label={label} value={sample[k]} onChange={sField(k)} />
                  ))}
                </ControlBox>

                {/* Detector */}
                <ControlBox title="Detector / Sinal">
                  <SmallField label="Signal Name (ex: DAD1 A)" value={detector.signalName} onChange={dField("signalName")} />
                  <SmallField label="Sig Wavelength (nm)" value={String(detector.sigWavelength)} onChange={dField("sigWavelength")} type="number" />
                  <SmallField label="Sig Bandwidth" value={String(detector.sigBandwidth)} onChange={dField("sigBandwidth")} type="number" />
                  <SmallField label="Ref Wavelength (nm)" value={String(detector.refWavelength)} onChange={dField("refWavelength")} type="number" />
                  <SmallField label="Ref Bandwidth" value={String(detector.refBandwidth)} onChange={dField("refBandwidth")} type="number" />
                  <SmallField label="Run Time (min)" value={String(detector.runTime)} onChange={dField("runTime")} type="number" />
                </ControlBox>

                {/* Ext. Std. Report meta — sorted by, calib date, multiplier, dilution */}
                <ControlBox title="Ext. Std. Report — Meta">
                  <SmallField label="Sorted By" value={calib.sortedBy} onChange={cField("sortedBy")} />
                  <SmallField label="Calib. Data Modified" value={calib.calibDataModified} onChange={cField("calibDataModified")} />
                  <SmallField label="Multiplier" value={calib.multiplier} onChange={cField("multiplier")} />
                  <SmallField label="Dilution" value={calib.dilution} onChange={cField("dilution")} />
                </ControlBox>

                {/* Peaks */}
                <ControlBox title="Picos" extra={
                  <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={addPeak}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                }>
                  <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 4 }}>
                    Clique em ⚙ para editar · arraste no gráfico para mover.
                  </p>
                  {peakStats.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 group rounded px-1 py-0.5 hover:bg-gray-50">
                      <span style={{ ...MONO, fontSize: 9.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.retentionTime.toFixed(3)} {p.name ? `(${p.name})` : "—"}
                        {p.manualArea > 0
                          ? <span style={{ color: "#1d4ed8" }}> ✎{p.manualArea.toFixed(2)}</span>
                          : <span style={{ color: "#888" }}> ~{p.computedArea.toFixed(1)}</span>}
                      </span>
                      <PeakEditorDialog peak={p} onSave={savePeak}>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                          <Settings className="h-3 w-3" />
                        </Button>
                      </PeakEditorDialog>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-red-500"
                        onClick={() => removePeak(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* ── Standard reference overlay toggle ── */}
                  <div className="mt-2 pt-2 border-t border-orange-100">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showStdPeak}
                        onChange={e => setShowStdPeak(e.target.checked)}
                        className="h-3 w-3 accent-orange-500"
                      />
                      <span className="text-xs font-mono font-bold text-orange-600">Mostrar Padrão</span>
                    </label>
                    {showStdPeak && standards.length === 0 && (
                      <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 4 }}>
                        Adicione padrões de calibração na aba Relatório → Padrões de Calibração.
                      </p>
                    )}
                    {stdPeakInfo && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
                        <div style={{ color: "#f97316", fontWeight: "bold" }}>── Padrão Nível {stdPeakInfo.level}/{stdPeakInfo.total} ──</div>
                        <div>Amount: <b>{stdPeakInfo.midStd.amount.toFixed(3)} µg/mL</b></div>
                        <div>Área std: <b>{stdPeakInfo.midStd.area.toFixed(3)} mAU·s</b></div>
                        <div>Altura simulada: {stdPeakInfo.stdHeight.toFixed(1)} mAU</div>
                        <div>TR: {stdPeakInfo.namedPeak.retentionTime.toFixed(3)} min</div>
                        {(() => {
                          const samplePeak = peakStats.find(p => p.name === calib.compoundName) ?? peakStats.find(p => p.name);
                          if (!samplePeak) return null;
                          const sampleArea = samplePeak.displayArea;
                          const ratio = stdPeakInfo.midStd.area > 0 ? sampleArea / stdPeakInfo.midStd.area : null;
                          const conc = ratio !== null ? ratio * stdPeakInfo.midStd.amount : null;
                          return (
                            <>
                              <div style={{ marginTop: 4, borderTop: "1px solid #e5e7eb", paddingTop: 4 }}>
                                <div>Área amostra: {sampleArea.toFixed(3)} mAU·s</div>
                                <div>Razão A/Aₛₜ𝒹: {ratio !== null ? ratio.toFixed(4) : "—"}</div>
                                <div style={{ color: "#166534", fontWeight: "bold" }}>
                                  Conc. calculada: {conc !== null ? conc.toFixed(3) + " µg/mL" : "—"}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </ControlBox>
              </>
            )}

            {page === "report" && (
              <>
                {/* Calibration curve info */}
                <ControlBox title="Calibration Info">
                  <SmallField label="Compound Name" value={calib.compoundName} onChange={cField("compoundName")} />
                  <SmallField label="Expected RT (min)" value={String(calib.expRT)} onChange={cField("expRT")} type="number" />
                  <SmallField label="Calib. Data Modified" value={calib.calibDataModified} onChange={cField("calibDataModified")} />
                  <SmallField label="Curve Type" value={calib.curveType} onChange={cField("curveType")} />
                  <SmallField label="Origin" value={calib.origin} onChange={cField("origin")} />
                  <SmallField label="Weight" value={calib.weight} onChange={cField("weight")} />
                  <SmallField label="Sorted By" value={calib.sortedBy} onChange={cField("sortedBy")} />
                  <SmallField label="Multiplier" value={calib.multiplier} onChange={cField("multiplier")} />
                  <SmallField label="Dilution" value={calib.dilution} onChange={cField("dilution")} />
                </ControlBox>

                {/* Standards */}
                <ControlBox title="Padrões de Calibração" extra={
                  <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={addStandard}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                }>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 4 }}>
                    Amount [ug/ml] / Area [mAU*s]
                  </div>
                  {[...standards].sort((a, b) => a.amount - b.amount).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1 group mb-1.5">
                      <span style={{ ...MONO, fontSize: 9, color: "#555", width: 14 }}>{i + 1}</span>
                      <div className="flex flex-col gap-0.5 flex-1">
                        <Input type="number" step="0.00001" value={s.amount}
                          onChange={e => updateStandard(s.id, "amount", parseFloat(e.target.value) || 0)}
                          className="h-5 text-xs font-mono px-1" placeholder="Amount (ug/ml)" />
                        <Input type="number" step="0.00001" value={s.area}
                          onChange={e => updateStandard(s.id, "area", parseFloat(e.target.value) || 0)}
                          className="h-5 text-xs font-mono px-1" placeholder="Area (mAU*s)" />
                      </div>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-red-500"
                        onClick={() => removeStandard(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </ControlBox>
              </>
            )}

            {page === "ativos" && (
              <>
                <ControlBox title="Banco de Ativos">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                    Defina compostos e propriedades HPLC. "Auto-identificar" nomeia picos cujo λ e TR coincidem.
                  </div>
                  <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2" onClick={addActiveCompound}>
                    <Plus className="h-3 w-3" /> Adicionar Ativo
                  </Button>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={autoIdentifyPeaks}>
                    <Zap className="h-3 w-3" /> Auto-identificar Picos
                  </Button>
                  {lastIdentified.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 9, color: "#166534", fontFamily: "Courier New, monospace" }}>
                      Identificados: {lastIdentified.join(", ")}
                    </div>
                  )}
                </ControlBox>
                <ControlBox title="Detector Atual">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555" }}>
                    λ sinal: <b>{detector.sigWavelength} nm</b><br />
                    Correspondência por: λ ± tolerância E TR ± tolerância
                  </div>
                </ControlBox>
              </>
            )}

            {page === "analise" && (() => {
              const session = analysisSessions.find(s => s.id === currentSessionId) ?? null;
              const sessionFormula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
              const std = sessionFormula ? formulaStandards.find(s => s.formulaId === sessionFormula.id) ?? null : null;
              return (
                <>
                  <ControlBox title="Sessões de Análise">
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                      Cada sessão registra até 5 injeções independentes com cromatogramas sobrepostos e cálculo de teor (%).
                    </div>
                    {formulas.length === 0 ? (
                      <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace" }}>
                        Salve uma fórmula no menu "Lotes" antes de criar uma sessão de análise.
                      </div>
                    ) : (
                      <NewSessionDialog formulas={formulas} onSave={handleCreateSession}>
                        <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2">
                          <Plus className="h-3 w-3" /> Nova Sessão
                        </Button>
                      </NewSessionDialog>
                    )}
                    <div className="space-y-1 mt-1">
                      {analysisSessions.length === 0 && (
                        <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "6px 0" }}>
                          Nenhuma sessão criada
                        </div>
                      )}
                      {analysisSessions.map(s => {
                        const fName = formulas.find(f => f.id === s.formulaId)?.name ?? "—";
                        const isActive = s.id === currentSessionId;
                        return (
                          <div key={s.id} onClick={() => setCurrentSessionId(s.id)} style={{
                            border: isActive ? "1px solid #1d4ed8" : "1px solid #ddd",
                            borderRadius: 4, padding: "5px 7px", cursor: "pointer",
                            background: isActive ? "#eff6ff" : "#fafafa",
                          }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", color: isActive ? "#1d4ed8" : "#333" }}>{s.name}</div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", marginTop: 1 }}>{fName} · {s.runs.length}/5 corridas</div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa" }}>{new Date(s.createdAt).toLocaleDateString("pt-BR")}</div>
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="destructive" className="h-5 text-xs px-1.5 flex-1 opacity-70"
                                onClick={e => { e.stopPropagation(); openDeleteSessionDialog(s.id, s.name); }}>
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Excluir
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ControlBox>

                  {session && sessionFormula && (
                    <>
                      <ControlBox title={`Corridas — ${session.name}`}>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6 }}>
                          Configure os picos no cromatograma e clique "Registrar" para salvar a corrida atual.
                        </div>
                        <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2"
                          disabled={session.runs.length >= 5}
                          onClick={handleRegisterRun}>
                          <Download className="h-3 w-3" /> Registrar Corrida {session.runs.length + 1}
                        </Button>
                        {session.runs.length >= 5 && (
                          <div style={{ fontSize: 9, color: "#ea580c", fontFamily: "Courier New, monospace", textAlign: "center" }}>Limite de 5 corridas atingido</div>
                        )}
                        <div className="space-y-1 mt-1">
                          {session.runs.map(r => (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", border: "1px solid #eee", borderRadius: 4, background: "#fff" }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: r.color }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold" }}>{r.label}</div>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#999" }}>{new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                                onClick={() => handleDeleteRun(session.id, r.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          {session.runs.length === 0 && (
                            <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "6px 0" }}>Nenhuma corrida registrada</div>
                          )}
                        </div>
                      </ControlBox>

                      <ControlBox title="Padrão de Referência">
                        {std ? (
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 9 }}>
                            <div style={{ color: "#166534", fontWeight: "bold", marginBottom: 4 }}>✓ Padrão salvo</div>
                            {std.entries.map(e => (
                              <div key={e.compoundId} style={{ marginBottom: 3, padding: "3px 5px", background: "#f0fdf4", borderRadius: 3, border: "1px solid #bbf7d0" }}>
                                <div style={{ fontWeight: "bold" }}>{e.compoundName}</div>
                                <div style={{ color: "#555" }}>Nominal: {e.nominalConc} {e.units}</div>
                                {e.stdArea > 0 && <div style={{ color: "#555" }}>Std área: {e.stdArea} / conc: {e.stdConc}</div>}
                              </div>
                            ))}
                            <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                              <SetStandardDialog compounds={sessionFormula.activeCompounds} existing={std} onSave={(entries, notes) => handleSaveStandard(sessionFormula.id, entries, notes)}>
                                <Button size="sm" variant="outline" className="h-5 text-xs px-1.5 flex-1">Editar</Button>
                              </SetStandardDialog>
                              <Button size="sm" variant="destructive" className="h-5 text-xs px-1.5 flex-1 opacity-70" onClick={() => handleDeleteStandard(sessionFormula.id)}>
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Remover
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#ea580c", marginBottom: 6 }}>
                              ⚠ Sem padrão salvo. Informe os valores para calcular o teor (%).
                            </div>
                            <SetStandardDialog compounds={sessionFormula.activeCompounds} existing={null} onSave={(entries, notes) => handleSaveStandard(sessionFormula.id, entries, notes)}>
                              <Button size="sm" className="w-full h-7 text-xs gap-1">
                                <Plus className="h-3 w-3" /> Definir Padrão
                              </Button>
                            </SetStandardDialog>
                          </div>
                        )}
                      </ControlBox>
                    </>
                  )}
                </>
              );
            })()}

            {page === "lotes" && (
              <>
                <ControlBox title="Fórmulas Salvas">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                    Salve o método atual como fórmula. Depois registre lotes analisados para comparar resultados.
                  </div>
                  <SaveFormulaDialog onSave={handleSaveFormula}>
                    <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2">
                      <Plus className="h-3 w-3" /> Salvar Fórmula Atual
                    </Button>
                  </SaveFormulaDialog>
                  <div className="space-y-1.5 mt-1">
                    {formulas.length === 0 && (
                      <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "8px 0" }}>
                        Nenhuma fórmula salva
                      </div>
                    )}
                    {formulas.map(f => {
                      const lotCount = lots.filter(l => l.formulaId === f.id).length;
                      const isSelected = selectedFormulaId === f.id;
                      return (
                        <div key={f.id} onClick={() => setSelectedFormulaId(f.id)} style={{
                          border: isSelected ? "1px solid #1d4ed8" : "1px solid #ddd",
                          borderRadius: 4, padding: "5px 7px", cursor: "pointer",
                          background: isSelected ? "#eff6ff" : "#fafafa",
                        }}>
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", color: isSelected ? "#1d4ed8" : "#333" }}>{f.name}</div>
                          {f.description && <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", marginTop: 1 }}>{f.description}</div>}
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#999", marginTop: 2 }}>
                            {lotCount} lote{lotCount !== 1 ? "s" : ""} · {new Date(f.createdAt).toLocaleDateString("pt-BR")}
                          </div>
                          <div className="flex gap-1 mt-1.5">
                            <Button size="sm" variant="outline" className="h-5 text-xs px-1.5 flex-1"
                              onClick={e => { e.stopPropagation(); handleLoadFormula(f); }}>
                              <Download className="h-2.5 w-2.5 mr-0.5" /> Carregar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                              onClick={e => { e.stopPropagation(); handleDeleteFormula(f.id); }}>
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ControlBox>
              </>
            )}
          </div>
        )}

        {/* ── RIGHT: Agilent report paper ──────────────────────────────────── */}
        <div style={{ flex: 1, background: "#fff", border: "1px solid #bbb", boxShadow: "0 2px 8px rgba(0,0,0,.18)", padding: "28px 32px 20px", minWidth: 0, ...MONO, fontSize: 11.5 }}>

          {/* ── PAINEL / DASHBOARD PAGE ───────────────────────────────────── */}
          {page === "painel" && (() => {
            const total = analysisSessions.length;
            const emAndamento = analysisSessions.filter(s => s.status === "em_andamento").length;
            const aprovados = analysisSessions.filter(s => s.status === "aprovado").length;
            const reprovados = analysisSessions.filter(s => s.status === "reprovado").length;
            const laudos = analysisSessions.filter(s => s.status === "laudo_emitido").length;
            const imgCount = savedImages.length;

            const statusLabel: Record<string, string> = {
              em_andamento: "Em Análise",
              aprovado: "Aprovado",
              reprovado: "Reprovado",
              laudo_emitido: "Laudo Emitido",
            };
            const statusBg: Record<string, string> = {
              em_andamento: "#dbeafe",
              aprovado: "#dcfce7",
              reprovado: "#fee2e2",
              laudo_emitido: "#f3e8ff",
            };
            const statusColor: Record<string, string> = {
              em_andamento: "#1d4ed8",
              aprovado: "#16a34a",
              reprovado: "#dc2626",
              laudo_emitido: "#7c3aed",
            };

            return (
              <div style={{ fontFamily: "Courier New, monospace" }}>
                {/* Header */}
                <div style={{ fontWeight: "bold", fontSize: 15, marginBottom: 18, borderBottom: "1px solid #bbb", paddingBottom: 10, color: "#1d4ed8" }}>
                  Painel de Análises
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
                  {[
                    { label: "Total", value: total, bg: "#f8fafc", color: "#334155", Icon: Activity },
                    { label: "Em Análise", value: emAndamento, bg: "#dbeafe", color: "#1d4ed8", Icon: FlaskConical },
                    { label: "Aprovados", value: aprovados, bg: "#dcfce7", color: "#16a34a", Icon: ClipboardCheck },
                    { label: "Reprovados", value: reprovados, bg: "#fee2e2", color: "#dc2626", Icon: ClipboardX },
                    { label: "Laudos", value: laudos, bg: "#f3e8ff", color: "#7c3aed", Icon: ScrollText },
                  ].map(({ label, value, bg, color, Icon }) => (
                    <div key={label} style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 8, padding: "14px 12px", textAlign: "center" }}>
                      <Icon style={{ width: 20, height: 20, color, margin: "0 auto 6px" }} />
                      <div style={{ fontSize: 22, fontWeight: "bold", color, lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: 9, color: "#666", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Imagens salvas banner */}
                <div style={{ background: "#fafaf9", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
                  <ImageIcon style={{ width: 16, height: 16, color: "#64748b" }} />
                  <span style={{ fontSize: 11, color: "#555" }}>
                    <b>{imgCount}</b> imagem{imgCount !== 1 ? "ns" : ""} de cromatograma salva{imgCount !== 1 ? "s" : ""} e disponíveis para anexar no Protocolo de Estabilidade.
                  </span>
                  {imgCount > 0 && (
                    <button style={{ marginLeft: "auto", fontSize: 10, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                      onClick={() => { if (confirm(`Excluir todas as ${imgCount} imagens salvas?`)) { setSavedImages([]); saveSavedImages([]); } }}>
                      Limpar biblioteca
                    </button>
                  )}
                </div>

                {/* Session list */}
                {analysisSessions.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: "40px 0" }}>
                    Nenhuma sessão de análise criada ainda.<br />
                    <span style={{ fontSize: 10 }}>Vá para a aba "Análise" e crie uma nova sessão.</span>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        {["Sessão", "Fórmula", "Corridas", "Status", "Data", "Ações"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: "bold", color: "#334155", borderBottom: "1px solid #cbd5e1", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...analysisSessions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((s, i) => {
                        const formula = formulas.find(f => f.id === s.formulaId);
                        const bg = i % 2 === 0 ? "#fff" : "#f9fafb";
                        const goToSession = () => { setCurrentSessionId(s.id); setPage("analise"); };
                        return (
                          <tr key={s.id}
                            onClick={goToSession}
                            style={{ background: bg, borderBottom: "1px solid #f0f0f0", cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = bg)}>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontWeight: "bold", color: "#1d4ed8", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
                                {s.name}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#475569" }}>{formula?.name ?? "—"}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>
                                {s.runs.length}/5
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ background: statusBg[s.status] ?? "#f1f5f9", color: statusColor[s.status] ?? "#334155", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold", whiteSpace: "nowrap" }}>
                                {statusLabel[s.status] ?? s.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap" }}>
                              {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                            </td>
                            <td style={{ padding: "8px 6px" }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {/* Go to analysis */}
                                <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #1d4ed8", borderRadius: 4, background: "#eff6ff", cursor: "pointer", color: "#1d4ed8", fontWeight: "bold" }}
                                  onClick={goToSession}>
                                  → Abrir
                                </button>

                                {/* Conclude */}
                                {s.status === "em_andamento" && s.runs.length > 0 && (
                                  <>
                                    <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #16a34a", borderRadius: 4, background: "#dcfce7", cursor: "pointer", color: "#16a34a" }}
                                      onClick={() => { if (confirm(`Marcar "${s.name}" como APROVADO?`)) handleConcludeSession(s.id, "aprovado"); }}>
                                      <ClipboardCheck style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Aprovar
                                    </button>
                                    <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #dc2626", borderRadius: 4, background: "#fee2e2", cursor: "pointer", color: "#dc2626" }}
                                      onClick={() => { if (confirm(`Marcar "${s.name}" como REPROVADO?`)) handleConcludeSession(s.id, "reprovado"); }}>
                                      <ClipboardX style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Reprovar
                                    </button>
                                  </>
                                )}

                                {/* Emit Laudo */}
                                {(s.status === "aprovado" || s.status === "reprovado") && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #7c3aed", borderRadius: 4, background: "#f3e8ff", cursor: "pointer", color: "#7c3aed" }}
                                    onClick={() => { if (confirm(`Emitir laudo para "${s.name}"?`)) handleEmitLaudo(s.id); }}>
                                    <ScrollText style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Emitir Laudo
                                  </button>
                                )}

                                {/* Save PNG */}
                                {s.runs.length > 0 && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #0284c7", borderRadius: 4, background: "#e0f2fe", cursor: "pointer", color: "#0284c7" }}
                                    onClick={() => handleSavePng(s.id)}>
                                    <ImageDown style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Salvar PNG
                                  </button>
                                )}

                                {/* Delete with password */}
                                <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #dc2626", borderRadius: 4, background: "#fee2e2", cursor: "pointer", color: "#dc2626" }}
                                  onClick={() => openDeleteSessionDialog(s.id, s.name)}>
                                  <Trash2 style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Saved images gallery */}
                {savedImages.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ fontWeight: "bold", fontSize: 12, marginBottom: 12, borderBottom: "1px solid #bbb", paddingBottom: 6, color: "#334155" }}>
                      Biblioteca de Imagens — disponíveis para o Protocolo de Estabilidade
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {savedImages.map(img => (
                        <div key={img.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                          <img src={img.imageData} alt={img.sessionName} style={{ width: "100%", height: 120, objectFit: "cover", borderBottom: "1px solid #e2e8f0", display: "block" }} />
                          <div style={{ padding: "6px 8px" }}>
                            <div style={{ fontSize: 9, fontWeight: "bold", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.sessionName}</div>
                            <div style={{ fontSize: 8, color: "#64748b" }}>{img.formulaName} · {new Date(img.createdAt).toLocaleDateString("pt-BR")}</div>
                            <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                              <a href={img.imageData} download={`${img.sessionName}.png`} style={{ flex: 1, fontSize: 8, padding: "2px 0", border: "1px solid #0284c7", borderRadius: 3, background: "#e0f2fe", color: "#0284c7", textAlign: "center", textDecoration: "none", display: "block" }}>
                                Download
                              </a>
                              <button style={{ fontSize: 8, padding: "2px 6px", border: "1px solid #dc2626", borderRadius: 3, background: "#fee2e2", cursor: "pointer", color: "#dc2626" }}
                                onClick={() => { if (confirm("Excluir esta imagem?")) handleDeleteSavedImage(img.id); }}>
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── CHROMATOGRAM PAGE ─────────────────────────────────────────── */}
          {page === "chromatogram" && (
            <>
              {/* Data File + Sample Name */}
              <div style={{ marginBottom: 6 }}>
                <div>Data File {sample.dataFile}</div>
                <div>Sample Name: {sample.sampleName}</div>
              </div>

              <Div />
              {/* Operator block */}
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Acq. Operator   : " + sample.acqOperator.padEnd(28) + "Seq. Line : " + sample.seqLine}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Acq. Instrument : " + sample.acqInstrument.padEnd(28) + "Location  : " + sample.location}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Injection Date  : " + sample.injectionDate.padEnd(36) + "Inj :  " + sample.inj}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    " + " ".repeat(55) + "Inj Volume : " + sample.injVolume}
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {"    Acq. Method     : " + sample.acqMethod}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{"    Last changed    : " + sample.lastChanged1}</div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{"    Analysis Method : " + sample.analysisMethod}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{"    Last changed    : " + sample.lastChanged2}</div>
              <div style={{ whiteSpace: "pre" }}>{"                      (modified after loading)"}</div>
              <Div />

              {/* Chromatogram chart */}
              <div
                ref={chartContainerRef}
                style={{ marginTop: 14, marginBottom: 6, position: "relative", cursor: draggingPeakId ? "ew-resize" : "crosshair" }}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseUp}
              >
                <div style={{ fontSize: 11, marginBottom: 2 }}>mAU</div>
                <div style={{ fontSize: 10, color: "#555", position: "absolute", top: 0, right: 0 }}>
                  Signal 1: {signalLabel}
                </div>
                {/* Drag hint tooltip */}
                {!draggingPeakId && peakStats.some(p => p.name) && (
                  <div style={{ position: "absolute", bottom: 28, left: 54, fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", pointerEvents: "none" }}>
                    ← arraste o pico para ajustar o TR →
                  </div>
                )}
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={mergedChrom} margin={{ top: 22, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#e2e2e2" />
                    <XAxis dataKey="time" type="number" domain={[0, detector.runTime]} ticks={xTicks}
                      tickFormatter={v => v.toFixed(1)}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                      label={{ value: "min", position: "right", offset: 8, fontFamily: "Courier New, monospace", fontSize: 11 }}
                      axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} />
                    <YAxis domain={[0, yMax]} ticks={yTicks}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                      axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} width={46} />
                    <Tooltip content={<ChromTooltip />} />

                    {/* Integration boundary lines — dashed verticals at peak start/end */}
                    {peakStats.filter(p => p.name).flatMap(p => {
                      const lo = parseFloat((p.retentionTime - 3.8 * p.width).toFixed(4));
                      const hi = parseFloat((p.retentionTime + 3.8 * p.width * p.asymmetry).toFixed(4));
                      return [
                        <ReferenceLine key={`il-${p.id}`} x={lo} stroke="#999" strokeWidth={0.8} strokeDasharray="3 2" />,
                        <ReferenceLine key={`ir-${p.id}`} x={hi} stroke="#999" strokeWidth={0.8} strokeDasharray="3 2" />,
                      ];
                    })}

                    {/* Name + RT label above each named peak; highlighted when dragging */}
                    {peakStats.filter(p => p.name).map(p => (
                      <ReferenceLine key={`rt-${p.id}`} x={p.retentionTime} stroke="none"
                        label={(props: { viewBox?: { x: number; y: number } }) => (
                          <PeakLabel
                            viewBox={props.viewBox}
                            rt={p.retentionTime}
                            name={p.name}
                            dragging={draggingPeakId === p.id}
                          />
                        )} />
                    ))}

                    {/* Standard reference peak — dashed orange line */}
                    {stdPeakInfo && (
                      <Line
                        type="linear"
                        dataKey="stdSignal"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        dot={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                    )}

                    {/* Standard RT label */}
                    {stdPeakInfo && (
                      <ReferenceLine
                        x={stdPeakInfo.namedPeak.retentionTime}
                        stroke="#f97316"
                        strokeWidth={0.8}
                        strokeDasharray="3 2"
                        label={(props: { viewBox?: { x: number; y: number } }) => {
                          if (!props.viewBox) return <g />;
                          const { x, y } = props.viewBox;
                          return (
                            <text x={x - 3} y={y + 13} textAnchor="end"
                              style={{ fontFamily: "Courier New, monospace", fontSize: 9, fill: "#f97316", fontWeight: "bold", pointerEvents: "none" }}>
                              STD {stdPeakInfo.midStd.amount.toFixed(0)}µg/mL
                            </text>
                          );
                        }}
                      />
                    )}

                    {/* Chromatogram signal — thin blue line, no dots */}
                    <Line
                      type="linear"
                      dataKey="signal"
                      stroke="#1560bd"
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Legend when std peak is visible */}
                {stdPeakInfo && (
                  <div style={{ display: "flex", gap: 16, fontSize: 9, fontFamily: "Courier New, monospace", marginTop: 4, paddingLeft: 54 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 20, height: 2, background: "#1560bd" }} /> Amostra
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 20, height: 2, background: "#f97316", borderTop: "2px dashed #f97316" }} /> Padrão (Nível {stdPeakInfo.level})
                    </span>
                  </div>
                )}
              </div>

              {/* External Standard Report */}
              <div style={{ marginTop: 16 }}>
                <SectionTitle title="External Standard Report" />
                <div style={{ marginTop: 6 }}>
                  <div>{"    Sorted By             :      " + calib.sortedBy}</div>
                  <div>{"    Calib. Data Modified :       " + calib.calibDataModified}</div>
                  <div>{"    Multiplier:                   :      " + calib.multiplier}</div>
                  <div>{"    Dilution:                     :      " + calib.dilution}</div>
                  <div>{"    Use Multiplier & Dilution Factor with ISTDs"}</div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div>{"    Signal 1: " + signalLabel}</div>
                </div>

                {/* Peak table */}
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <div style={{ whiteSpace: "pre" }}>{"    RetTime Type      Area     Amt/Area    Amount   Grp    Name"}</div>
                  <div style={{ whiteSpace: "pre" }}>{"     [min]          [mAU*s]               [ug/ml]"}</div>
                  <div style={{ whiteSpace: "pre" }}>{"    " + "-".repeat(65)}</div>
                  {peakStats.map(p => {
                    const area = p.displayArea;
                    const amtPerArea = p.amtPerArea > 0 ? p.amtPerArea : (area > 0 && p.amount > 0 ? p.amount / area : 0);
                    const rt = p.retentionTime.toFixed(3).padStart(7);
                    const type = p.peakType.padEnd(6);
                    const areaStr = fmtArea(area).padStart(12);
                    const aptStr = amtPerArea > 0 ? fmtSci2(amtPerArea, -2).padStart(12) : "".padStart(12);
                    const amtStr = p.amount > 0 ? p.amount.toFixed(5).padStart(12) : "".padStart(12);
                    const grpStr = (p.grp || "").padEnd(4);
                    const nameStr = p.name;
                    return (
                      <div key={p.id} style={{ whiteSpace: "pre" }}>
                        {"   " + rt + " " + type + " " + areaStr + " " + aptStr + " " + amtStr + " " + grpStr + "  " + nameStr}
                      </div>
                    );
                  })}
                  <div style={{ whiteSpace: "pre" }}>{"    "}</div>
                  <div style={{ whiteSpace: "pre" }}>
                    {"    Totals :                              " + "  " + totalAmount.toFixed(5)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── REPORT PAGE (Calibration) ──────────────────────────────────── */}
          {page === "report" && (
            <>
              {/* Method header */}
              <div style={{ marginBottom: 6 }}>
                <div>Method {sample.analysisMethod}</div>
              </div>

              <SectionTitle title="Calibration Table" />

              <div style={{ marginTop: 6 }}>
                <div>{"    Calib. Data Modified   :      " + calib.calibDataModified}</div>
                <div style={{ marginTop: 6 }}>
                  <div>{"    Curve Type             :      " + calib.curveType}</div>
                  <div>{"    Origin                 :      " + calib.origin}</div>
                  <div>{"    Weight                 :      " + calib.weight}</div>
                </div>
                <div style={{ marginTop: 8 }}>{"    Signal 1: " + signalLabel}</div>
              </div>

              {/* Calibration table */}
              <div style={{ marginTop: 10 }}>
                <div style={{ whiteSpace: "pre" }}>{"    RetTime    Lvl  Amount      Area     Amt/Area Ref Grp Name"}</div>
                <div style={{ whiteSpace: "pre" }}>{"     [min] Sig     [ug/ml]"}</div>
                <div style={{ whiteSpace: "pre" }}>{"    " + "-".repeat(65)}</div>
                {[...standards].sort((a, b) => a.amount - b.amount).map((s, i) => {
                  const amtPerArea = s.area > 0 ? s.amount / s.area : 0;
                  if (i === 0) {
                    return (
                      <div key={s.id} style={{ whiteSpace: "pre" }}>
                        {"    " + calib.expRT.toFixed(3).padStart(7) + " 1 " + (i + 1).toString().padStart(2) + "  " +
                          s.amount.toFixed(5).padStart(12) + " " + s.area.toFixed(5).padStart(10) + " " + fmtSci2(amtPerArea, -2).padStart(12) + "         " + calib.compoundName}
                      </div>
                    );
                  }
                  return (
                    <div key={s.id} style={{ whiteSpace: "pre" }}>
                      {"              " + (i + 1).toString().padStart(2) + "  " +
                        s.amount.toFixed(5).padStart(12) + " " + s.area.toFixed(5).padStart(10) + " " + fmtSci2(amtPerArea, -2).padStart(12)}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 24 }}>
                <SectionTitle title="Calibration Curves" />
              </div>

              {/* Calibration curve chart + stats */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 8 }}>
                {/* Chart */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, marginBottom: 0 }}>Area</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={calibChartData} margin={{ top: 8, right: 16, left: 8, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#ccc" />
                      <XAxis dataKey="x" type="number" domain={[0, calibXMax]}
                        tickFormatter={v => v.toFixed(0)}
                        tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                        axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }}
                        label={{ value: "Amount[ug/ml]", position: "insideBottom", offset: -16, fontFamily: "Courier New, monospace", fontSize: 10 }} />
                      <YAxis type="number" domain={[0, calibYMax]}
                        tickFormatter={v => v.toFixed(0)}
                        tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                        axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }} width={52} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload as { x: number; pt?: number };
                        return (
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
                            <div>Amount: {d.x.toFixed(3)} ug/ml</div>
                            {d.pt !== undefined && <div>Area: {d.pt.toFixed(3)} mAU*s</div>}
                          </div>
                        );
                      }} />
                      {/* Dashed crosshairs */}
                      {standards.map(s => (
                        <ReferenceLine key={`vx-${s.id}`} x={s.amount} stroke="#aaa" strokeDasharray="4 3" strokeWidth={0.8} />
                      ))}
                      {standards.map(s => (
                        <ReferenceLine key={`hy-${s.id}`} y={s.area} stroke="#aaa" strokeDasharray="4 3" strokeWidth={0.8} />
                      ))}
                      {/* Regression line */}
                      <Line dataKey="reg" stroke="#333" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls legendType="none" />
                      {/* Actual points */}
                      <Line dataKey="pt" stroke="#333" strokeWidth={1}
                        dot={(props: { cx: number; cy: number; value?: number }) =>
                          props.value !== undefined
                            ? <circle key={`d${props.cx}`} cx={props.cx} cy={props.cy} r={4} fill="#fff" stroke="#333" strokeWidth={1.5} />
                            : <g key={`de${props.cx}`} />
                        }
                        activeDot={false} isAnimationActive={false} connectNulls={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Right: stats panel */}
                <div style={{ minWidth: 200, paddingTop: 20, fontSize: 11 }}>
                  <div>{calib.compoundName} at exp. RT: {calib.expRT.toFixed(3)}</div>
                  <div style={{ marginTop: 4 }}>{signalLabel}</div>
                  <div style={{ marginTop: 8 }}>{"Correlation:            " + reg.r.toFixed(5)}</div>
                  <div>{"Residual Std. Dev.:  " + reg.residStdDev.toFixed(5)}</div>
                  <div style={{ marginTop: 8 }}>{"Formula: y = mx + b"}</div>
                  <div style={{ paddingLeft: 16 }}>{"     m: " + reg.slope.toFixed(5)}</div>
                  <div style={{ paddingLeft: 16 }}>{"     b: " + reg.intercept.toFixed(5)}</div>
                  <div style={{ paddingLeft: 16 }}>{"     x: Amount"}</div>
                  <div style={{ paddingLeft: 16 }}>{"     y: Area"}</div>
                </div>
              </div>

              {/* Level markers on chart */}
              <div style={{ marginTop: 4, fontSize: 10, color: "#555", paddingLeft: 8 }}>
                {[...standards].sort((a, b) => a.amount - b.amount).map((s, i) => (
                  <span key={s.id} style={{ marginRight: 12 }}>{i + 1} = {s.amount.toFixed(0)} ug/ml</span>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <SectionTitle title="*** End of Report ***" />
              </div>
            </>
          )}

          {/* ── ATIVOS PAGE ───────────────────────────────────────────────── */}
          {page === "ativos" && (
            <div style={{ fontFamily: "Courier New, monospace" }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: "bold" }}>Banco de Compostos Ativos</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                  {activeCompounds.length} composto(s) — detector atual: λ={detector.sigWavelength} nm
                </div>
              </div>
              <Div />
              <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={addActiveCompound}>
                  <Plus className="h-3 w-3" /> Adicionar Ativo
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={autoIdentifyPeaks}>
                  <Zap className="h-3 w-3" /> Auto-identificar no Cromatograma
                </Button>
                {lastIdentified.length > 0 && (
                  <span style={{ fontSize: 10, color: "#166534", display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 style={{ width: 13, height: 13 }} />
                    {lastIdentified.length} pico(s) identificado(s): {lastIdentified.join(", ")}
                  </span>
                )}
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #333", background: "#f4f4f4" }}>
                      {["Composto", "λ (nm)", "±λ", "TR (min)", "±TR", "Amt/Area", "Unid.", "Spec Mín", "Spec Máx", "Método", "Notas", ""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontFamily: "Courier New, monospace", fontWeight: "bold", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCompounds.map((c, idx) => {
                      const wavMatch = Math.abs(c.wavelength - detector.sigWavelength) <= c.waveTol;
                      const peakMatch = peaks.find(p => Math.abs(p.retentionTime - c.expectedRT) <= c.rtTol && wavMatch);
                      const amount = peakMatch
                        ? parseFloat(((peakMatch.manualArea > 0 ? peakMatch.manualArea : computeArea(peakMatch)) * c.amtPerArea).toFixed(4))
                        : null;
                      const inSpec = amount !== null && c.specMin > 0 && c.specMax > 0
                        ? amount >= c.specMin && amount <= c.specMax
                        : null;
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #ddd", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "5px 8px", fontWeight: "bold" }}>{c.name}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center" }}>
                            <span style={{
                              background: wavMatch ? "#dcfce7" : "#f3f4f6",
                              color: wavMatch ? "#166534" : "#555",
                              padding: "1px 5px", borderRadius: 3, fontWeight: wavMatch ? "bold" : "normal"
                            }}>{c.wavelength}</span>
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "center", color: "#888" }}>±{c.waveTol}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center" }}>{c.expectedRT.toFixed(3)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center", color: "#888" }}>±{c.rtTol}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>{c.amtPerArea.toFixed(5)}</td>
                          <td style={{ padding: "5px 8px" }}>{c.units}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", color: c.specMin > 0 ? "#111" : "#bbb" }}>
                            {c.specMin > 0 ? c.specMin.toFixed(1) : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "right", color: c.specMax > 0 ? "#111" : "#bbb" }}>
                            {c.specMax > 0 ? c.specMax.toFixed(1) : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", color: "#666", fontSize: 10 }}>{c.method}</td>
                          <td style={{ padding: "5px 8px", color: "#888", fontSize: 9.5, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.notes}</td>
                          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {/* Status pill */}
                              {peakMatch ? (
                                <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: inSpec === null ? "#e0f2fe" : inSpec ? "#dcfce7" : "#fee2e2", color: inSpec === null ? "#0369a1" : inSpec ? "#166534" : "#b91c1c", fontWeight: "bold", whiteSpace: "nowrap" }}>
                                  {inSpec === null
                                    ? <><CheckCircle2 style={{ width: 10, height: 10 }} /> {amount?.toFixed(2)} {c.units}</>
                                    : inSpec
                                      ? <><CheckCircle2 style={{ width: 10, height: 10 }} /> {amount?.toFixed(2)} ✓</>
                                      : <><XCircle style={{ width: 10, height: 10 }} /> {amount?.toFixed(2)} ✗</>
                                  }
                                </span>
                              ) : (
                                <span style={{ fontSize: 9, color: "#aaa", whiteSpace: "nowrap" }}>sem pico</span>
                              )}
                              {/* Add to chrom button */}
                              <Button size="sm" variant="ghost" title="Adicionar ao cromatograma"
                                className="h-5 w-5 p-0 text-blue-600 hover:text-blue-800"
                                onClick={() => addCompoundAsPeak(c)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                              {/* Edit */}
                              <ActiveCompoundDialog compound={c} onSave={saveActiveCompound}>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-500">
                                  <Settings className="h-3 w-3" />
                                </Button>
                              </ActiveCompoundDialog>
                              {/* Delete */}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                                onClick={() => removeActiveCompound(c.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {activeCompounds.length === 0 && (
                <div style={{ textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: 12 }}>
                  Nenhum ativo cadastrado. Clique em "Adicionar Ativo" para começar.
                </div>
              )}

              <Div />
              <div style={{ marginTop: 12, fontSize: 10, color: "#666" }}>
                <b>Legenda:</b> λ destacado = detector atual dentro da tolerância · Status verde = pico encontrado e dentro da especificação · azul = pico encontrado, sem especificação · vermelho = fora da especificação · "sem pico" = nenhum pico no cromatograma corresponde (TR ± tol)
              </div>
            </div>
          )}

          {/* ── ANÁLISE PAGE ──────────────────────────────────────────────── */}
          {page === "analise" && (() => {
            const session = analysisSessions.find(s => s.id === currentSessionId) ?? null;
            const sessionFormula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
            const std = sessionFormula ? formulaStandards.find(s => s.formulaId === sessionFormula.id) ?? null : null;
            const compounds = sessionFormula?.activeCompounds ?? [];

            if (!session || !sessionFormula) {
              return (
                <div style={{ textAlign: "center", color: "#aaa", padding: "60px 0" }}>
                  <FlaskConical style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>Nenhuma sessão selecionada</div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#bbb" }}>
                    No painel esquerdo, crie ou selecione uma sessão de análise.
                  </div>
                </div>
              );
            }

            // Build overlay chromatogram data (merge all runs into one dataset)
            const runTime = sessionFormula.detector.runTime;
            const pts = 2000;
            const allChrom = session.runs.map(r => buildChromatogram(r.peaks, runTime, pts));
            const overlayData: Record<string, number>[] = allChrom.length > 0
              ? allChrom[0].map((pt, i) => {
                  const row: Record<string, number> = { time: pt.time };
                  session.runs.forEach((r, ri) => { row[`r${ri + 1}`] = allChrom[ri][i].signal; });
                  return row;
                })
              : [];

            // Determine chart Y max across all runs
            const allSignals = overlayData.flatMap(pt => session.runs.map((_, ri) => (pt[`r${ri + 1}`] ?? 0) as number));
            const overlayYMax = Math.ceil((Math.max(10, ...allSignals) * 1.15) / 50) * 50;

            // Per-compound teor results per run
            const runResults = session.runs.map(run => ({
              run,
              compResults: compounds.map(compound => {
                const stdEntry = std ? std.entries.find(e => e.compoundId === compound.id) ?? null : null;
                const wavMatch = Math.abs(compound.wavelength - sessionFormula.detector.sigWavelength) <= compound.waveTol;
                const peak = run.peaks.find(p => wavMatch && Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol);
                if (!peak) return { compound, area: null as number | null, calcConc: 0, teorPct: null as number | null };
                const area = peak.manualArea > 0 ? peak.manualArea : computeArea(peak);
                const { calcConc, teorPct } = calcTeorPct(area, compound, stdEntry);
                return { compound, area: parseFloat(area.toFixed(4)), calcConc, teorPct };
              }),
            }));

            // Summary stats per compound
            const compoundSummary = compounds.map(compound => {
              const teorPcts = runResults.map(rr => rr.compResults.find(cr => cr.compound.id === compound.id)?.teorPct).filter((v): v is number => v !== null && v !== undefined);
              if (teorPcts.length === 0) return null;
              const mean = teorPcts.reduce((a, b) => a + b, 0) / teorPcts.length;
              const sd = teorPcts.length > 1 ? Math.sqrt(teorPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / (teorPcts.length - 1)) : 0;
              const cv = mean > 0 ? (sd / mean) * 100 : 0;
              return { compoundId: compound.id, compoundName: compound.name, units: compound.units, mean: parseFloat(mean.toFixed(2)), sd: parseFloat(sd.toFixed(2)), cv: parseFloat(cv.toFixed(2)) };
            }).filter(Boolean);

            return (
              <div style={{ fontFamily: "Courier New, monospace" }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: "bold" }}>{session.name}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                    Fórmula: {sessionFormula.name} · {session.runs.length} corrida(s) registrada(s) · λ {sessionFormula.detector.sigWavelength} nm
                  </div>
                  {!std && (
                    <div style={{ fontSize: 10, color: "#ea580c", marginTop: 3 }}>
                      ⚠ Padrão não definido — configure o padrão no painel esquerdo para calcular Teor (%)
                    </div>
                  )}
                  {std && <div style={{ fontSize: 10, color: "#166534", marginTop: 3 }}>✓ Padrão salvo em {new Date(std.savedAt).toLocaleDateString("pt-BR")}</div>}
                </div>

                <div style={{ borderTop: "1px solid #ccc", margin: "8px 0 12px" }} />

                {/* Overlay chromatogram */}
                <div style={{ marginBottom: 6, fontSize: 11 }}>mAU</div>

                {session.runs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#aaa", padding: "40px 0", fontSize: 11, border: "1px dashed #ddd", borderRadius: 6 }}>
                    Nenhuma corrida registrada. Use o painel esquerdo para registrar corridas.
                  </div>
                ) : (
                  <>
                    {/* Color legend */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                      {session.runs.map(r => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                          <div style={{ width: 18, height: 2, background: r.color, borderRadius: 1 }} />
                          <span>{r.label}</span>
                        </div>
                      ))}
                    </div>

                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={overlayData} margin={{ top: 10, right: 16, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#e2e2e2" />
                        <XAxis dataKey="time" type="number" domain={[0, runTime]}
                          tickFormatter={(v: number) => v.toFixed(1)}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          label={{ value: "min", position: "right", offset: 8, fontFamily: "Courier New, monospace", fontSize: 11 }}
                          axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} />
                        <YAxis domain={[0, overlayYMax]}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} width={46} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
                              <div>{(label as number).toFixed(3)} min</div>
                              {payload.map((p, i) => (
                                <div key={i} style={{ color: p.color }}>
                                  {p.name}: {(p.value as number).toFixed(2)} mAU
                                </div>
                              ))}
                            </div>
                          );
                        }} />
                        {session.runs.map((r, ri) => (
                          <Line key={r.id} type="linear" dataKey={`r${ri + 1}`}
                            stroke={r.color} strokeWidth={1} dot={false} isAnimationActive={false}
                            name={r.label} connectNulls />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>

                    {/* Results table */}
                    <div style={{ borderTop: "1px solid #ccc", margin: "14px 0 10px" }} />
                    <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>Resultados — Teor por Corrida</div>

                    {compounds.length === 0 ? (
                      <div style={{ fontSize: 10, color: "#aaa" }}>Nenhum ativo definido nesta fórmula.</div>
                    ) : (
                      compounds.map(compound => {
                        const stdEntry = std ? std.entries.find(e => e.compoundId === compound.id) ?? null : null;
                        const summary = compoundSummary.find(cs => cs?.compoundId === compound.id);
                        return (
                          <div key={compound.id} style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4, color: "#1d4ed8" }}>
                              {compound.name} <span style={{ color: "#888", fontWeight: "normal", fontSize: 10 }}>({compound.units}){stdEntry ? ` — Nominal: ${stdEntry.nominalConc} ${compound.units}` : " — sem padrão"}</span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: 420 }}>
                                <thead>
                                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #333" }}>
                                    <th style={{ padding: "4px 10px", textAlign: "left" }}>Corrida</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Área (mAU*s)</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Conc. calc.</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Teor (%)</th>
                                    <th style={{ padding: "4px 10px", textAlign: "center" }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {runResults.map(({ run, compResults }, ri) => {
                                    const cr = compResults.find(c => c.compound.id === compound.id);
                                    const teorOk = cr?.teorPct !== null && cr?.teorPct !== undefined
                                      ? cr.teorPct >= 80 && cr.teorPct <= 120
                                      : null;
                                    return (
                                      <tr key={run.id} style={{ background: ri % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #eee" }}>
                                        <td style={{ padding: "4px 10px" }}>
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: run.color, flexShrink: 0 }} />
                                            {run.label}
                                          </span>
                                        </td>
                                        <td style={{ padding: "4px 10px", textAlign: "right" }}>{cr?.area !== null && cr?.area !== undefined ? cr.area.toFixed(3) : "—"}</td>
                                        <td style={{ padding: "4px 10px", textAlign: "right" }}>{cr?.calcConc ? `${cr.calcConc.toFixed(4)} ${compound.units}` : "—"}</td>
                                        <td style={{ padding: "4px 10px", textAlign: "right", fontWeight: "bold", color: teorOk === null ? "#888" : teorOk ? "#166534" : "#dc2626" }}>
                                          {cr?.teorPct !== null && cr?.teorPct !== undefined ? `${cr.teorPct.toFixed(2)} %` : "—"}
                                        </td>
                                        <td style={{ padding: "4px 10px", textAlign: "center" }}>
                                          {teorOk === null ? <span style={{ color: "#94a3b8", fontSize: 9 }}>sem padrão</span>
                                            : teorOk ? <span style={{ color: "#166534", fontSize: 9, fontWeight: "bold" }}>✓ Aprovado</span>
                                            : <span style={{ color: "#dc2626", fontSize: 9, fontWeight: "bold" }}>✗ Reprovado</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                {summary && (
                                  <tfoot>
                                    <tr style={{ background: "#f8fafc", borderTop: "2px solid #999" }}>
                                      <td style={{ padding: "4px 10px", fontWeight: "bold" }}>Resumo ({session.runs.length} corridas)</td>
                                      <td />
                                      <td />
                                      <td style={{ padding: "4px 10px", textAlign: "right", fontWeight: "bold" }}>
                                        <div>x̄ = {summary.mean.toFixed(2)} %</div>
                                        <div style={{ fontWeight: "normal", fontSize: 9, color: "#666" }}>DP = {summary.sd.toFixed(2)} | %CV = {summary.cv.toFixed(2)}</div>
                                      </td>
                                      <td style={{ padding: "4px 10px", textAlign: "center" }}>
                                        <span style={{
                                          fontSize: 9, fontWeight: "bold", padding: "2px 6px", borderRadius: 3,
                                          background: summary.cv <= 2 ? "#dcfce7" : summary.cv <= 5 ? "#fef9c3" : "#fee2e2",
                                          color: summary.cv <= 2 ? "#166534" : summary.cv <= 5 ? "#854d0e" : "#b91c1c",
                                        }}>
                                          %CV {summary.cv.toFixed(2)}
                                        </span>
                                      </td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── USUÁRIOS PAGE (admin only) ───────────────────────────────── */}
          {page === "usuarios" && (
            <div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: "bold", fontFamily: "Courier New, monospace", display: "flex", alignItems: "center", gap: 6 }}>
                  <Users style={{ width: 16, height: 16 }} /> Gerenciamento de Usuários
                </div>
                <div style={{ fontSize: 10, color: "#999", fontFamily: "Courier New, monospace", marginTop: 2 }}>
                  Controle de acesso ao Simulador HPLC. Todos os usuários compartilham login com o Protocolo de Estabilidade.
                </div>
              </div>
              <Div />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={fetchUsers} disabled={userListLoading}>
                  {userListLoading ? "Carregando…" : "↻ Atualizar"}
                </Button>
              </div>
              {userListError && (
                <div style={{ color: "#dc2626", fontFamily: "Courier New, monospace", fontSize: 11, marginBottom: 10 }}>{userListError}</div>
              )}
              {userList.length === 0 && !userListLoading && !userListError && (
                <div style={{ textAlign: "center", color: "#aaa", padding: "32px 0", fontFamily: "Courier New, monospace", fontSize: 11 }}>
                  Clique em "Atualizar" para carregar os usuários.
                </div>
              )}
              {userList.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Usuário</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Nome</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Perfil</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Ativo</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Acesso HPLC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userList.map((u, i) => {
                        const isSelf = u.id === user?.id;
                        const isToggling = togglingId === u.id;
                        return (
                          <tr key={u.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f0f0f0" }}>
                            <td style={{ padding: "6px 10px", fontWeight: "bold" }}>{u.username}</td>
                            <td style={{ padding: "6px 10px", color: "#555" }}>{u.displayName}</td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: "bold",
                                background: u.role === "admin" ? "#fef3c7" : "#f1f5f9",
                                color: u.role === "admin" ? "#92400e" : "#475569",
                              }}>
                                {u.role === "admin" ? "Admin" : "Analista"}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, color: u.active ? "#166534" : "#dc2626" }}>
                                {u.active ? "✓ Ativo" : "✗ Inativo"}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              {isSelf ? (
                                <span style={{ fontSize: 9, color: "#94a3b8", fontStyle: "italic" }}>você</span>
                              ) : (
                                <button
                                  disabled={isToggling}
                                  onClick={() => toggleHplcAccess(u.id, u.hplcAccess)}
                                  title={u.hplcAccess ? "Clique para revogar acesso ao HPLC" : "Clique para conceder acesso ao HPLC"}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, cursor: isToggling ? "wait" : "pointer",
                                    background: "none", border: "none", padding: "2px 4px", borderRadius: 4,
                                    opacity: isToggling ? 0.5 : 1,
                                  }}
                                >
                                  {u.hplcAccess ? (
                                    <>
                                      <ToggleRight style={{ width: 20, height: 20, color: "#16a34a" }} />
                                      <ShieldCheck style={{ width: 12, height: 12, color: "#16a34a" }} />
                                      <span style={{ fontSize: 9, color: "#16a34a", fontWeight: "bold" }}>Com acesso</span>
                                    </>
                                  ) : (
                                    <>
                                      <ToggleLeft style={{ width: 20, height: 20, color: "#dc2626" }} />
                                      <ShieldOff style={{ width: 12, height: 12, color: "#dc2626" }} />
                                      <span style={{ fontSize: 9, color: "#dc2626", fontWeight: "bold" }}>Sem acesso</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: 9, color: "#888", fontFamily: "Courier New, monospace" }}>
                    Clique no toggle da coluna "Acesso HPLC" para liberar ou revogar o acesso de um usuário ao simulador.
                    Usuários sem acesso verão uma mensagem de erro ao tentar entrar.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LOTES PAGE ────────────────────────────────────────────────── */}
          {page === "lotes" && (() => {
            const formula = formulas.find(f => f.id === selectedFormulaId) ?? null;
            const formulaLots = formula ? lots.filter(l => l.formulaId === formula.id) : [];
            const compounds = formula?.activeCompounds ?? [];

            if (!formula) {
              return (
                <div style={{ textAlign: "center", color: "#aaa", padding: "60px 0" }}>
                  <Layers style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>Nenhuma fórmula selecionada</div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#bbb" }}>
                    No painel esquerdo, salve a configuração atual como fórmula<br />ou selecione uma fórmula já existente.
                  </div>
                </div>
              );
            }

            return (
              <div>
                {/* Formula header */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: "bold", fontFamily: "Courier New, monospace" }}>
                    {formula.name}
                  </div>
                  {formula.description && (
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "Courier New, monospace" }}>{formula.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: "#999", fontFamily: "Courier New, monospace", marginTop: 2 }}>
                    Criado em {new Date(formula.createdAt).toLocaleDateString("pt-BR")} · λ {formula.detector.sigWavelength} nm · {compounds.length} composto{compounds.length !== 1 ? "s" : ""}
                  </div>
                </div>

                <Div />

                {/* Compounds in this formula */}
                <div style={{ marginTop: 10, marginBottom: 14 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", marginBottom: 4 }}>
                    Ativos monitorados nesta fórmula:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {compounds.map(c => (
                      <span key={c.id} style={{
                        fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 7px",
                        border: "1px solid #bfdbfe", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8",
                      }}>
                        {c.name} · TR {c.expectedRT.toFixed(2)} min{c.specMin > 0 && c.specMax > 0 ? ` · spec ${c.specMin}–${c.specMax} ${c.units}` : ""}
                      </span>
                    ))}
                    {compounds.length === 0 && <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa" }}>Nenhum ativo definido nesta fórmula.</span>}
                  </div>
                </div>

                {/* Add lot button */}
                <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <AddLotDialog onSave={handleAddLot}>
                    <Button size="sm" className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Registrar Lote Atual
                    </Button>
                  </AddLotDialog>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888" }}>
                    Salva o cromatograma atual como um novo lote desta fórmula.
                  </span>
                </div>

                {/* Lots results table */}
                {formulaLots.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#bbb", padding: "24px 0", fontFamily: "Courier New, monospace", fontSize: 11 }}>
                    Nenhum lote registrado ainda. Configure o cromatograma e clique em "Registrar Lote Atual".
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Lote</th>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Data</th>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Amostra</th>
                          {compounds.map(c => (
                            <th key={c.id} style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                              {c.name}<br /><span style={{ fontWeight: "normal", fontSize: 9, color: "#888" }}>{c.units}</span>
                            </th>
                          ))}
                          <th style={{ padding: "5px 8px", borderBottom: "1px solid #ddd" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...formulaLots].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((lot, rowIdx) => (
                          <tr key={lot.id} style={{ background: rowIdx % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f0f0f0" }}>
                            <td style={{ padding: "5px 8px", fontWeight: "bold", whiteSpace: "nowrap" }}>{lot.lotNumber}</td>
                            <td style={{ padding: "5px 8px", color: "#666", whiteSpace: "nowrap" }}>{new Date(lot.createdAt).toLocaleDateString("pt-BR")}</td>
                            <td style={{ padding: "5px 8px", color: "#555", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }} title={lot.sample.sampleName}>
                              {lot.sample.sampleName || "—"}
                            </td>
                            {compounds.map(c => {
                              const r = lot.results.find(res => res.compoundId === c.id);
                              if (!r || !r.found) {
                                return (
                                  <td key={c.id} style={{ padding: "5px 8px", textAlign: "center" }}>
                                    <span style={{ fontSize: 9, color: "#dc2626", padding: "1px 5px", borderRadius: 3, background: "#fee2e2" }}>NÃO DETECTADO</span>
                                  </td>
                                );
                              }
                              const bg = r.inSpec === null ? "#eff6ff" : r.inSpec ? "#dcfce7" : "#fee2e2";
                              const color = r.inSpec === null ? "#1d4ed8" : r.inSpec ? "#166534" : "#b91c1c";
                              const badge = r.inSpec === null ? "" : r.inSpec ? " ✓" : " ✗";
                              return (
                                <td key={c.id} style={{ padding: "5px 8px", textAlign: "center" }}>
                                  <span style={{ fontSize: 9.5, padding: "2px 6px", borderRadius: 3, background: bg, color, fontWeight: "bold", whiteSpace: "nowrap" }}>
                                    {r.concentration.toFixed(3)}{badge}
                                  </span>
                                  <div style={{ fontSize: 8, color: "#aaa", marginTop: 1 }}>Área: {r.area.toFixed(0)}</div>
                                </td>
                              );
                            })}
                            <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                                title="Excluir lote"
                                onClick={() => handleDeleteLot(lot.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {formulaLots.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 9, color: "#888", fontFamily: "Courier New, monospace" }}>
                    Verde = dentro da especificação · Vermelho = fora da especificação ou não detectado · Azul = detectado, sem especificação definida
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444" }}>
            <span>{sample.acqInstrument} {now} {sample.acqOperator}</span>
            <span>Page   1 of 1</span>
          </div>
        </div>
      </div>

      {/* ── Password-protected delete session dialog ─────────────────────────── */}
      {deleteSessionDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "24px 28px", minWidth: 340, boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
            fontFamily: "Courier New, monospace",
          }}>
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#dc2626", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Trash2 style={{ width: 16, height: 16 }} /> Excluir Sessão de Análise
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginBottom: 14, lineHeight: 1.5 }}>
              Você está prestes a excluir permanentemente:<br />
              <strong>"{deleteSessionDialog.name}"</strong><br />
              <span style={{ color: "#dc2626", fontSize: 10 }}>Esta ação não pode ser desfeita.</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>
                Digite a senha mestra para confirmar:
              </label>
              <input
                type="password"
                value={deleteSessionPwd}
                onChange={e => { setDeleteSessionPwd(e.target.value); setDeleteSessionError(null); }}
                onKeyDown={e => e.key === "Enter" && !deleteSessionLoading && confirmDeleteSession()}
                placeholder="Senha mestra"
                autoFocus
                style={{
                  width: "100%", border: deleteSessionError ? "1px solid #dc2626" : "1px solid #cbd5e1",
                  borderRadius: 5, padding: "6px 10px", fontSize: 12, fontFamily: "Courier New, monospace",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              {deleteSessionError && (
                <div style={{ fontSize: 10, color: "#dc2626", marginTop: 4 }}>{deleteSessionError}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ fontSize: 11, padding: "6px 14px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#f8fafc", cursor: "pointer", color: "#475569" }}
                onClick={() => { setDeleteSessionDialog(null); setDeleteSessionPwd(""); setDeleteSessionError(null); }}>
                Cancelar
              </button>
              <button
                disabled={deleteSessionLoading || !deleteSessionPwd}
                style={{ fontSize: 11, padding: "6px 16px", border: "1px solid #dc2626", borderRadius: 5, background: deleteSessionLoading || !deleteSessionPwd ? "#fca5a5" : "#dc2626", cursor: deleteSessionLoading || !deleteSessionPwd ? "not-allowed" : "pointer", color: "#fff", fontWeight: "bold" }}
                onClick={confirmDeleteSession}>
                {deleteSessionLoading ? "Verificando…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
