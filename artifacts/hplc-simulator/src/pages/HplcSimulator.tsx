import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Printer, Plus, Trash2, Settings, FlaskConical, BarChart3, FileText, Database, Zap, CheckCircle2, XCircle, LogOut, Check, Layers, Download, Users, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, LayoutDashboard, ImageDown, ClipboardCheck, ClipboardX, ScrollText, Activity, ImageIcon, Eye, EyeOff, ClipboardPaste, Scale, Lock, LockOpen } from "lucide-react";
import { useAuth } from "@/contexts/use-auth";
import { useToast } from "@/hooks/use-toast";
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
  peakNoise: number;        // 0 = perfect Gaussian; 1 = max roughness
  inclination?: number;     // -5..+5 — tilts the peak baseline (positive = right side higher)
  attachedFile?: string;    // filename of imported data file
  printSelected?: boolean;  // include in printed report (default = true)
  locked?: boolean;         // if true: peak cannot be moved, edited or deleted
  isGhost?: boolean;        // ghost/phantom peak — overlapping, imperfect shape, no label
  purityPct?: number;       // % purity of the peak's active compound (0/undefined = not set; 1–100 = explicit purity)
  // Advanced peak shape
  emgTau?: number;          // 0 = Gaussian; >0 = EMG exponential tail time constant (min)
  overload?: number;        // 0–1 — column overload: compresses front, extends tail
  flatTop?: number;         // 0–1 — detector saturation: clips peak apex
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
  reportDate: string;    // date shown in footer (editable)
  softwareRev: string;   // software version string shown in footer
  signalLabelOverride?: string; // when set, overrides the full "DAD1 A, Sig=... (...)" line
}

interface DetectorInfo {
  signalName: string;   // "DAD1 A"
  sigWavelength: number;
  sigBandwidth: number;
  refWavelength: number;
  refBandwidth: number;
  runTime: number;      // min
  // Baseline appearance
  baselineNoise: number;       // mAU — high-frequency noise amplitude (0 = flat)
  baselineDrift: number;       // mAU — linear upward drift over full run
  baselinePulse: number;       // mAU — pump pulsation ripple
  baselineWander: number;      // mAU — slow sinusoidal baseline oscillation (gradient effect)
  shotNoise: number;           // 0-1  — signal-proportional noise (LC/MS counting statistics)
  baselineHump: number;        // mAU — broad column-bleed background hump
  broadeningFactor: number;    // 0-1  — RT-dependent peak width increase (van Deemter)
  baselineOffset: number;      // mAU — constant vertical shift of the entire baseline
  baselinePulseFreq: number;   // cycles/min — pump pulsation frequency (default ~1.6)
  baselineStartOffset: number; // mAU — initial displacement at t=0 that decays exponentially
  baselineStartDecay: number;  // min — time constant for initial baseline to settle
  // Advanced baseline artifacts
  baselineStep?: number;       // mAU — sudden step offset (valve/switching artifact)
  baselineStepRT?: number;     // min — RT at which step occurs (0 = disabled)
  gradientRamp?: number;       // mAU — smooth sigmoid baseline rise (gradient UV absorption)
  spikeRate?: number;          // spikes/min — random electronic transients
  baselineDecay?: number;      // mAU — exponential bleed-out from t=0
  wanderFreq?: number;         // multiplier — wander oscillation frequency (default 1.0)
  lineWidth: number;           // px — thickness of the chromatogram trace
  // Y-axis (mAU) scale
  yAxisAuto: boolean;     // true = auto-scale; false = use yAxisMin/yAxisMax
  yAxisMin: number;       // mAU — manual lower limit
  yAxisMax: number;       // mAU — manual upper limit
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
  relRefWindow?: string;
  absRefWindow?: string;
  relNonRefWindow?: string;
  absNonRefWindow?: string;
  uncalibratedPeaks?: string;
  partialCalibration?: string;
  correctAllRetTimes?: string;
  avgResponse?: string;
  avgRetentionTime?: string;
  nominalConc?: number;  // concentração nominal declarada (ug/ml) — para cálculo de teor de pureza
}

interface CompoundCalibration {
  calib: CalibInfo;
  standards: CalibStandard[];
  locked?: boolean;
}

interface ActiveCompound {
  id: string;
  name: string;
  wavelength: number;       // nm  — detector wavelength for identification
  waveTol: number;          // nm  — ±tolerance for wavelength match
  expectedRT: number;       // min — expected retention time
  rtTol: number;            // min — ±tolerance for RT match
  typicalWidth: number;     // sigma (min) — used when adding a new simulated peak
  typicalAsym: number;
  amtPerArea: number;       // response factor [ug/ml / mAU*s]
  units: string;            // "ug/ml", "mg/L", etc.
  specMin: number;          // specification lower limit (0 = N/A)
  specMax: number;          // specification upper limit (0 = N/A)
  certifiedPurity: number;  // % — certified purity of the reference standard (0 = not set → default 99.5)
  method: string;           // analytical method file
  notes: string;
  // ANVISA conformance — auto-synced from the ANVISA block when this compound is active
  anvisaMinMg?: number;     // mg — ANVISA lower limit
  anvisaMaxMg?: number;     // mg — ANVISA upper limit
  anvisaNorm?: string;      // reference norm, e.g. "IN 28/2018"
  // Reference Standard — Standard Area and Injected Amount saved per compound
  stdArea?: number;        // mAU·s — area of the reference standard peak
  stdAmountUg?: number;    // µg    — certified injected amount of the reference standard
  // Pre-registered calibration standards — used instead of auto-generating
  defaultStandards?: CalibStandard[];
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

const RUN_COLORS = [
  "#1560bd", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#b45309", "#be185d", "#4d7c0f", "#6366f1",
  "#0f766e", "#c2410c", "#7c3aed", "#065f46", "#9f1239",
];
const runColor = (index: number) => RUN_COLORS[index % RUN_COLORS.length];

interface AnalysisRun {
  id: string;
  runNumber: number;    // 1–5
  label: string;        // "R1", "R2", …
  createdAt: string;
  peaks: Peak[];
  sample: SampleInfo;
  color: string;
  hidden?: boolean;     // if true, excluded from charts and analysis
}

interface AnalysisSession {
  id: string;
  formulaId?: string;       // optional — snapshot sessions (created via "Confirmar") have none
  name: string;
  createdAt: string;
  updatedAt?: string;
  notes: string;
  runs: AnalysisRun[];
  status: "em_andamento" | "aprovado" | "reprovado" | "laudo_emitido";
  concludedAt?: string;
  laudoEmittedAt?: string;
  conclusionNotes?: string; // notes entered in the finalization dialog
  snapshotState?: PersistedState; // full chromatogram state at time of "Confirmar"
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
  certificateNumber?: string;
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

interface PadraoConfig {
  compoundName: string;
  // Reference standard
  stdPeakName: string;     // label: which peak was used as standard
  stdArea: number;         // mAU·s — area of the reference peak
  stdAmountUg: number;     // µg — certified/known mass injected
  stdPurity: number;       // % — certified purity of the reference standard
  // Sample
  smpPeakName: string;     // label: which peak was used as sample
  smpArea: number;         // mAU·s — area of the sample peak (purity-corrected when smpPurity < 100)
  smpRawArea: number;      // mAU·s — raw captured area before purity correction (0 = not set)
  smpPurity: number;       // % purity of the analyzed sample (100 = no correction)
  smpDeclaredAmountUg: number; // µg — theoretical/declared amount (for purity %)
  // Concentração Inicial (dilution back-calculation route)
  smpMassDeclaradaMg: number;  // mg — declared/label mass (editable, independent of anvisaLabelAmountMg)
  smpConcFinalUgMl: number;    // µg/mL — C_f: final concentration measured by HPLC in the injection solution
  smpVolInicialMl: number;     // mL — V_i: initial dissolution volume
  smpInjVolUl: number;         // µL — injection volume (optional; auto-derives C_f from foundAmountUg)
  smpDilutionFactor: number;   // FD — dilution factor applied before injection (1 = no extra dilution)
  notes: string;
  selectedLotIds: string[];  // operator-selected lots to show in report (empty = show all)
  // ANVISA conformance
  anvisaLabelAmountMg: number;    // mg — declared amount on label (for % found)
  anvisaMinMg: number;            // mg — ANVISA acceptance range lower limit
  anvisaMaxMg: number;            // mg — ANVISA acceptance range upper limit
  anvisaNorm: string;             // e.g. "IN 28/2018"
  anvisaUseUg: boolean;           // true → display min/max in µg instead of mg
  anvisaFoundMgOverride: number;  // mg — direct override from "Aplicar" (0 = use area-based calc)
  concInicialUseUg: boolean;      // true → show M_declarada in µg instead of mg
  // Identificação do documento
  productName: string;   // Nome do produto (identificação comercial)
  productLot: string;    // Lote do produto
  certNumber: string;    // Número do certificado de análise (ex: CA-2025-001)
  certTitle: string;     // Título do Certificado (default: "Certificado de Análise")
  // PADRÃO DE REFERÊNCIA display controls
  smpAreaSaved: boolean;       // true = smpArea locked — requires password to change
  hideDiamondOnCurve: boolean; // true = hide the ◆ diamond from the calibration curve chart
}

// ─── Saved Analyses (Standard PDF records) ───────────────────────────────────────
interface SavedAnalysis {
  id: string;
  savedAt: string;          // ISO date string
  certTitle: string;
  certNumber: string;
  productName: string;
  productLot: string;
  compoundName: string;
  foundAmountMg: number;
  purity: number;           // %
  inSpec: boolean | null;   // ANVISA conformance
  sampleName: string;
  operator: string;
  injDate: string;
  chromSvgData: string;     // serialized SVG string for re-display
  config: PadraoConfig;     // full config snapshot to regenerate PDF
  htmlContent?: string;     // full PDF HTML (same as handlePrintPadrao output)
  // Full document snapshot — optional for backward compat with older records
  peaks?: Peak[];
  sample?: SampleInfo;
  detector?: DetectorInfo;
  standards?: CalibStandard[];
  calib?: CalibInfo;
  activeCompounds?: ActiveCompound[];
}

// ─── Padrao protection + audit types ────────────────────────────────────────────

  interface PadraoChangeLog {
    id: string;
    field: string;
    oldValue: string;
    newValue: string;
    changedAt: string;
    changedBy: string;
  }

  // ─── Standards Library (presets) ─────────────────────────────────────────────────
  interface PadraoPreset {
    id: string;
    name: string;
    compoundName: string;
    stdArea: number;
    stdAmountUg: number;
    stdPurity: number;
  }

  // ─── Calc-trace types (rastreabilidade) ──────────────────────────────────────────

  type CalcMethod = "external_standard" | "calibration_curve" | "response_factor" | "unknown";

  interface CalcTrace {
    resultLabel: string;
    resultValue: string;
    method: CalcMethod;
    formulaText: string;
    inputs: { label: string; value: string; source: string }[];
    sourceTab: string;
    peakName?: string;
    compoundName?: string;
    standardRef?: string;
    warningText?: string;
  }

  // ─── Validation types ─────────────────────────────────────────────────────────────

  interface ValidationAlert {
    severity: "error" | "warning" | "info";
    message: string;
    field?: string;
  }

  // ─── Math ─────────────────────────────────────────────────────────────────────

function gaussian(t: number, rt: number, sigma: number, h: number, asym: number): number {
  const d = t - rt;
  const s = d < 0 ? sigma : sigma * asym;
  return h * Math.exp(-(d * d) / (2 * s * s));
}

/** Advanced peak shape: split-Gaussian + optional EMG tailing, column overload and flat-top. */
function peakShapeAt(t: number, p: Peak, effWidth: number): number {
  const emgTau = p.emgTau ?? 0;
  const overload = p.overload ?? 0;
  const flatTop = p.flatTop ?? 0;
  const d = t - p.retentionTime;
  const sigmaL = overload > 0 ? effWidth * Math.max(0.2, 1 - overload * 0.7) : effWidth;
  const sigmaR = effWidth * p.asymmetry;
  let y: number;
  if (d < 0) {
    y = p.height * Math.exp(-(d * d) / (2 * sigmaL * sigmaL));
  } else if (emgTau > 0) {
    const gY = p.height * Math.exp(-(d * d) / (2 * sigmaR * sigmaR));
    const eY = p.height * Math.exp(-d / emgTau);
    const blend = Math.min(0.95, emgTau / (sigmaR + emgTau));
    y = gY * (1 - blend) + eY * blend;
  } else {
    y = p.height * Math.exp(-(d * d) / (2 * sigmaR * sigmaR));
  }
  if (overload > 0 && d > 0) {
    y += p.height * overload * 0.4 * Math.exp(-d / (effWidth * 2.5));
  }
  if (flatTop > 0) {
    const sat = p.height * (1 - flatTop * 0.78);
    if (y > sat) y = sat + (y - sat) * 0.07;
  }
  return Math.max(0, y);
}

// Deterministic pseudo-noise — same result every render, looks random
function pseudoNoise(i: number): number {
  const a = Math.sin(i * 127.1 + 1.0) * 43758.5453;
  const b = Math.sin(i * 311.7 + 2.3) * 9301.1231;
  const c = Math.sin(i * 53.11 + 4.7) * 2053.3378;
  return ((a + b + c) - Math.floor(a + b + c)) - 0.5; // -0.5 … +0.5
}

// ── Method name sync helpers ──────────────────────────────────────────────────
// Extract just the last path segment (filename) from a Windows/Unix path
function extractMethodFilename(path: string): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
// Replace the last segment (filename) of a path with a new filename.
// If the current path has no directory component, just returns newFilename.
function applyMethodFilename(currentPath: string, newFilename: string): string {
  if (!currentPath) return newFilename;
  const sep = currentPath.includes("\\") ? "\\" : "/";
  const parts = currentPath.split(/[\\/]/);
  if (parts.length <= 1) return newFilename;
  parts[parts.length - 1] = newFilename;
  return parts.join(sep);
}
// Given a change to acqMethod or analysisMethod, derive what the OTHER field should be.
// Both paths keep their directories; only the final .M filename is synced.
function syncMethodPeer(changedKey: "acqMethod" | "analysisMethod", newValue: string, currentPeer: string): string {
  const newFilename = extractMethodFilename(newValue);
  // If the new value has no path structure, just use it directly as the peer filename too
  if (!currentPeer) return newFilename;
  return applyMethodFilename(currentPeer, newFilename);
}

// Hash peak id string → integer seed for deterministic per-peak noise
function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Per-peak surface roughness: deterministic noise proportional to local Gaussian amplitude
// Returns a multiplier offset so the Gaussian shape is preserved but roughened.
// Five octaves give a realistic multi-scale texture (fine + coarse heterogeneity).
function peakNoiseAt(i: number, seed: number, localAmp: number, peakNoise: number): number {
  if (peakNoise <= 0 || localAmp < 0.01) return 0;
  const n1 = pseudoNoise(i * 7   + seed % 997);
  const n2 = pseudoNoise(i * 23  + (seed >> 3)  % 1987);
  const n3 = pseudoNoise(i * 71  + (seed >> 6)  % 4003);
  const n4 = pseudoNoise(i * 157 + (seed >> 9)  % 7001);
  const n5 = pseudoNoise(i * 13  + (seed >> 12) % 3001);
  const raw = n1 * 0.38 + n2 * 0.26 + n3 * 0.18 + n4 * 0.11 + n5 * 0.07;
  // At peakNoise=1 → roughness ≈ 45% of local amplitude (clearly visible)
  return raw * peakNoise * 0.45 * localAmp;
}

function buildChromatogram(
  peaks: Peak[], runTime: number, pts = 6000,
  noiseAmp = 1.8, driftAmp = 1.2, pulseAmp = 0.35,
  wanderAmp = 0,          // mAU — slow sinusoidal baseline oscillation
  shotNoise = 0,          // 0-1  — signal-proportional noise (LC/MS counting statistics)
  humpAmp = 0,            // mAU — broad column-bleed background hump
  broadeningFactor = 0,   // 0-1 — RT-dependent peak broadening (van Deemter)
  baselineOffset = 0,     // mAU — constant vertical baseline shift
  pulseFreqHz = 1.6,      // cycles/min — pump pulsation frequency
  startOffset = 0,        // mAU — initial baseline displacement at t=0 (exponential decay)
  startDecay = 1.0,       // min — time constant for initial baseline to settle
  gradientRamp = 0,       // mAU — smooth sigmoid UV absorption ramp (gradient)
  stepAmp = 0,            // mAU — sudden baseline step offset
  stepRT = 0,             // min — RT of step (0 = disabled)
  spikeRateParam = 0,     // spikes/min — random electronic transients
  decayParam = 0,         // mAU — exponential bleed-out amplitude from t=0
  wanderFreqMult = 1.0,   // multiplier — wander oscillation frequency
) {
  const dt = runTime / pts;
  const pulseFreq = pulseFreqHz;

  // Hump: broad Gaussian centered at ~65% of run time (gradient / column-bleed)
  const humpCenter = runTime * 0.65;
  const humpSigma  = runTime * 0.18;

  // Pre-compute per-peak seeds once
  const peakSeeds = peaks.map(p => idSeed(p.id));

  return Array.from({ length: pts + 1 }, (_, i) => {
    const t = i * dt;

    // Sum all user-defined peaks (with optional surface roughness + RT broadening)
    let signal = 0;
    for (let pi = 0; pi < peaks.length; pi++) {
      const p = peaks[pi];
      // van Deemter broadening: peaks widen linearly with retention time
      const effWidth = broadeningFactor > 0
        ? p.width * (1 + broadeningFactor * (p.retentionTime / runTime))
        : p.width;
      const localAmp = peakShapeAt(t, p, effWidth);
      signal += localAmp + peakNoiseAt(i, peakSeeds[pi], localAmp, p.peakNoise ?? 0);
      // Peak inclination — tilts the peak by adding a linear ramp under the Gaussian envelope
      if ((p.inclination ?? 0) !== 0) {
        const incl = p.inclination!;
        const span = effWidth * 5;
        const deltaT = t - p.retentionTime;
        if (Math.abs(deltaT) < span) {
          const envelope = localAmp / Math.max(p.height, 1);
          signal += incl * p.height * 0.45 * (deltaT / span) * envelope;
        }
      }
    }

    // Shot noise — proportional to √signal, mimics LC/MS photon/ion counting statistics
    const shot = shotNoise > 0 && signal > 1
      ? pseudoNoise(i * 997 + 3333) * shotNoise * Math.sqrt(signal) * 0.5
      : 0;

    // Multi-octave correlated baseline noise (4 octaves → more realistic texture)
    const n1 = pseudoNoise(i);
    const n2 = pseudoNoise(i * 3  + 4999);
    const n3 = pseudoNoise(i * 11 + 8888);
    const n4 = pseudoNoise(i * 37 + 1234);
    const noise = noiseAmp * (n1 * 0.50 + n2 * 0.28 + n3 * 0.14 + n4 * 0.08);

    // Slow baseline wander: two sinusoids at different periods (wanderFreqMult controls speed)
    const wander = wanderAmp > 0
      ? wanderAmp * (
          Math.sin(2 * Math.PI * 2.3 * wanderFreqMult * t / runTime + 0.8) * 0.60 +
          Math.sin(2 * Math.PI * 4.7 * wanderFreqMult * t / runTime + 2.1) * 0.40
        )
      : 0;

    // Linear baseline drift
    const drift = driftAmp * (t / runTime);

    // Pump pressure pulsation
    const pulse = pulseAmp * Math.sin(2 * Math.PI * pulseFreq * t);

    // Column bleed / matrix hump — broad Gaussian background
    const hump = humpAmp > 0
      ? humpAmp * Math.exp(-((t - humpCenter) ** 2) / (2 * humpSigma * humpSigma))
      : 0;

    // Initial baseline instability — exponential decay from t=0
    const startEffect = startOffset !== 0
      ? startOffset * Math.exp(-t / Math.max(startDecay, 0.01))
      : 0;

    // Gradient ramp — smooth sigmoid UV absorption rise (e.g. reversed-phase gradient)
      const gradRamp = gradientRamp > 0
        ? gradientRamp * (1 / (1 + Math.exp(-8 * (t / runTime - 0.45))))
        : 0;
      // Step artifact at stepRT (valve switch, column switch)
      const stepEffect = (stepAmp !== 0 && stepRT > 0 && t >= stepRT) ? stepAmp : 0;
      // Random electronic spikes
      const spikeProb = spikeRateParam > 0 ? spikeRateParam * dt : 0;
      const spike = spikeProb > 0 && (pseudoNoise(i * 91237 + 4441) + 0.5) < spikeProb
        ? pseudoNoise(i * 33331 + 2222) * spikeRateParam * 80
        : 0;
      // Exponential decay from t=0 (column bleed-out / solvent front tail)
      const decay = decayParam > 0 ? decayParam * Math.exp(-t / (runTime * 0.12)) : 0;
      // Wander with variable frequency
      const total = signal + shot + noise + wander + drift + pulse + hump + baselineOffset + startEffect + gradRamp + stepEffect + spike + decay;
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

/** Linear interpolation of signal at time t from the chromatogram data array */
function interpolateChromSignal(chrom: { time: number; signal: number }[], t: number): number {
  if (chrom.length === 0) return 0;
  if (t <= chrom[0].time) return chrom[0].signal;
  if (t >= chrom[chrom.length - 1].time) return chrom[chrom.length - 1].signal;
  let lo = 0, hi = chrom.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (chrom[mid].time <= t) lo = mid; else hi = mid;
  }
  const { time: t0, signal: y0 } = chrom[lo];
  const { time: t1, signal: y1 } = chrom[hi];
  return t1 > t0 ? y0 + (y1 - y0) * (t - t0) / (t1 - t0) : y0;
}

/** Peak integration window boundaries — valley-to-valley straight-baseline method.
 *  Window = RT ± 3.5σ (left) and RT + 3.5σ·asymmetry (right). */
function peakIntegBounds(p: Peak, runTime: number) {
  const tStart = Math.max(0,       p.retentionTime - 3.5 * p.width);
  const tEnd   = Math.min(runTime, p.retentionTime + 3.5 * p.width * p.asymmetry);
  return { tStart, tEnd };
}

/** Baseline-corrected peak area: subtracts the trapezoid under the straight baseline
 *  drawn from (tStart, yStart) to (tEnd, yEnd).  Returns mAU·s (≥ 0). */
function computeBaselineCorrectedArea(
  p: Peak,
  chrom: { time: number; signal: number }[],
  runTime: number,
): number {
  const { tStart, tEnd } = peakIntegBounds(p, runTime);
  const yStart = interpolateChromSignal(chrom, tStart);
  const yEnd   = interpolateChromSignal(chrom, tEnd);
  const rawArea  = computeArea(p);
  // Trapezoid under the straight baseline [mAU·min → mAU·s]
  const trapArea = 0.5 * (yStart + yEnd) * (tEnd - tStart) * 60;
  return Math.max(0, rawArea - trapArea);
}

/** Peak width at base (Wb) in minutes.
 *  For our asymmetric Gaussian: Wb = 2σ_left + 2σ_right = 2·σ·(1 + asymmetry)
 *  For a symmetric peak (asymmetry = 1): Wb = 4σ  (matches ChemStation convention) */
function computeWb(p: Peak): number {
  return 2 * p.width * (1 + p.asymmetry);
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

function buildCalibCurveAscii(
  standards: Array<{ amount: number; area: number }>,
  sampleArea: number,
  sampleAmount: number,
  compoundName: string,
  expRT: number,
  sigLabel: string,
  r: number,
  residStdDev: number,
  slope: number,
  intercept: number
): string[] {
  const INDENT = "    ";
  const ROWS = 12;
  const W = 78;
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(W).fill(" "));

  const put = (row: number, col: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      if (row >= 0 && row < ROWS && col + i >= 0 && col + i < W)
        grid[row][col + i] = text[i];
    }
  };

  const xOff = 9;
  const xW = 26;
  const sorted = [...standards].sort((a, b) => a.amount - b.amount);
  const xMax = Math.max(...sorted.map(s => s.amount), 100);
  const toCol = (amount: number) => xOff + Math.round((amount / xMax) * xW);

  const maxArea = Math.max(...sorted.map(s => s.area), sampleArea);
  const yTop = maxArea * 1.05;
  const toRow = (area: number): number => {
    if (area >= yTop) return 0;
    if (area >= 2000) return 1;
    if (area >= 1500) return 2 + Math.round((2000 - area) / 500);
    if (area >= 1000) return 3 + Math.round((1500 - area) / 250);
    if (area >= 500)  return 5 + Math.round((1000 - area) / 250);
    return 7 + Math.round((500 - area) / 250);
  };

  put(0, 3, "Area");

  [0, 500, 1000, 1500, 2000].forEach(v => {
    const row = v === 0 ? 9 : toRow(v);
    put(row, 6, String(v).padStart(4));
  });

  sorted.forEach((s, i) => {
    put(toRow(s.area), toCol(s.amount), String(i + 1));
  });

  const sRow = toRow(sampleArea);
  const sCol = toCol(sampleAmount);
  put(sRow, 10, sampleArea.toFixed(3));
  const aRow = Math.min(sRow + 2, 8);
  put(aRow, Math.max(sCol - 3, 10), sampleAmount.toFixed(3));

  put(10, toCol(0) - 1, "0");
  const midX = Math.round(xMax / 2 / 10) * 10;
  put(10, toCol(midX) - 1, String(midX));
  put(10, toCol(xMax) - 1, String(Math.round(xMax)));
  put(11, toCol(midX) - 6, "Amount[ug/ml]");

  const IC = 40;
  [
    `${compoundName} at exp. RT: ${expRT.toFixed(3)}`,
    sigLabel,
    `Correlation:            ${Math.min(r, 0.99986).toFixed(5)}`,
    `Residual Std.  Dev.:   ${residStdDev.toFixed(5)}`,
    `Formula: y = mx + b`,
    `     m:      ${slope.toFixed(5)}`,
    ``,
    `     b:      ${intercept.toFixed(5)}`,
    `      x: Amount`,
    `      y: Area`,
  ].forEach((text, i) => { if (text) put(i, IC, text); });

  return grid.map(row => INDENT + row.join("").trimEnd());
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── ChemStation text parser ──────────────────────────────────────────────────

function parseChemStationBlock(text: string): {
  sample: Partial<SampleInfo>;
  detector: Partial<DetectorInfo>;
  newPeaks: Peak[];
} {
  const sample: Partial<SampleInfo> = {};
  const detector: Partial<DetectorInfo> = {};
  const newPeaks: Peak[] = [];
  let lastChangedCount = 0;
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^={3,}$/.test(line) || /^-{3,}$/.test(line)) continue;

    // Data File / Arquivo de dados
    const dfM = line.match(/^(?:Data\s*File|Arquivo\s+de\s+dados)\s+(.+)/i);
    if (dfM) { sample.dataFile = dfM[1].trim(); continue; }

    // Sample Name / Nome da amostra
    const snM = line.match(/^(?:Sample\s*Name|Nome\s+da\s+amostra)\s*:\s*(.+)/i);
    if (snM) { sample.sampleName = snM[1].trim(); continue; }

    // Acq Operator / Operador de aquisição (may share line with Seq Line)
    const opM = line.match(/(?:Acquisition\s+Operator|Operador\s+de\s+aquisi[çc][aã]o)\s*:\s*(\S+)/i);
    if (opM) sample.acqOperator = opM[1].trim();

    // Seq Line / Linha de sequência
    const seqM = line.match(/(?:Sequence\s*Line|Linha\s+de\s+sequ[eê]ncia)\s*:\s*(\S+)/i);
    if (seqM) sample.seqLine = seqM[1].trim();

    // Acq Instrument / Instrumento de aquisição
    const instrM = line.match(/(?:Acquisition\s+Instrument|Instrumento\s+de\s+aquisi[çc][aã]o)\s*:\s*(.+?)(?:\s{2,}|\s+(?:Location|Localiza[çc][aã]o)\s*:|$)/i);
    if (instrM) sample.acqInstrument = instrM[1].trim();

    // Location / Localização
    const locM = line.match(/(?:Location|Localiza[çc][aã]o)\s*:\s*(.+)/i);
    if (locM) sample.location = locM[1].trim();

    // Injection Date / Data da injeção
    const dateM = line.match(/(?:Injection\s*Date|Data\s+da\s+inje[çc][aã]o)\s*:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
    if (dateM) sample.injectionDate = dateM[1].trim();

    // Injection number / Injeção
    const injNM = line.match(/(?:^|[\s;,])(?:Injection|Inje[çc][aã]o)\s*:\s*(\d+)/i);
    if (injNM) sample.inj = injNM[1].trim();

    // Injection Volume / Volume injetado
    const volM = line.match(/(?:Injected\s*Volume|Volume\s+injetado)\s*:\s*([\d,\.]+\s*µl)/i);
    if (volM) sample.injVolume = volM[1].replace(',', '.').trim();

    // Acq Method / Método de aquisição
    const acqM = line.match(/^(?:Acquisition\s*Method|M[eé]todo\s+de\s+aquisi[çc][aã]o)\s*:\s*(.+)/i);
    if (acqM) { sample.acqMethod = acqM[1].trim(); continue; }

    // Analysis Method / Método de análise
    const anaM = line.match(/^(?:Analysis\s*Method|M[eé]todo\s+de\s+an[aá]lise)\s*:\s*(.+)/i);
    if (anaM) { sample.analysisMethod = anaM[1].trim(); continue; }

    // Last Changed / Última alteração (appears twice: acq then ana)
    const lcM = line.match(/(?:Last\s+Changed|[UÚ]ltima\s+altera[çc][aã]o)\s*:\s*(.+?)\s+(?:by|por)\s+(\S+)/i);
    if (lcM) {
      lastChangedCount++;
      const val = `${lcM[1].trim()} por ${lcM[2].trim()}`;
      if (lastChangedCount === 1) sample.lastChanged1 = val;
      else sample.lastChanged2 = val;
    }

    // Signal / Sinal: "DAD1 A, Sig=290,4 Ref=360,100"
    const sigM = line.match(/(?:Signal|Sinal)\s*\d*\s*:\s*(.+)/i);
    if (sigM) {
      const s = sigM[1].trim();
      const namePart = s.split(',')[0].trim();
      if (namePart) detector.signalName = namePart;
      const wM = s.match(/Sig=([0-9]+(?:[,\.][0-9]*)?)/i);
      const rM = s.match(/Ref=([0-9]+(?:[,\.][0-9]*)?)/i);
      if (wM) detector.sigWavelength = parseFloat(wM[1].replace(',', '.'));
      if (rM) detector.refWavelength = parseFloat(rM[1].replace(',', '.'));
    }

    // Peak row: "retTime peakType area [amtPerArea amount name]"
    // e.g. "2.431 VB 872.10504 3.92764e-2 34.25311 B6"
    const peakM = line.match(/^\s*([\d,\.]+)\s+([A-Z]{2,3})\s+([\d,\.]+(?:[eE][+-]?\d+)?)\s*(.*)?$/);
    if (peakM) {
      const rt = parseFloat(peakM[1].replace(',', '.'));
      const type = peakM[2].toUpperCase();
      const area = parseFloat(peakM[3].replace(',', '.'));
      if (rt > 0 && rt < 200 && area > 0) {
        const parts = (peakM[4] ?? '').trim().split(/\s+/).filter(Boolean);
        let amtPerArea = 0, amount = 0, name = '';
        if (parts.length >= 3) {
          const p0 = parseFloat(parts[0].replace(',', '.'));
          const p1 = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(p0) && !isNaN(p1)) { amtPerArea = p0; amount = p1; name = parts.slice(2).join(' '); }
          else { name = parts.join(' '); }
        } else if (parts.length === 2) {
          const p0 = parseFloat(parts[0].replace(',', '.'));
          const p1 = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(p0) && !isNaN(p1)) { amount = p1; }
          else if (!isNaN(p0)) { amount = p0; name = parts[1]; }
          else { name = parts.join(' '); }
        } else if (parts.length === 1) {
          const p0 = parseFloat(parts[0].replace(',', '.'));
          if (!isNaN(p0)) amount = p0; else name = parts[0];
        }
        newPeaks.push({
          id: uid(), name: name.trim(),
          peakType: ['BB','BV','VB','VV'].includes(type) ? type : 'BB',
          grp: '', retentionTime: rt, height: 200, width: 0.030, asymmetry: 1.1,
          amtPerArea, amount, manualArea: area, peakNoise: 0, printSelected: true,
        });
      }
    }
  }

  return { sample, detector, newPeaks };
}

function fmtSci2(n: number, exp: number) {
  // format as e.g. "3.92764e-2"
  const man = n / Math.pow(10, exp);
  const sign = exp < 0 ? "-" : "+";
  return `${man.toFixed(5)}e${sign}${Math.abs(exp)}`;
}

function fmtAmt(n: number) { return n.toFixed(5); }
function fmtArea(n: number) { return n.toFixed(5); }

// ─── Defaults ─────────────────────────────────────────────────────────────────

// ── Real B6 triplicata data (TESTE B6-290 2025-04-23 12-55-35, Vials 9-11) ──────
// Heights and widths derived from chromatogram visual + ChemStation area data.
// Non-quantified peaks: manualArea=0 (auto-calculated by Gaussian model).
// B6 peak uses exact area/amount from Sample A report.
const DEFAULT_PEAKS: Peak[] = [
  // Single example peak — configure o nome, TR e altura conforme o analito
  { id: uid(), name: "", retentionTime: 2.408, height: 750, width: 0.014, asymmetry: 1.22, peakType: "BB", manualArea: 0, amtPerArea: 0, amount: 0, grp: "", peakNoise: 0 },
];

const DEFAULT_SAMPLE: SampleInfo = {
  dataFile: "C:\\CHEM32\\1\\DATA\\TESTE B6-290 2025-04-23 12-55-35\\009-0901.D",
  signalLabelOverride: "",
  sampleName: "Amostra Atual A",
  acqOperator: "EDSON",
  seqLine: "9",
  acqInstrument: "Instrument 1",
  location: "Vial 9",
  injectionDate: "4/25/2025 12:25:09 PM",
  inj: "1",
  injVolume: "10.0 µl",
  acqMethod: "C:\\CHEM32\\1\\DATA\\TESTE B6-290 2025-04-23 12-55-35\\B6 TESTE 290.M",
  lastChanged1: "4/23/2025 8:27:30 AM by EDSON",
  analysisMethod: "C:\\CHEM32\\1\\METHODS\\B6.M",
  lastChanged2: "4/25/2025 9:51:12 AM by EDSON",
  reportDate: "4/26/2025 2:11:37 PM",
  softwareRev: "Agilent ChemStation for LC and LC/MS Systems  Rev. B.04.03 [16]  Copyright (c) Agilent Technologies",
};

const DEFAULT_DETECTOR: DetectorInfo = {
  signalName: "DAD1 A",
  sigWavelength: 290,
  sigBandwidth: 4,
  refWavelength: 360,
  refBandwidth: 100,
  runTime: 14,
  baselineNoise: 1.8,
  baselineDrift: 1.2,
  baselinePulse: 0.35,
  baselineWander: 0,
  shotNoise: 0,
  baselineHump: 0,
  broadeningFactor: 0,
  baselineOffset: 0,
  baselinePulseFreq: 1.6,
  baselineStartOffset: 0,
  baselineStartDecay: 1.0,
  baselineStep: 0,
  baselineStepRT: 0,
  gradientRamp: 0,
  spikeRate: 0,
  baselineDecay: 0,
  wanderFreq: 1.0,
  lineWidth: 1.0,
  yAxisAuto: true,
  yAxisMin: 0,
  yAxisMax: 2000,
};

const DEFAULT_STANDARDS: CalibStandard[] = [
  { id: uid(), level: 1, amount: 10, area: 296.16348 },
  { id: uid(), level: 2, amount: 25, area: 620.81195 },
  { id: uid(), level: 3, amount: 50, area: 1286.75647 },
  { id: uid(), level: 4, amount: 70, area: 1737.21973 },
  { id: uid(), level: 5, amount: 100, area: 2530.36230 },
];

const CALIB_AMOUNTS = [10, 25, 50, 70, 100];

function makeDefaultCompoundStandards(compound: ActiveCompound): CalibStandard[] {
  // If the compound has pre-registered standards, use them directly
  if (compound.defaultStandards && compound.defaultStandards.length > 0) {
    return compound.defaultStandards.map((s, i) => ({ ...s, id: `${compound.id}-std-${i + 1}`, level: i + 1 }));
  }
  // seed is deterministic per compound — same compound always gets the same "measured" areas
  const seed = compound.id.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0x7fffffff, 7);
  // noiseScale 2.5–5.5% → r typically 0.9978–0.9997 (realistic HPLC, never 1.00000)
  const noiseScale = 0.025 + Math.abs(pseudoNoise(seed % 1009 + 500)) * 0.030;
  const slope = compound.amtPerArea > 0 ? 1 / compound.amtPerArea : 25;
  // small, realistic intercept (0.3–1.1% of the smallest point)
  const intercept = slope * CALIB_AMOUNTS[0] * (0.003 + Math.abs(pseudoNoise(seed % 503)) * 0.008);
  return CALIB_AMOUNTS.map((amount, i) => {
    const baseArea = slope * amount + intercept;
    // Use two independent noise terms to break any residual linearity
    const e1 = pseudoNoise(i * 31  + (seed % 997));
    const e2 = pseudoNoise(i * 113 + (seed % 503) + 1500) * 0.4;
    const jitter = 1 + (e1 + e2) / 1.4 * noiseScale;
    const area = parseFloat((baseArea * jitter).toFixed(4));
    return { id: `${compound.id}-std-${i + 1}`, level: i + 1, amount, area: Math.max(1, area) };
  });
}

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
  relRefWindow: "5.000 %",
  absRefWindow: "0.000 min",
  relNonRefWindow: "5.000 %",
  absNonRefWindow: "0.000 min",
  uncalibratedPeaks: "not reported",
  partialCalibration: "Yes, identified peaks are recalibrated",
  correctAllRetTimes: "No, only for identified peaks",
  avgResponse: "Average all calibrations",
  avgRetentionTime: "Floating Average New 75%",
};

const DEFAULT_ACTIVE_COMPOUNDS: ActiveCompound[] = [
  {
    id: "cmp-b6", name: "B6", wavelength: 290, waveTol: 8,
    expectedRT: 2.408, rtTol: 0.15, typicalWidth: 0.014, typicalAsym: 1.22,
    amtPerArea: 3.95781e-2, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "B6 TESTE 290.M", notes: "Piridoxina HCl — C₈H₁₁NO₃·HCl  |  λ=290nm, Ref=360nm",
  },
  {
    id: "cmp-caffeine", name: "Cafeína", wavelength: 272, waveTol: 8,
    expectedRT: 3.52, rtTol: 0.20, typicalWidth: 0.030, typicalAsym: 1.10,
    amtPerArea: 0.02145, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "CAFF.M", notes: "Trimetilxantina — C₈H₁₀N₄O₂",
  },
  {
    id: "cmp-vitc", name: "Vitamina C", wavelength: 245, waveTol: 8,
    expectedRT: 1.85, rtTol: 0.15, typicalWidth: 0.028, typicalAsym: 1.15,
    amtPerArea: 0.03367, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "VIT_C.M", notes: "Ácido ascórbico — C₆H₈O₆  |  λ=245nm, slope≈29.7 mAU·s·mL/µg",
  },
  {
    id: "cmp-niac", name: "Niacinamida", wavelength: 261, waveTol: 8,
    expectedRT: 2.10, rtTol: 0.15, typicalWidth: 0.025, typicalAsym: 1.08,
    amtPerArea: 0.03321, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "B3.M", notes: "Vitamina B3 / nicotinamida — C₆H₆N₂O",
  },
  {
    id: "cmp-riboflavina", name: "Riboflavina", wavelength: 265, waveTol: 8,
    expectedRT: 4.20, rtTol: 0.20, typicalWidth: 0.035, typicalAsym: 1.18,
    amtPerArea: 0.01876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "B2.M", notes: "Vitamina B2 — C₁₇H₂₀N₄O₆",
  },
  {
    id: "cmp-folico", name: "Ácido Fólico", wavelength: 282, waveTol: 8,
    expectedRT: 5.50, rtTol: 0.25, typicalWidth: 0.040, typicalAsym: 1.30,
    amtPerArea: 0.02234, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "FOL.M", notes: "Vitamina B9 — C₁₉H₁₉N₇O₆",
  },
  {
    id: "cmp-vitd3", name: "Colecalciferol D3", wavelength: 264, waveTol: 10,
    expectedRT: 8.10, rtTol: 0.30, typicalWidth: 0.045, typicalAsym: 1.15,
    amtPerArea: 0.00985, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "VIT_D3.M", notes: "Vitamina D3 — C₂₇H₄₄O",
  },
  {
    id: "cmp-tiamina", name: "Tiamina", wavelength: 247, waveTol: 8,
    expectedRT: 1.50, rtTol: 0.15, typicalWidth: 0.026, typicalAsym: 1.12,
    amtPerArea: 0.03105, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "B1.M", notes: "Vitamina B1 — C₁₂H₁₇N₄OS",
  },
  {
    id: "cmp-biotina", name: "Biotina", wavelength: 200, waveTol: 8,
    expectedRT: 3.80, rtTol: 0.20, typicalWidth: 0.032, typicalAsym: 1.20,
    amtPerArea: 0.01543, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "BIOT.M", notes: "Vitamina B7 — C₁₀H₁₆N₂O₃S",
  },
  {
    id: "cmp-pantot", name: "Pantotenato de Cálcio", wavelength: 210, waveTol: 8,
    expectedRT: 2.70, rtTol: 0.18, typicalWidth: 0.028, typicalAsym: 1.10,
    amtPerArea: 0.02876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "B5.M", notes: "Vitamina B5 — C₁₈H₃₂CaN₂O₁₀",
  },

  // ─── AMINOÁCIDOS — AccQ•Tag C18 (Waters / AOAC 994.12) ─────────────────────
  // Ref: Cohen SA & De Antonis KM, J. Chromatogr. A 661 (1994) 25-34
  //      Waters AccQ-Tag Technical Guide (Waters Corp., Milford MA, 2012)
  //      AOAC Official Method 994.12: Amino Acids in Feeds
  // Coluna: AccQ-Tag C18 150×3.9mm 4µm | T=37°C | Fluxo 1.0 mL/min | λ=254nm
  // Eluente A: AccQ-Tag Eluent A | B: 60% MeCN / 40% H₂O (gradiente)
  {
    id: "cmp-asp", name: "Ácido Aspártico", wavelength: 254, waveTol: 8,
    expectedRT: 3.82, rtTol: 0.20, typicalWidth: 0.030, typicalAsym: 1.12,
    amtPerArea: 0.03215, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ASP.M", notes: "L-Asp — C₄H₇NO₄ (133.10 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-glu", name: "Ácido Glutâmico", wavelength: 254, waveTol: 8,
    expectedRT: 5.18, rtTol: 0.20, typicalWidth: 0.032, typicalAsym: 1.10,
    amtPerArea: 0.02987, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "GLU.M", notes: "L-Glu — C₅H₉NO₄ (147.13 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-asn", name: "Asparagina", wavelength: 254, waveTol: 8,
    expectedRT: 5.83, rtTol: 0.20, typicalWidth: 0.028, typicalAsym: 1.08,
    amtPerArea: 0.03054, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ASN.M", notes: "L-Asn — C₄H₈N₂O₃ (132.12 g/mol) | AccQ-Tag λ 254 nm | Waters TG",
  },
  {
    id: "cmp-ser", name: "Serina", wavelength: 254, waveTol: 8,
    expectedRT: 6.21, rtTol: 0.20, typicalWidth: 0.028, typicalAsym: 1.08,
    amtPerArea: 0.03102, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "SER.M", notes: "L-Ser — C₃H₇NO₃ (105.09 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-gln", name: "Glutamina", wavelength: 254, waveTol: 8,
    expectedRT: 6.72, rtTol: 0.20, typicalWidth: 0.030, typicalAsym: 1.10,
    amtPerArea: 0.02876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "GLN.M", notes: "L-Gln — C₅H₁₀N₂O₃ (146.15 g/mol) | AccQ-Tag λ 254 nm | Waters TG",
  },
  {
    id: "cmp-his", name: "Histidina", wavelength: 254, waveTol: 8,
    expectedRT: 7.12, rtTol: 0.22, typicalWidth: 0.030, typicalAsym: 1.15,
    amtPerArea: 0.02765, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "HIS.M", notes: "L-His (essencial) — C₆H₉N₃O₂ (155.16 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-gly", name: "Glicina", wavelength: 254, waveTol: 8,
    expectedRT: 7.75, rtTol: 0.20, typicalWidth: 0.027, typicalAsym: 1.07,
    amtPerArea: 0.03451, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "GLY.M", notes: "Gly — C₂H₅NO₂ (75.03 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-thr", name: "Treonina", wavelength: 254, waveTol: 8,
    expectedRT: 8.48, rtTol: 0.22, typicalWidth: 0.028, typicalAsym: 1.08,
    amtPerArea: 0.03312, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "THR.M", notes: "L-Thr (essencial) — C₄H₉NO₃ (119.12 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-arg", name: "Arginina", wavelength: 254, waveTol: 8,
    expectedRT: 9.22, rtTol: 0.22, typicalWidth: 0.032, typicalAsym: 1.18,
    amtPerArea: 0.02543, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ARG.M", notes: "L-Arg (cond. essencial) — C₆H₁₄N₄O₂ (174.20 g/mol) | AccQ-Tag λ 254 nm",
  },
  {
    id: "cmp-ala", name: "Alanina", wavelength: 254, waveTol: 8,
    expectedRT: 9.83, rtTol: 0.20, typicalWidth: 0.027, typicalAsym: 1.08,
    amtPerArea: 0.03678, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ALA.M", notes: "L-Ala — C₃H₇NO₂ (89.09 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-tyr", name: "Tirosina", wavelength: 254, waveTol: 8,
    expectedRT: 11.05, rtTol: 0.25, typicalWidth: 0.034, typicalAsym: 1.20,
    amtPerArea: 0.02234, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "TYR.M", notes: "L-Tyr — C₉H₁₁NO₃ (181.19 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-met", name: "Metionina", wavelength: 254, waveTol: 8,
    expectedRT: 12.48, rtTol: 0.25, typicalWidth: 0.032, typicalAsym: 1.15,
    amtPerArea: 0.02876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "MET.M", notes: "L-Met (essencial) — C₅H₁₁NO₂S (149.21 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-val", name: "Valina", wavelength: 254, waveTol: 8,
    expectedRT: 13.21, rtTol: 0.25, typicalWidth: 0.030, typicalAsym: 1.10,
    amtPerArea: 0.03124, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "VAL.M", notes: "L-Val (BCAA, essencial) — C₅H₁₁NO₂ (117.15 g/mol) | AccQ-Tag λ 254 nm",
  },
  {
    id: "cmp-phe", name: "Fenilalanina", wavelength: 254, waveTol: 8,
    expectedRT: 14.82, rtTol: 0.25, typicalWidth: 0.032, typicalAsym: 1.18,
    amtPerArea: 0.02198, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "PHE.M", notes: "L-Phe (essencial) — C₉H₁₁NO₂ (165.19 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-ile", name: "Isoleucina", wavelength: 254, waveTol: 8,
    expectedRT: 15.62, rtTol: 0.25, typicalWidth: 0.031, typicalAsym: 1.12,
    amtPerArea: 0.02943, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ILE.M", notes: "L-Ile (BCAA, essencial) — C₆H₁₃NO₂ (131.17 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-leu", name: "Leucina", wavelength: 254, waveTol: 8,
    expectedRT: 15.89, rtTol: 0.25, typicalWidth: 0.031, typicalAsym: 1.12,
    amtPerArea: 0.02886, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "LEU.M", notes: "L-Leu (BCAA, essencial) — C₆H₁₃NO₂ (131.17 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-lys", name: "Lisina", wavelength: 254, waveTol: 8,
    expectedRT: 17.35, rtTol: 0.25, typicalWidth: 0.035, typicalAsym: 1.22,
    amtPerArea: 0.02654, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "LYS.M", notes: "L-Lys (essencial) — C₆H₁₄N₂O₂ (146.19 g/mol) | AccQ-Tag λ 254 nm | AOAC 994.12",
  },
  {
    id: "cmp-trp", name: "Triptofano", wavelength: 280, waveTol: 8,
    expectedRT: 18.22, rtTol: 0.30, typicalWidth: 0.038, typicalAsym: 1.20,
    amtPerArea: 0.01876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "TRP.M", notes: "L-Trp (essencial) — C₁₁H₁₂N₂O₂ (204.23 g/mol) | RP-HPLC λ 280 nm sem derivatização | Ref: Mazzucco et al. 2014",
  },
  {
    id: "cmp-pro", name: "Prolina", wavelength: 254, waveTol: 8,
    expectedRT: 20.08, rtTol: 0.30, typicalWidth: 0.040, typicalAsym: 1.25,
    amtPerArea: 0.02112, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "PRO.M", notes: "L-Pro — C₅H₉NO₂ (115.13 g/mol) | AccQ-Tag (FMOC para iminoacid) λ 254 nm | Waters TG 2012",
  },
  {
    id: "cmp-cys", name: "Cisteína", wavelength: 254, waveTol: 8,
    expectedRT: 4.52, rtTol: 0.20, typicalWidth: 0.028, typicalAsym: 1.10,
    amtPerArea: 0.02987, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "CYS.M", notes: "L-Cys — C₃H₇NO₂S (121.16 g/mol) | AccQ-Tag como Cys-Cys λ 254 nm | AOAC 994.12",
  },

  // ─── MINERAIS — Cromatografia Iônica de Cátions (Metrohm AN-C-047) ─────────
  // Ref: Metrohm Application Note AN-C-047 "Nutritional cations in dietary supplements"
  //      Kolmonen M et al., Metrohm Monograph (2018)
  //      Dionex Technical Note TN-43 (cation IC with suppressed conductivity)
  // Coluna: Metrosep C 4 - 250/4.0 mm | T=25°C | Fluxo 0.9 mL/min
  // Eluente: 1.7 mM HNO₃ / 0.7 mM 2,6-diaminopiridine | Detecção: condutividade suprimida
  // Picos de metais pesados: pós-coluna PAR (4-(2-piridilazo)resorcinol) 520 nm
  {
    id: "cmp-na-ic", name: "Sódio (IC)", wavelength: 220, waveTol: 10,
    expectedRT: 3.12, rtTol: 0.20, typicalWidth: 0.065, typicalAsym: 1.15,
    amtPerArea: 0.05234, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "NA_IC.M", notes: "Na⁺ — 22.99 g/mol | IC-Cátion (Metrosep C4) + condutividade suprimida | AN-C-047 Metrohm",
  },
  {
    id: "cmp-k-ic", name: "Potássio (IC)", wavelength: 220, waveTol: 10,
    expectedRT: 5.48, rtTol: 0.22, typicalWidth: 0.070, typicalAsym: 1.18,
    amtPerArea: 0.04312, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "K_IC.M", notes: "K⁺ — 39.10 g/mol | IC-Cátion (Metrosep C4) + condutividade suprimida | AN-C-047 Metrohm",
  },
  {
    id: "cmp-mg-ic", name: "Magnésio (IC)", wavelength: 220, waveTol: 10,
    expectedRT: 6.81, rtTol: 0.25, typicalWidth: 0.060, typicalAsym: 1.18,
    amtPerArea: 0.04876, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "MG_IC.M", notes: "Mg²⁺ — 24.31 g/mol | IC-Cátion (Metrosep C4) + condutividade suprimida | AN-C-047 Metrohm",
  },
  {
    id: "cmp-ca-ic", name: "Cálcio (IC)", wavelength: 220, waveTol: 10,
    expectedRT: 8.52, rtTol: 0.28, typicalWidth: 0.065, typicalAsym: 1.20,
    amtPerArea: 0.04125, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "CA_IC.M", notes: "Ca²⁺ — 40.08 g/mol | IC-Cátion (Metrosep C4) + condutividade suprimida | AN-C-047 Metrohm",
  },
  {
    id: "cmp-mn-ic", name: "Manganês (IC)", wavelength: 520, waveTol: 10,
    expectedRT: 12.10, rtTol: 0.30, typicalWidth: 0.068, typicalAsym: 1.22,
    amtPerArea: 0.02567, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "MN_IC.M", notes: "Mn²⁺ — 54.94 g/mol | IC-Cátion + reagente pós-coluna PAR 520 nm | Metrohm AN-C-047",
  },
  {
    id: "cmp-fe-ic", name: "Ferro(II) (IC)", wavelength: 520, waveTol: 10,
    expectedRT: 14.45, rtTol: 0.32, typicalWidth: 0.072, typicalAsym: 1.28,
    amtPerArea: 0.02234, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "FE_IC.M", notes: "Fe²⁺ — 55.85 g/mol | IC + reagente pós-coluna PAR 520 nm | ASTM D6919 / Dionex TN-43",
  },
  {
    id: "cmp-cu-ic", name: "Cobre (IC)", wavelength: 520, waveTol: 10,
    expectedRT: 16.18, rtTol: 0.32, typicalWidth: 0.068, typicalAsym: 1.24,
    amtPerArea: 0.02345, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "CU_IC.M", notes: "Cu²⁺ — 63.55 g/mol | IC + reagente pós-coluna PAR 520 nm | Metrohm AN-C-047",
  },
  {
    id: "cmp-zn-ic", name: "Zinco (IC)", wavelength: 520, waveTol: 10,
    expectedRT: 17.82, rtTol: 0.35, typicalWidth: 0.075, typicalAsym: 1.25,
    amtPerArea: 0.01985, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "ZN_IC.M", notes: "Zn²⁺ — 65.38 g/mol | IC + reagente pós-coluna PAR 520 nm | Metrohm AN-C-047",
  },
  // Selênio: analisado como selenometionina por RP-HPLC-UV
  // Ref: Pedrero Z & Madrid Y, Anal. Chim. Acta 634 (2009) 135-152
  //      Coluna: C18 150×4.6mm | Eluente: 0.1% TFA / MeCN | λ=210nm | Fluxo 1.0 mL/min
  {
    id: "cmp-semet", name: "Selenometionina", wavelength: 210, waveTol: 8,
    expectedRT: 9.85, rtTol: 0.28, typicalWidth: 0.042, typicalAsym: 1.15,
    amtPerArea: 0.01756, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "SEMET.M", notes: "L-SeMet (Se orgânico) — C₅H₁₁NO₂Se (196.11 g/mol) | RP-HPLC-UV λ 210 nm | Pedrero & Madrid 2009",
  },
  // Cromo: analisado como complexo quelado por RP-HPLC com reagente DPTH
  // Ref: Sooksamiti P et al., Int. J. Anal. Chem. (2013); Metrohm App. Note IC
  {
    id: "cmp-cr-ic", name: "Cromo(III) (quelação)", wavelength: 540, waveTol: 10,
    expectedRT: 11.02, rtTol: 0.30, typicalWidth: 0.062, typicalAsym: 1.20,
    amtPerArea: 0.01543, units: "ug/ml", specMin: 0, specMax: 0,
    certifiedPurity: 99.5,
    method: "CR_IC.M", notes: "Cr³⁺ — 52.00 g/mol | Quelação-RP com DPTH + detecção visível 540 nm | Sooksamiti et al. 2013",
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

function ChromTooltip({ active, payload, peakStats }: {
  active?: boolean;
  payload?: { payload: { time: number; signal: number } }[];
  peakStats?: { retentionTime: number; name?: string; displayArea: number; width?: number }[];
}) {
  if (!active || !payload?.length) return null;
  const { time, signal } = payload[0].payload;
  // Find nearest peak and show its area if cursor is within ±1.5× half-width
  const nearest = peakStats?.reduce<{ rt: number; name?: string; area: number; dist: number; w: number } | null>((best, p) => {
    const dist = Math.abs(p.retentionTime - time);
    if (!best || dist < best.dist) return { rt: p.retentionTime, name: p.name, area: p.displayArea, dist, w: p.width ?? 0.5 };
    return best;
  }, null);
  const showArea = nearest && nearest.dist <= nearest.w * 1.5;
  return (
    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px", lineHeight: 1.6 }}>
      <div>{time.toFixed(3)} min</div>
      <div>{signal.toFixed(3)} mAU</div>
      {showArea && (
        <div style={{ color: "#1560bd", fontWeight: "bold" }}>
          Area: {nearest.area.toFixed(5)} mAU·s{nearest.name ? ` — ${nearest.name}` : ""}
        </div>
      )}
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
  const color = dragging ? "#e05" : "#1560bd";
  // Anchor y just below the top of the chart margin (margin.top = 75).
  // Labels extend UPWARD from here.  maxH caps how far up they go so they
  // never escape the margin area or overlap the signal-label overlay at top≈3.
  const ay = y - 6;
  // Leave the top 18 px for the signal-label overlay, so maxH ≤ ay - 18.
  const maxH = Math.max(ay - 18, 20);

  // RT string is always ~8 chars; name can be long — both are clamped to maxH.
  const rtStr = rt.toFixed(3);
  const rtNatural = rtStr.length * 5.5;
  const rtLen = Math.min(rtNatural, maxH);

  const nameNatural = (name?.length ?? 0) * 5.5;
  const nameLen = Math.min(nameNatural, maxH);

  return (
    <g>
      {/* RT number — vertical, leftmost column above the peak line */}
      <text
        x={x + 3} y={ay}
        textAnchor="start"
        transform={`rotate(-90, ${x + 3}, ${ay})`}
        textLength={rtLen}
        lengthAdjust="spacingAndGlyphs"
        style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, fill: dragging ? "#e05" : "#666", pointerEvents: "none" }}
      >
        {rtStr}
      </text>
      {/* Compound name — vertical, second column to the right of RT */}
      {name && (
        <text
          x={x + 14} y={ay}
          textAnchor="start"
          transform={`rotate(-90, ${x + 14}, ${ay})`}
          textLength={nameLen}
          lengthAdjust="spacingAndGlyphs"
          style={{ fontFamily: "Courier New, monospace", fontSize: 9, fill: color, fontWeight: "bold", pointerEvents: "none" }}
        >
          {name}
        </text>
      )}
    </g>
  );
}

// ─── Peak editor ──────────────────────────────────────────────────────────────

const PEAK_NUM_KEYS: (keyof Peak)[] = ["retentionTime", "height", "width", "asymmetry", "manualArea", "amtPerArea", "amount", "peakNoise", "inclination", "purityPct"];

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

function PeakEditorDialog({ peak, onSave, onPreview, children, controlledOpen, onControlledClose, calibData }: {
  peak: Peak; onSave: (p: Peak) => void; onPreview?: (p: Peak) => void; children?: React.ReactNode;
  controlledOpen?: boolean; onControlledClose?: () => void;
  calibData?: { compoundName: string; standards: CalibStandard[]; onUpdate: (s: CalibStandard[]) => void };
}) {
  const [draft, setDraft] = useState<Record<keyof Peak, string>>(() => peakToStrings(peak));
  const [localCalibStds, setLocalCalibStds] = useState<CalibStandard[]>([]);
  const [internalOpen, setInternalOpen] = useState(false);
  // Draggable position — null means use default Radix centering
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) { if (!v) onControlledClose?.(); }
    else setInternalOpen(v);
  };
  useEffect(() => {
    if (isControlled && controlledOpen) {
      setDraft(peakToStrings(peak));
      if (calibData) setLocalCalibStds([...calibData.standards]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledOpen]);

  // Live preview — propagate every draft change to the parent so the
  // chromatogram updates in real-time without requiring a Save click.
  useEffect(() => {
    if (!open || !onPreview) return;
    onPreview(stringsToPeak(peak, draft));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, open]);

  const field = (key: keyof Peak) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (key === "amount") {
      // Back-calculate purityPct and manualArea from the typed amount
      setDraft(d => {
        const livePeak = stringsToPeak(peak, d);
        const computed = computeArea(livePeak);
        const amt = parseFloat(val) || 0;
        const rf = parseFloat(d.amtPerArea as string) || 0;
        if (amt > 0 && rf > 0 && computed > 0) {
          const newPurity = (amt / (computed * rf)) * 100;
          const newManualArea = amt / rf;
          return {
            ...d,
            amount: val,
            purityPct: String(parseFloat(newPurity.toFixed(4))),
            manualArea: String(parseFloat(newManualArea.toFixed(5))),
          };
        }
        return { ...d, [key]: val };
      });
    } else {
      setDraft(d => ({ ...d, [key]: val }));
    }
  };

  // ── Drag-to-move via the title bar ──────────────────────────────────────────
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // don't drag on close button
    e.preventDefault();
    const current = pos ?? {
      x: window.innerWidth  / 2 - 160,
      y: window.innerHeight / 2 - 250,
    };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };
    const handleMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (me.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (me.clientY - dragRef.current.startY),
      });
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const noiseVal  = parseFloat(draft.peakNoise  as string) || 0;
  const heightVal = parseFloat(draft.height     as string) || 100;
  const widthVal  = parseFloat(draft.width      as string) || 0.10;
  const asymVal   = parseFloat(draft.asymmetry  as string) || 1.0;
  const inclVal   = parseFloat(draft.inclination as string) || 0;
    const emgTauVal  = parseFloat(draft.emgTau   as string) || 0;
    const overloadVal = parseFloat(draft.overload as string) || 0;
    const flatTopVal  = parseFloat(draft.flatTop  as string) || 0;

  const openDialog = () => { setDraft(peakToStrings(peak)); setInternalOpen(true); };
  const trigger = children ? React.cloneElement(
    React.Children.only(children) as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
    { onClick: openDialog },
  ) : null;

  // Position override — placed precisely, no Radix centering transform
  const posStyle: React.CSSProperties = pos ? {
    position: "fixed",
    top:  Math.max(10, Math.min(pos.y, window.innerHeight - 80)),
    left: Math.max(10, Math.min(pos.x, window.innerWidth  - 340)),
    transform: "none",
    margin: 0,
  } : {};

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-xs overflow-y-auto max-h-[90vh]"
        style={posStyle}
      >
        {/* Draggable header — cursor changes to indicate grab */}
        <DialogHeader
          onMouseDown={handleDragStart}
          style={{ cursor: pos ? "grabbing" : "grab", userSelect: "none" }}
        >
          <DialogTitle style={{ fontFamily: "Courier New, monospace", fontSize: 13 }}>
            ≡ Edit Peak
          </DialogTitle>
          <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 0 }}>
            Drag this header to move the panel
          </p>
        </DialogHeader>

        <form onSubmit={e => { e.preventDefault(); onSave(stringsToPeak(peak, draft)); if (calibData) calibData.onUpdate(localCalibStds); setOpen(false); }} className="space-y-2 pt-1">
          {([
            ["name", "Name (ex: B6)", "text"],
            ["retentionTime", "Ret. Time [min]", "number"],
            ["peakType", "Type (VB/BB/BV/BB)", "text"],
            ["manualArea", "Area [mAU*s] (0 = computed)", "number"],
            ["amtPerArea", "Amt/Area (ex: 0.03927)", "number"],
            ["amount", "Amount [ug/ml]", "number"],
            ["grp", "Group", "text"],
          ] as [keyof Peak, string, string][]).map(([k, label, type]) => (
            <div key={k} className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type={type} step="any"
                value={draft[k]}
                onChange={field(k)}
                className="h-7 text-xs font-mono"
              />
              {k === "manualArea" && (() => {
                const livePeak = stringsToPeak(peak, draft);
                const computed = computeArea(livePeak);
                const manVal = parseFloat(draft.manualArea as string) || 0;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#6b7280" }}>Computed:</span>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, fontWeight: 700, color: manVal > 0 ? "#9ca3af" : "#1d4ed8" }}>
                      {computed.toFixed(5)} mAU·s
                    </span>
                    {manVal === 0 && (
                      <button type="button"
                        style={{ fontSize: 8, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 5px", cursor: "pointer", color: "#3b82f6", fontFamily: "Courier New, monospace" }}
                        onClick={() => setDraft(d => ({ ...d, manualArea: computed.toFixed(5) }))}>
                        ← Use
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}

          {/* ── Pureza do ativo ─────────────────────────────────── */}
          {(() => {
            const purityVal = parseFloat(draft.purityPct as string) || 0;
            return (
              <div className="space-y-0.5 pt-1">
                <Label className="text-xs text-muted-foreground">Pureza do ativo (%) — opcional</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  placeholder="100 — ex: 99.5 ou 105 (overage)"
                  value={purityVal > 0 ? String(purityVal) : ""}
                  onChange={e => {
                    const newPurity = parseFloat(e.target.value) || 0;
                    setDraft(d => {
                      const livePeak = stringsToPeak(peak, d);
                      const computed = computeArea(livePeak);
                      // purity 100 or blank → manualArea = 0 (use computed)
                      const newManualArea = newPurity > 0 && newPurity !== 100
                        ? parseFloat((computed * newPurity / 100).toFixed(5))
                        : 0;
                      // Back-calculate displayed amount
                      const rf = parseFloat(d.amtPerArea as string) || 0;
                      const newAmount = rf > 0
                        ? parseFloat(((newPurity > 0 ? newManualArea || computed : computed) * rf).toFixed(5))
                        : parseFloat(d.amount as string) || 0;
                      return {
                        ...d,
                        purityPct: e.target.value,
                        manualArea: String(newManualArea),
                        amount: String(newAmount),
                      };
                    });
                  }}
                  className="h-7 text-xs font-mono"
                />
                {purityVal > 0 && purityVal < 100 && (
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#d97706", marginTop: 2 }}>
                    ⚠ {(100 - purityVal).toFixed(2)}% impurezas — a área será corrigida ao capturar na aba Standard
                  </div>
                )}
                {purityVal === 0 && (
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
                    Deixe em branco = sem correção (equivale a 100%)
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Altura slider ─────────────────────────────────── */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs text-muted-foreground">Peak Height (mAU)</Label>
              <input type="number" step="1" min="1" max="10000" value={heightVal}
                onChange={e => setDraft(d => ({ ...d, height: e.target.value }))}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
              />
            </div>
            <input type="range" min="1" max="10000" step="1"
              value={heightVal}
              onChange={e => setDraft(d => ({ ...d, height: e.target.value }))}
              className="w-full h-2 accent-blue-600" />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 1 }}>
              <span>1 mAU</span><span>10000 mAU</span>
            </div>
          </div>

          {/* ── Largura slider ────────────────────────────────── */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs text-muted-foreground">Width σ (min)</Label>
              <input type="number" step="any" min="0.001" max="5.0" value={widthVal}
                onChange={e => setDraft(d => ({ ...d, width: e.target.value }))}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
              />
            </div>
            <input type="range" min="0.005" max="5.0" step="0.005"
              value={widthVal}
              onChange={e => setDraft(d => ({ ...d, width: e.target.value }))}
              className="w-full h-2 accent-blue-600" />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 1 }}>
              <span>0.005 = narrow</span><span>5.0 = very wide</span>
            </div>
          </div>

          {/* ── Assimetria slider ─────────────────────────────── */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs text-muted-foreground">Asymmetry (tailing/fronting)</Label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#1d4ed8" }}>
                    {asymVal < 0.99 ? "← front." : asymVal > 1.01 ? "→ tail." : "symm."}
                  </span>
                  <input type="number" step="0.01" min="0.1" max="10.0" value={asymVal}
                onChange={e => setDraft(d => ({ ...d, asymmetry: e.target.value }))}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
              />
                </div>
            </div>
            <input type="range" min="0.1" max="10.0" step="0.01"
              value={asymVal}
              onChange={e => setDraft(d => ({ ...d, asymmetry: e.target.value }))}
              className="w-full h-2 accent-blue-600" />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 1 }}>
              <span>← fronting 0.1</span><span>tailing 10.0 →</span>
            </div>
          </div>

          {/* ── Inclinação slider ─────────────────────────────── */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs text-muted-foreground">Peak Tilt</Label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#1d4ed8" }}>
                    {inclVal === 0 ? "—" : inclVal > 0 ? "→" : "←"}
                  </span>
                  <input type="number" step="0.1" min="-5" max="5" value={inclVal}
                onChange={e => setDraft(d => ({ ...d, inclination: e.target.value }))}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
              />
                </div>
            </div>
            <input type="range" min="-5" max="5" step="0.1"
              value={inclVal}
              onChange={e => setDraft(d => ({ ...d, inclination: e.target.value }))}
              className="w-full h-2 accent-blue-600" />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 1 }}>
              <span>← tilts left</span><span>tilts right →</span>
            </div>
          </div>

          {/* ── Rugosidade slider ─────────────────────────────── */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs text-muted-foreground">Peak Roughness</Label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#1d4ed8" }}>
                    {noiseVal === 0 ? "perfect" : noiseVal < 0.3 ? "light" : noiseVal < 0.65 ? "mod." : "heavy"}
                  </span>
                  <input type="number" step="0.01" min="0" max="1" value={noiseVal}
                onChange={e => setDraft(d => ({ ...d, peakNoise: e.target.value }))}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
              />
                </div>
            </div>
            <input type="range" min="0" max="1" step="0.01"
              value={noiseVal}
              onChange={e => setDraft(d => ({ ...d, peakNoise: e.target.value }))}
              className="w-full h-2 accent-blue-600" />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 1 }}>
              <span>0 = Gaussiano perfeito</span><span>1 = extremamente rugoso</span>
            </div>
          </div>

            {/* EMG Tau */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                <span>Cauda EMG — τ (min)</span>
                <input type="number" step="0.005" min="0" max="2" value={emgTauVal}
                  onChange={e => setDraft(d => ({ ...d, emgTau: e.target.value }))}
                  style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                />
              </div>
              <input
                type="range" min="0" max="2" step="0.005"
                value={emgTauVal}
                onChange={e => setDraft(d => ({ ...d, emgTau: e.target.value }))}
                className="w-full h-2 accent-blue-600"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                <span>0 = Gaussiano puro</span><span>2 = cauda exponencial severa</span>
              </div>
            </div>

            {/* Column Overload */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                <span>Sobrecarga de coluna</span>
                <input type="number" step="1" min="0" max="100" value={(overloadVal * 100).toFixed(0)}
                  onChange={e => setDraft(d => ({ ...d, overload: String(parseFloat(e.target.value) / 100 || 0) }))}
                  style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                />
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={overloadVal}
                onChange={e => setDraft(d => ({ ...d, overload: e.target.value }))}
                className="w-full h-2 accent-blue-600"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                <span>0% = coluna ideal</span><span>100% = saturaç. da fase estac.</span>
              </div>
            </div>

            {/* Flat Top / Detector Saturation */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                <span>Saturação do detector</span>
                <input type="number" step="1" min="0" max="100" value={(flatTopVal * 100).toFixed(0)}
                  onChange={e => setDraft(d => ({ ...d, flatTop: String(parseFloat(e.target.value) / 100 || 0) }))}
                  style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 70, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                />
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={flatTopVal}
                onChange={e => setDraft(d => ({ ...d, flatTop: e.target.value }))}
                className="w-full h-2 accent-blue-600"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                <span>0% = linear</span><span>100% = pico totalmente chato</span>
              </div>
            </div>

          <p className="text-xs text-muted-foreground pt-1">
            Area = 0 → computed automatically.<br />
            Area &gt; 0 → exact value used in report.
          </p>

          {/* ── Calibration Curve Data — editable, matches the report chart ── */}
          {calibData && (
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", marginBottom: 5, color: "#1e3a5f" }}>
                📈 Calibration — {calibData.compoundName}
              </div>
              {(() => {
                const reg = localCalibStds.length >= 2
                  ? linearRegression(localCalibStds.map(s => ({ x: s.amount, y: s.area })))
                  : null;
                return (
                  <>
                    {reg && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#374151", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 3, padding: "4px 7px", marginBottom: 6 }}>
                        <div>f(x) = <b>{reg.slope.toFixed(5)}</b> × x + <b>{reg.intercept.toFixed(3)}</b></div>
                        <div>R² = <b>{Math.min(reg.r * reg.r, 0.99972).toFixed(7)}</b> | R = {Math.min(reg.r, 0.99986).toFixed(7)}</div>
                        <div style={{ color: "#6b7280", fontSize: 8, marginTop: 2 }}>RSS = {(localCalibStds.reduce((acc, s) => acc + Math.pow(s.area - (reg.slope * s.amount + reg.intercept), 2), 0)).toFixed(3)}</div>
                      </div>
                    )}
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 1fr 18px", gap: 3, color: "#6b7280", marginBottom: 3, fontWeight: "bold" }}>
                        <div>#</div><div>Conc. [µg/ml]</div><div>Area [mAU·s]</div><div></div>
                      </div>
                      {localCalibStds.map((std, idx) => {
                        const predicted = reg ? reg.slope * std.amount + reg.intercept : null;
                        return (
                          <div key={std.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 1fr 18px", gap: 3, alignItems: "center" }}>
                              <div style={{ color: "#6b7280", fontSize: 8 }}>{idx + 1}</div>
                              <input type="number" step="any" value={std.amount}
                                onChange={e => setLocalCalibStds(prev => prev.map((s, i) => i === idx ? { ...s, amount: parseFloat(e.target.value) || 0 } : s))}
                                style={{ fontFamily: "Courier New, monospace", fontSize: 9, border: "1px solid #d1d5db", borderRadius: 3, padding: "2px 4px", width: "100%" }} />
                              <input type="number" step="any" value={std.area}
                                onChange={e => setLocalCalibStds(prev => prev.map((s, i) => i === idx ? { ...s, area: parseFloat(e.target.value) || 0 } : s))}
                                style={{ fontFamily: "Courier New, monospace", fontSize: 9, border: "1px solid #d1d5db", borderRadius: 3, padding: "2px 4px", width: "100%" }} />
                              <button type="button"
                                style={{ fontSize: 10, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                                onClick={() => setLocalCalibStds(prev => prev.filter((_, i) => i !== idx))}>×</button>
                            </div>
                            {predicted !== null && (
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 7.5, color: "#9ca3af", paddingLeft: 22, marginTop: 1 }}>
                                pred: {predicted.toFixed(3)}  Δ: {(std.area - predicted).toFixed(3)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button type="button"
                        style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#3b82f6", background: "none", border: "1px dashed #93c5fd", borderRadius: 3, padding: "2px 8px", cursor: "pointer", marginTop: 2, width: "100%" }}
                        onClick={() => setLocalCalibStds(prev => [...prev, { id: String(Date.now()), level: prev.length + 1, amount: 0, area: 0 }])}>
                        + Add Level
                      </button>
                    </div>
                    {localCalibStds.length >= 2 && reg && (() => {
                      const w = 230, h = 110, mL = 34, mR = 6, mT = 6, mB = 22;
                      const xMax = Math.max(...localCalibStds.map(s => s.amount)) * 1.12 || 1;
                      const yMax = Math.max(...localCalibStds.map(s => s.area)) * 1.18 || 1;
                      const xs2 = (v: number) => mL + (v / xMax) * (w - mL - mR);
                      const ys2 = (v: number) => mT + (h - mT - mB) - (Math.min(Math.max(v, 0), yMax) / yMax) * (h - mT - mB);
                      const fY = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);
                      const yT = [0, 0.33, 0.67, 1].map(f => yMax * f);
                      const xT = [0, 0.33, 0.67, 1].map(f => xMax * f);
                      return (
                        <svg width={w} height={h} style={{ display: "block", marginTop: 8, fontFamily: "Courier New, monospace", overflow: "visible" }}>
                          <line x1={mL} y1={mT} x2={mL} y2={h - mB} stroke="#888" strokeWidth={1} />
                          <line x1={mL} y1={h - mB} x2={w - mR} y2={h - mB} stroke="#888" strokeWidth={1} />
                          {yT.map((t, i) => (<g key={i}><line x1={mL - 3} y1={ys2(t)} x2={mL} y2={ys2(t)} stroke="#e0e0e0" strokeWidth={0.8} /><text x={mL - 5} y={ys2(t) + 3} textAnchor="end" fontSize={6.5} fill="#666">{fY(t)}</text></g>))}
                          {xT.map((t, i) => (<g key={i}><line x1={xs2(t)} y1={h - mB} x2={xs2(t)} y2={h - mB + 3} stroke="#e0e0e0" strokeWidth={0.8} /><text x={xs2(t)} y={h - mB + 10} textAnchor="middle" fontSize={6.5} fill="#666">{Math.round(t)}</text></g>))}
                          <line x1={xs2(0)} y1={ys2(Math.max(0, reg.intercept))} x2={xs2(xMax)} y2={ys2(reg.slope * xMax + reg.intercept)} stroke="#1d4ed8" strokeWidth={1.4} />
                          {localCalibStds.map((s, i) => { const yP = ys2(reg.slope * s.amount + reg.intercept); const yA = ys2(s.area); return Math.abs(yP - yA) > 1 ? <line key={i} x1={xs2(s.amount)} y1={yA} x2={xs2(s.amount)} y2={yP} stroke="#94a3b8" strokeDasharray="2 1" strokeWidth={0.8} /> : null; })}
                          {localCalibStds.map((s, i) => (<g key={i}><circle cx={xs2(s.amount)} cy={ys2(s.area)} r={3.5} fill="#1d4ed8" stroke="white" strokeWidth={1} /><text x={xs2(s.amount)} y={ys2(s.area) - 5} textAnchor="middle" fontSize={6.5} fill="#1d4ed8">{i + 1}</text></g>))}
                          <text x={mL + (w - mL - mR) / 2} y={h - 3} textAnchor="middle" fontSize={6.5} fill="#555">Amount [µg/ml]</text>
                          <text x={7} y={(h - mT - mB) / 2 + mT} textAnchor="middle" fontSize={6.5} fill="#555" transform={`rotate(-90,7,${(h - mT - mB) / 2 + mT})`}>Area</text>
                        </svg>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" size="sm"
              onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" size="sm">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
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
  "typicalAsym", "amtPerArea", "specMin", "specMax", "certifiedPurity",
  "anvisaMinMg", "anvisaMaxMg", "stdArea", "stdAmountUg",
];

// ─── ANVISA IN 28/2018 — banco de faixas por composto ─────────────────────────
// Tolerância padrão ANVISA: 80% (mín) a 150% (máx) do valor declarado no rótulo
// Ref: ANVISA Instrução Normativa nº 28/2018 + RDC 269/2005
const ANVISA_IN28_DB: Array<{
  compoundId: string;
  name: string;
  labelMg: number;   // valor típico declarado (mg) — referência
  minMg: number;     // limite mínimo ANVISA (mg) = 80 % do declarado
  maxMg: number;     // limite máximo ANVISA (mg) = 150 % do declarado
  norm: string;
}> = [
  { compoundId: "cmp-vitc",        name: "Vitamina C — Ácido Ascórbico",  labelMg: 500.000, minMg: 400.000, maxMg: 750.000,  norm: "IN 28/2018" },
  { compoundId: "cmp-b6",          name: "Vitamina B6 — Piridoxina HCl",  labelMg:   3.500, minMg:   2.800, maxMg:   5.250,  norm: "IN 28/2018" },
  { compoundId: "cmp-vitd3",       name: "Vitamina D3 — Colecalciferol",  labelMg:   0.010, minMg:   0.008, maxMg:   0.015,  norm: "IN 28/2018" },
  { compoundId: "cmp-niac",        name: "Niacinamida — Vitamina B3",     labelMg:  16.000, minMg:  12.800, maxMg:  24.000,  norm: "IN 28/2018" },
  { compoundId: "cmp-riboflavina", name: "Riboflavina — Vitamina B2",     labelMg:   3.250, minMg:   2.600, maxMg:   4.875,  norm: "IN 28/2018" },
  { compoundId: "cmp-folico",      name: "Ácido Fólico — Vitamina B9",    labelMg:   0.400, minMg:   0.320, maxMg:   0.600,  norm: "IN 28/2018" },
  { compoundId: "cmp-tiamina",     name: "Tiamina — Vitamina B1",         labelMg:   3.000, minMg:   2.400, maxMg:   4.500,  norm: "IN 28/2018" },
  { compoundId: "cmp-biotina",     name: "Biotina — Vitamina B7",         labelMg:   0.045, minMg:   0.036, maxMg:   0.0675, norm: "IN 28/2018" },
  { compoundId: "cmp-pantot",      name: "Pantotenato de Cálcio — B5",    labelMg:  12.500, minMg:  10.000, maxMg:  18.750,  norm: "IN 28/2018" },
  { compoundId: "cmp-caffeine",    name: "Cafeína",                       labelMg: 200.000, minMg: 160.000, maxMg: 300.000,  norm: "IN 28/2018" },
];

function compoundToStrings(c: ActiveCompound): Record<keyof ActiveCompound, string> {
  return Object.fromEntries(
    Object.entries(c)
      .filter(([k]) => k !== "defaultStandards")
      .map(([k, v]) => [k, v !== undefined ? String(v) : ""])
  ) as Record<keyof ActiveCompound, string>;
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
  // Optional string fields
  if (s.anvisaNorm !== undefined && s.anvisaNorm !== "undefined" && s.anvisaNorm !== "") result.anvisaNorm = s.anvisaNorm;
  return result;
}

function ActiveCompoundDialog({ compound, onSave, children }: {
  compound: ActiveCompound; onSave: (c: ActiveCompound) => void; children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Record<keyof ActiveCompound, string>>(() => compoundToStrings(compound));
  const [stdDraft, setStdDraft] = useState<CalibStandard[]>(() =>
    compound.defaultStandards && compound.defaultStandards.length > 0
      ? compound.defaultStandards
      : makeDefaultCompoundStandards(compound)
  );
  const [open, setOpen] = useState(false);
  const field = (key: keyof ActiveCompound) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [key]: e.target.value }));
  const regenStds = (amtPerAreaStr: string) => {
    const amtPerArea = parseFloat(amtPerAreaStr) || compound.amtPerArea;
    const tmp = makeDefaultCompoundStandards({ ...compound, amtPerArea, defaultStandards: undefined });
    setStdDraft(tmp);
  };
  return (
    <Dialog open={open} onOpenChange={v => {
      setOpen(v);
      if (v) {
        setDraft(compoundToStrings(compound));
        setStdDraft(compound.defaultStandards && compound.defaultStandards.length > 0
          ? compound.defaultStandards
          : makeDefaultCompoundStandards(compound));
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm flex flex-col" style={{ maxHeight: "92vh" }}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle style={{ fontFamily: "Courier New, monospace" }}>
            {compound.name || "New Compound"}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
        <form onSubmit={e => { e.preventDefault(); onSave({ ...stringsToCompound(compound, draft), defaultStandards: stdDraft }); setOpen(false); }} className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
          {/* Compound name */}
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground font-mono">Compound Name</Label>
            <Input type="text" value={draft.name} onChange={field("name")} className="h-7 text-xs font-mono" />
          </div>

          {/* ── Certified purity — campo em destaque ── */}
          <div className="col-span-2" style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 6, padding: "10px 12px", marginTop: 2 }}>
            <Label className="text-xs font-mono font-bold" style={{ color: "#92400e" }}>
              Certified purity (%) — padrão de referência
            </Label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={draft.certifiedPurity}
                onChange={field("certifiedPurity")}
                className="h-8 text-sm font-mono font-bold"
                style={{ maxWidth: 120, fontSize: 15, fontWeight: "bold" }}
              />
              <span style={{ fontFamily: "Courier New, monospace", fontSize: 13, color: "#92400e", fontWeight: "bold" }}>%</span>
              <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#b45309" }}>
                (ex: 99.50 · valor do CoA)
              </span>
            </div>
            {(() => {
              const v = parseFloat(draft.certifiedPurity) || 0;
              const color = v >= 99 ? "#166534" : v >= 95 ? "#713f12" : "#b91c1c";
              const bg    = v >= 99 ? "#dcfce7"  : v >= 95 ? "#fef9c3"  : "#fee2e2";
              const label = v >= 99 ? "Padrão primário (≥ 99%)" : v >= 95 ? "Padrão secundário (95–99%)" : v > 0 ? "Atenção: pureza baixa" : "";
              return v > 0 ? (
                <div style={{ marginTop: 5, display: "inline-block", background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontFamily: "Courier New, monospace", fontWeight: "bold" }}>
                  {label}
                </div>
              ) : null;
            })()}
          </div>

          {/* Demais campos técnicos */}
          {([
            ["notes",        "Notes / Formula",          "text",   "col-span-2"],
            ["method",       "Método (.M)",             "text",   "col-span-2"],
            ["wavelength",   "λ Signal (nm)",           "number", ""],
            ["waveTol",      "±Tol λ (nm)",             "number", ""],
            ["expectedRT",   "Expected RT (min)",       "number", ""],
            ["rtTol",        "±Tol RT (min)",           "number", ""],
            ["amtPerArea",   "Amt/Area (ug/ml/mAU*s)",  "number", "col-span-2"],
            ["units",        "Units",                   "text",   ""],
            ["typicalWidth", "Width σ (min)",           "number", ""],
            ["typicalAsym",  "Asymmetry",               "number", ""],
            ["specMin",      "Spec Min (ug/ml, 0=N/A)", "number", ""],
            ["specMax",      "Spec Max (ug/ml, 0=N/A)", "number", ""],
          ] as [keyof ActiveCompound, string, string, string][]).map(([k, label, type, cls]) => (
            <div key={k} className={cls || ""}>
              <Label className="text-xs text-muted-foreground font-mono">{label}</Label>
              <Input type={type} step="any" value={draft[k]}
                onChange={field(k)} className="h-7 text-xs font-mono" />
            </div>
          ))}

          {/* ── Reference Standard — Standard Area + Injected Amount ── */}
          <div className="col-span-2" style={{ background: "#f0fdf4", border: "2px solid #86efac", borderRadius: 6, padding: "10px 12px", marginTop: 4 }}>
            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", color: "#166534", marginBottom: 8, letterSpacing: "0.04em" }}>
              📊 REFERENCE STANDARD — Valores do Padrão de Referência
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <Label className="text-xs font-mono" style={{ color: "#15803d" }}>
                  Standard Area (mAU·s)
                </Label>
                <Input
                  type="number" step="0.00001" min="0"
                  value={draft.stdArea && draft.stdArea !== "0" ? draft.stdArea : ""}
                  onChange={field("stdArea")}
                  placeholder="ex: 933.65940"
                  className="h-7 text-xs font-mono"
                />
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  Área do pico do padrão puro
                </div>
              </div>
              <div>
                <Label className="text-xs font-mono" style={{ color: "#15803d" }}>
                  Injected Amount (µg)
                </Label>
                <Input
                  type="number" step="0.00001" min="0"
                  value={draft.stdAmountUg && draft.stdAmountUg !== "0" ? draft.stdAmountUg : ""}
                  onChange={field("stdAmountUg")}
                  placeholder="ex: 50.31663"
                  className="h-7 text-xs font-mono"
                />
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  µg injetado (do CoA do padrão)
                </div>
              </div>
            </div>
            {(() => {
              const sa = parseFloat(draft.stdArea || "0") || 0;
              const am = parseFloat(draft.stdAmountUg || "0") || 0;
              if (sa > 0 && am > 0) {
                return (
                  <div style={{ marginTop: 6, fontFamily: "Courier New, monospace", fontSize: 9, color: "#166534", background: "#dcfce7", borderRadius: 4, padding: "3px 8px", display: "inline-block" }}>
                    ✓ Salvo: {sa.toFixed(5)} mAU·s · {am.toFixed(5)} µg
                  </div>
                );
              }
              return (
                <div style={{ marginTop: 6, fontFamily: "Courier New, monospace", fontSize: 9, color: "#92400e" }}>
                  Preencha para usar atalho automático no Reference Standard card
                </div>
              );
            })()}
          </div>

          {/* ── ANVISA IN 28/2018 ── */}
          <div className="col-span-2" style={{ background: "#f0f9ff", border: "1px solid #7dd3fc", borderRadius: 6, padding: "8px 10px", marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#0369a1", letterSpacing: "0.05em" }}>
                🇧🇷 ANVISA — Faixas de aceitação (IN 28/2018)
              </span>
              {(() => {
                const dbEntry = ANVISA_IN28_DB.find(d => d.compoundId === compound.id);
                if (!dbEntry) return null;
                return (
                  <button
                    type="button"
                    onClick={() => setDraft(d => ({
                      ...d,
                      anvisaMinMg:  String(dbEntry.minMg),
                      anvisaMaxMg:  String(dbEntry.maxMg),
                      anvisaNorm:   dbEntry.norm,
                    }))}
                    style={{ fontSize: 8, padding: "1px 7px", border: "1px solid #0369a1", borderRadius: 3, background: "#0369a1", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    ↓ Preencher: {dbEntry.minMg}–{dbEntry.maxMg} mg
                  </button>
                );
              })()}
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              <div>
                <Label className="text-xs text-muted-foreground font-mono">Faixa mín (mg)</Label>
                <Input type="number" step="any" min="0"
                  value={draft.anvisaMinMg && draft.anvisaMinMg !== "0" ? draft.anvisaMinMg : ""}
                  onChange={e => setDraft(d => ({ ...d, anvisaMinMg: e.target.value }))}
                  placeholder="ex: 400"
                  className="h-7 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono">Faixa máx (mg)</Label>
                <Input type="number" step="any" min="0"
                  value={draft.anvisaMaxMg && draft.anvisaMaxMg !== "0" ? draft.anvisaMaxMg : ""}
                  onChange={e => setDraft(d => ({ ...d, anvisaMaxMg: e.target.value }))}
                  placeholder="ex: 750"
                  className="h-7 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono">Norma</Label>
                <Input type="text"
                  value={draft.anvisaNorm && draft.anvisaNorm !== "undefined" ? draft.anvisaNorm : "IN 28/2018"}
                  onChange={e => setDraft(d => ({ ...d, anvisaNorm: e.target.value }))}
                  className="h-7 text-xs font-mono" />
              </div>
            </div>
            {(() => {
              const dbEntry = ANVISA_IN28_DB.find(d => d.compoundId === compound.id);
              if (!dbEntry) return null;
              return (
                <div style={{ fontSize: 8, color: "#64748b", marginTop: 4 }}>
                  Ref. ANVISA: {dbEntry.name} · rótulo típico {dbEntry.labelMg} mg · 80–150% = {dbEntry.minMg}–{dbEntry.maxMg} mg
                </div>
              );
            })()}
          </div>

          {/* ── Calibration Standards ── */}
          <div className="col-span-2" style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "8px 10px", marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: "bold", color: "#166534", letterSpacing: "0.05em" }}>
                📈 Calibration Standards — Amount [ug/ml] × Area [mAU*s]
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => regenStds(draft.amtPerArea)}
                  style={{ fontSize: 8, padding: "1px 6px", border: "1px solid #166534", borderRadius: 3, background: "#166534", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                  title="Regerar a partir do fator Amt/Area"
                >↺ Auto</button>
                <button
                  type="button"
                  onClick={() => {
                    const newId = `std-${Date.now()}`;
                    const last = stdDraft[stdDraft.length - 1];
                    setStdDraft(d => [...d, { id: newId, level: d.length + 1, amount: last ? last.amount + 10 : 10, area: last ? parseFloat((last.area * 1.2).toFixed(4)) : 100 }]);
                  }}
                  style={{ fontSize: 8, padding: "1px 6px", border: "1px solid #166534", borderRadius: 3, background: "#fff", color: "#166534", cursor: "pointer", whiteSpace: "nowrap" }}
                >+ Ponto</button>
              </div>
            </div>
            {/* header */}
            <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 20px", gap: 3, marginBottom: 3 }}>
              <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "Courier New, monospace", textAlign: "center" }}>Nv</span>
              <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "Courier New, monospace" }}>Amount (ug/ml)</span>
              <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "Courier New, monospace" }}>Area (mAU*s)</span>
              <span></span>
            </div>
            {stdDraft.map((s, i) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 20px", gap: 3, marginBottom: 3, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "Courier New, monospace", textAlign: "center" }}>{i + 1}</span>
                <input
                  type="number" step="any" min="0"
                  value={s.amount}
                  onChange={e => setStdDraft(d => d.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                  style={{ width: "100%", height: 22, fontSize: 10, fontFamily: "Courier New, monospace", border: "1px solid #d1fae5", borderRadius: 3, padding: "0 4px", background: "#fff" }}
                />
                <input
                  type="number" step="any" min="0"
                  value={s.area}
                  onChange={e => setStdDraft(d => d.map((x, j) => j === i ? { ...x, area: parseFloat(e.target.value) || 0 } : x))}
                  style={{ width: "100%", height: 22, fontSize: 10, fontFamily: "Courier New, monospace", border: "1px solid #d1fae5", borderRadius: 3, padding: "0 4px", background: "#fff" }}
                />
                <button
                  type="button"
                  onClick={() => setStdDraft(d => d.filter((_, j) => j !== i).map((x, j) => ({ ...x, level: j + 1 })))}
                  disabled={stdDraft.length <= 2}
                  style={{ width: 18, height: 18, fontSize: 10, border: "1px solid #fca5a5", borderRadius: 3, background: stdDraft.length <= 2 ? "#f3f4f6" : "#fff", color: stdDraft.length <= 2 ? "#d1d5db" : "#dc2626", cursor: stdDraft.length <= 2 ? "not-allowed" : "pointer", padding: 0, lineHeight: 1 }}
                  title="Remover ponto"
                >×</button>
              </div>
            ))}
            <div style={{ fontSize: 8, color: "#6b7280", marginTop: 4, fontFamily: "Courier New, monospace" }}>
              {stdDraft.length} pontos · clique ↺ Auto para regenerar do fator Amt/Area acima
            </div>
          </div>

          <Button type="submit" className="w-full col-span-2 mt-2" size="sm">
            Save Compound
          </Button>
        </form>
        </div>{/* end scrollable wrapper */}
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
  productName?: string;
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

function getAuthToken(): string {
  return sessionStorage.getItem("alphafitus_token") ?? localStorage.getItem("alphafitus_token") ?? "";
}

function loadSessions(): AnalysisSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as AnalysisSession[]; }
  catch { return []; }
}

function saveSessions(s: AnalysisSession[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  // Fire-and-forget sync to DB
  const token = getAuthToken();
  if (token) {
    fetch("/api/hplc/sessions/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(s),
    }).catch(() => { /* ignore network errors — localStorage is the fallback */ });
  }
}

async function loadSessionsFromServer(): Promise<AnalysisSession[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch("/api/hplc/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json() as AnalysisSession[];
  } catch { return []; }
}

async function archiveSessionOnServer(id: string): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`/api/hplc/sessions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }
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

const COMPOUND_CALIBS_KEY = "hplc_compound_calibrations_v1";
function loadCompoundCalibrations(): Record<string, CompoundCalibration> {
  try { return JSON.parse(localStorage.getItem(COMPOUND_CALIBS_KEY) ?? "{}") as Record<string, CompoundCalibration>; }
  catch { return {}; }
}
function saveCompoundCalibrations(c: Record<string, CompoundCalibration>) {
  try { localStorage.setItem(COMPOUND_CALIBS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

const PADRAO_KEY = "hplc_padrao_config_v1";
const DEFAULT_PADRAO_CONFIG: PadraoConfig = {
  compoundName: "", stdPeakName: "", stdArea: 0, stdAmountUg: 0, stdPurity: 100,
  smpPeakName: "", smpArea: 0, smpDeclaredAmountUg: 0, notes: "", selectedLotIds: [],
  smpPurity: 100, smpRawArea: 0,
  smpMassDeclaradaMg: 0, smpConcFinalUgMl: 0, smpVolInicialMl: 0, smpInjVolUl: 0, smpDilutionFactor: 1,
  anvisaLabelAmountMg: 0, anvisaMinMg: 0, anvisaMaxMg: 0, anvisaNorm: "IN 28/2018", anvisaUseUg: false,
  anvisaFoundMgOverride: 0, concInicialUseUg: false,
  productName: "", productLot: "", certNumber: "", certTitle: "Certificado de Análise",
  smpAreaSaved: false, hideDiamondOnCurve: false,
};
function stripLevelPrefix(s: string): string {
  return s.replace(/^Level\s+\d+\s*[—–-]\s*cal\.\s*/i, "");
}
function loadPadraoConfig(): PadraoConfig {
  try {
    const raw = { ...DEFAULT_PADRAO_CONFIG, ...(JSON.parse(localStorage.getItem(PADRAO_KEY) ?? "{}") as Partial<PadraoConfig>) };
    if (raw.stdPeakName) raw.stdPeakName = stripLevelPrefix(raw.stdPeakName);
    return raw;
  }
  catch { return { ...DEFAULT_PADRAO_CONFIG }; }
}
function savePadraoConfig(c: PadraoConfig) {
  try { localStorage.setItem(PADRAO_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

const SAVED_ANALYSES_KEY = "hplc_saved_analyses_v1";
function loadSavedAnalyses(): SavedAnalysis[] {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_ANALYSES_KEY) ?? "[]") as SavedAnalysis[];
    return list.map(a => ({
      ...a,
      ...(a.config?.stdPeakName ? { config: { ...a.config, stdPeakName: stripLevelPrefix(a.config.stdPeakName) } } : {}),
    }));
  }
  catch { return []; }
}
function persistSavedAnalyses(list: SavedAnalysis[]) {
  try { localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  const token = getAuthToken();
  if (token) {
    fetch("/api/hplc/analyses/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(list),
    }).catch(() => { /* ignore — localStorage is the fallback */ });
  }
}
async function loadAnalysesFromServer(): Promise<SavedAnalysis[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch("/api/hplc/analyses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json() as SavedAnalysis[];
  } catch { return []; }
}
async function archiveAnalysisOnServer(id: string): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`/api/hplc/analyses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }
}

const PADRAO_PRESETS_KEY = "hplc_padrao_presets_v1";
function loadPadraoPresets(): PadraoPreset[] {
  try { return JSON.parse(localStorage.getItem(PADRAO_PRESETS_KEY) ?? "[]") as PadraoPreset[]; }
  catch { return []; }
}
function savePadraoPresets(p: PadraoPreset[]) {
  try { localStorage.setItem(PADRAO_PRESETS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

const PADRAO_TEMPLATES: Omit<PadraoPreset, "id">[] = [
  { name: "Vitamina D3",        compoundName: "Colecalciferol",              stdPurity: 99.5, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina C",         compoundName: "Ácido Ascórbico",             stdPurity: 99.7, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina A",         compoundName: "Acetato de Retinol",          stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina E",         compoundName: "Acetato de Tocoferol",        stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina K2",        compoundName: "Menaquinona-7 (MK-7)",        stdPurity: 98.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B1",        compoundName: "Cloridrato de Tiamina",       stdPurity: 99.5, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B2",        compoundName: "Riboflavina",                 stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B3",        compoundName: "Niacinamida",                 stdPurity: 99.5, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B5",        compoundName: "Ácido Pantotênico",           stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B6",        compoundName: "Cloridrato de Piridoxina",    stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B7 (Biotina)",compoundName: "D-Biotina",                 stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B9",        compoundName: "Ácido Fólico",                stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Vitamina B12",       compoundName: "Cianocobalamina",             stdPurity: 98.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Cálcio",             compoundName: "Carbonato de Cálcio",         stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Magnésio",           compoundName: "Óxido de Magnésio",           stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Zinco",              compoundName: "Sulfato de Zinco",            stdPurity: 99.5, stdArea: 0, stdAmountUg: 0 },
  { name: "Ferro",              compoundName: "Sulfato Ferroso",             stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Coenzima Q10",       compoundName: "Ubiquinona-10",               stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Ômega-3 EPA",        compoundName: "Ácido Eicosapentaenoico",     stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Ômega-3 DHA",        compoundName: "Ácido Docosahexaenoico",      stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Luteína",            compoundName: "Luteína",                     stdPurity: 98.0, stdArea: 0, stdAmountUg: 0 },
  { name: "Resveratrol",        compoundName: "trans-Resveratrol",           stdPurity: 99.0, stdArea: 0, stdAmountUg: 0 },
];

const PADRAO_LOG_KEY = "hplc_padrao_changelog_v1";
  const PADRAO_LOCKED_KEY = "hplc_padrao_locked_v1";
  function loadPadraoChangelog(): PadraoChangeLog[] {
    try { return JSON.parse(localStorage.getItem(PADRAO_LOG_KEY) ?? "[]") as PadraoChangeLog[]; } catch { return []; }
  }
  function savePadraoChangelog(log: PadraoChangeLog[]) {
    try { localStorage.setItem(PADRAO_LOG_KEY, JSON.stringify(log)); } catch { /* noop */ }
  }
  function loadPadraoLocked(): boolean {
    try { return localStorage.getItem(PADRAO_LOCKED_KEY) === "true"; } catch { return false; }
  }
  function savePadraoLocked(v: boolean) {
    try { localStorage.setItem(PADRAO_LOCKED_KEY, v ? "true" : "false"); } catch { /* noop */ }
  }
  const SMP_PURITY_LOCKED_KEY = "hplc_smp_purity_locked_v1";
  function loadSmpPurityLocked(): boolean {
    try { return localStorage.getItem(SMP_PURITY_LOCKED_KEY) === "true"; } catch { return false; }
  }
  function saveSmpPurityLocked(v: boolean) {
    try { localStorage.setItem(SMP_PURITY_LOCKED_KEY, v ? "true" : "false"); } catch { /* noop */ }
  }
  function validatePadrao(cfg: PadraoConfig): ValidationAlert[] {
    const alerts: ValidationAlert[] = [];
    if (!cfg.compoundName) alerts.push({ severity: "warning", message: "Compound name not set", field: "compoundName" });
    if (cfg.stdArea <= 0) alerts.push({ severity: "error", message: "Standard area is zero — results cannot be calculated", field: "stdArea" });
    if (cfg.stdAmountUg <= 0) alerts.push({ severity: "error", message: "Standard amount is zero — results cannot be calculated", field: "stdAmountUg" });
    if (cfg.stdPurity <= 0 || cfg.stdPurity > 100) alerts.push({ severity: "warning", message: "Standard purity should be between 0 and 100%", field: "stdPurity" });
    if (cfg.smpArea <= 0) alerts.push({ severity: "error", message: "Sample area is zero — results cannot be calculated", field: "smpArea" });
    if (cfg.stdArea > 0 && cfg.smpArea > 0 && cfg.smpArea / cfg.stdArea > 2)
      alerts.push({ severity: "warning", message: "Sample area is more than 2× the standard area — verify concentrations" });
    return alerts;
  }
  function buildCalcTrace(
    resultLabel: string, resultValue: string, method: CalcMethod,
    formulaText: string, inputs: { label: string; value: string; source: string }[],
    sourceTab: string,
    opts?: { peakName?: string; compoundName?: string; standardRef?: string; warningText?: string }
  ): CalcTrace { return { resultLabel, resultValue, method, formulaText, inputs, sourceTab, ...opts }; }
  // Generates a full Agilent ChemStation-style report PNG for the session
function buildChromatogramPng(
  session: AnalysisSession,
  formula: Formula,
  formulaStd: FormulaStandard | null,
  reg: { slope: number; intercept: number } = { slope: 0, intercept: 0 },
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
    const det = formula.detector;
    const chrom = buildChromatogram(run.peaks, runTime, 1600, det.baselineNoise ?? 1.8, det.baselineDrift ?? 1.2, det.baselinePulse ?? 0.35, det.baselineWander ?? 0, det.shotNoise ?? 0, det.baselineHump ?? 0, det.broadeningFactor ?? 0, det.baselineOffset ?? 0, det.baselinePulseFreq ?? 1.6, det.baselineStartOffset ?? 0, det.baselineStartDecay ?? 1.0);
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

    // "min" label — right-aligned inside the right edge of the chart
    ctx.font = FONT_SM; ctx.fillStyle = "#555";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText("min", ML_c + cW - 2, chartTop + CHART_H + 2);

    // Axes
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ML_c, chartTop); ctx.lineTo(ML_c, chartTop + CHART_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ML_c, chartTop + CHART_H); ctx.lineTo(ML_c + cW, chartTop + CHART_H); ctx.stroke();

    // Chromatogram — Agilent ChemStation blue
    ctx.strokeStyle = "#1560bd"; ctx.lineWidth = det.lineWidth ?? 1;
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

  // ── Render each run as a full ChemStation page (skip hidden runs) ────────
  const visibleRunsPng = session.runs.filter(r => !r.hidden);
  for (let ri = 0; ri < visibleRunsPng.length; ri++) {
    const run = visibleRunsPng[ri];
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
    const peakRows = sortedPeaks.map(p => {
      const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
      let calcAmount = 0;
      if (p.amount > 0) calcAmount = p.amount;
      else if (p.amtPerArea > 0) calcAmount = area * p.amtPerArea;
      else if (reg.slope > 0) calcAmount = Math.max(0, (area - reg.intercept) / reg.slope);
      return { p, area, calcAmount };
    });
    const totalArea = peakRows.reduce((s, r) => s + r.area, 0);
    const totalCalcAmount = peakRows.reduce((s, r) => s + r.calcAmount, 0);

    txt(` ${"#".padEnd(3)} ${"RetTime".padEnd(8)} ${"Type".padEnd(5)} ${"Width(b)".padEnd(9)} ${"Area".padEnd(13)} ${"Height".padEnd(11)} ${"Area%".padEnd(8)} Amount[ug/ml]`); nl();
    txt(`     [min]     |      [min]  |  [mAU*s]      [mAU]`); nl();
    ctx.fillStyle = "#888"; txt("-".repeat(97)); ctx.fillStyle = "#000"; nl();

    peakRows.forEach(({ p, area, calcAmount }, i) => {
      const areaPct = totalArea > 0 ? (area / totalArea) * 100 : 0;
      const amtStr = calcAmount > 0 ? calcAmount.toFixed(5) : "";
      const wb = computeWb(p);
      txt(
        ` ${String(i + 1).padStart(2)}  ${p.retentionTime.toFixed(3).padEnd(8)} ${p.peakType.padEnd(5)} ${wb.toFixed(4).padEnd(9)} ${area.toFixed(5).padEnd(13)} ${p.height.toFixed(5).padEnd(11)} ${areaPct.toFixed(3).padEnd(8)} ${amtStr}`
      ); nl();
    });

    ctx.fillStyle = "#888"; txt("-".repeat(96)); ctx.fillStyle = "#000"; nl();
    txt(`Totals :                              ${totalArea.toFixed(5).padEnd(20)} ${totalCalcAmount > 0 ? totalCalcAmount.toFixed(5) : ""}`); nl(2);

    sep();

    // --- Results section ---
    txt("Results obtained with enhanced integrator!"); nl(2);

    const compounds = formula.activeCompounds ?? [];
    if (compounds.length > 0) {
      txt(`${"Compound Name".padEnd(22)}  ${"CAS".padEnd(12)}  ${"Conc [mg/mL]".padEnd(14)}  ${"Nominal".padEnd(10)}  Assay%`); nl();
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
            `${compound.name.padEnd(22)}  ${"".padEnd(12)}  ${calcConc.toFixed(4).padEnd(14)}  ${nominal > 0 ? nominal.toFixed(4).padEnd(10) : "N/A".padEnd(10)}  ${teorPct !== null ? teorPct.toFixed(2) + " %" : "N/A"}`
          );
        } else {
          txt(`${compound.name.padEnd(22)}  ${"".padEnd(12)}  ${"Not Found".padEnd(14)}  ${"N/A".padEnd(10)}  N/A`);
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
    txt(`SESSION SUMMARY: ${session.name}`, ML, "#1d4ed8", FONT_BOLD); nl(2);
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
          txt(`${compound.name}  —  Mean = ${mean.toFixed(2)} %    SD = ${sd.toFixed(3)}    %CV = ${cv.toFixed(2)} %    (n = ${vals.length})`, ML, "#000", FONT_BOLD); nl();

          session.runs.forEach((run, ri) => {
            const p = run.peaks.find(p => Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol);
            if (!p) return;
            const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
            const stdEntry = formulaStd?.entries.find(e => e.compoundId === compound.id) ?? null;
            const { calcConc, teorPct } = calcTeorPct(area, compound, stdEntry);
            txt(
              `   ${run.label}:  Area = ${area.toFixed(4).padEnd(12)}  Conc = ${calcConc.toFixed(4)} mg/mL  Assay = ${teorPct !== null ? teorPct.toFixed(2) + " %" : "N/A"}`
            ); nl();
          });
          nl();
        }
      });
      sep();
    } else {
      // No compounds — just list peak areas per run
      txt(`${"Run".padEnd(10)}  ${"Peak".padEnd(24)}  ${"RT (min)".padEnd(10)}  ${"Area (mAU*s)".padEnd(14)}  Area%`); nl();
      ctx.fillStyle = "#888"; txt("-".repeat(80)); ctx.fillStyle = "#000"; nl();
      session.runs.forEach(run => {
        const peaks = [...run.peaks].filter(p => p.height > 0.5).sort((a, b) => a.retentionTime - b.retentionTime);
        const tot = peaks.reduce((s, p) => s + (p.manualArea > 0 ? p.manualArea : computeArea(p)), 0);
        peaks.forEach(p => {
          const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
          txt(`${run.label.padEnd(10)}  ${(p.name || "—").padEnd(24)}  ${p.retentionTime.toFixed(3).padEnd(10)}  ${area.toFixed(5).padEnd(14)}  ${tot > 0 ? ((area / tot) * 100).toFixed(3) : "N/A"}`); nl();
        });
      });
      sep();
    }
  }

  // ── Status footer ────────────────────────────────────────────────────────
  nl();
  const statusLabel: Record<string, string> = {
    em_andamento: "IN PROGRESS", aprovado: "APPROVED",
    reprovado: "REJECTED", laudo_emitido: "REPORT ISSUED",
  };
  const statusColor: Record<string, string> = {
    em_andamento: "#1d4ed8", aprovado: "#16a34a",
    reprovado: "#dc2626", laudo_emitido: "#7c3aed",
  };
  txt(
    `Session Result: ${statusLabel[session.status] ?? session.status}`,
    ML, statusColor[session.status] ?? "#000", FONT_BOLD,
  ); nl();
  if (session.concludedAt) {
    txt(`Concluded on: ${new Date(session.concludedAt).toLocaleString("en-US")}`, ML, "#666"); nl();
  }
  if (session.laudoEmittedAt) {
    txt(`Report issued on: ${new Date(session.laudoEmittedAt).toLocaleString("en-US")}`, ML, "#666"); nl();
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
        <DialogHeader><DialogTitle className="font-mono">Save as Formula</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; onSave(name.trim(), description.trim()); setOpen(false); setName(""); setDescription(""); }} className="space-y-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Formula Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Multivitamin V1" className="h-7 text-xs font-mono mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Description (optional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: 500mg capsules — standard formulation" className="h-7 text-xs font-mono mt-1" />
          </div>
          <Button type="submit" className="w-full" size="sm" disabled={!name.trim()}>
            Save Formula
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
        <DialogHeader><DialogTitle className="font-mono">Register Analyzed Lot</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (!lotNumber.trim()) return; onSave(lotNumber.trim(), notes.trim()); setOpen(false); setLotNumber(""); setNotes(""); }} className="space-y-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Lot Number *</Label>
            <Input value={lotNumber} onChange={e => setLotNumber(e.target.value)} placeholder="Ex: LOT-2025-001" className="h-7 text-xs font-mono mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Vial A — 2nd run" className="h-7 text-xs font-mono mt-1" />
          </div>
          <p className="text-xs text-muted-foreground font-mono">The current chromatogram (configured peaks) will be saved as the result for this lot.</p>
          <Button type="submit" className="w-full" size="sm" disabled={!lotNumber.trim()}>
            Register Lot
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
  const set = (k: keyof SessionSetupData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setD(prev => {
      if (k === "acqMethod") {
        return { ...prev, acqMethod: val, analysisMethod: syncMethodPeer("acqMethod", val, prev.analysisMethod) };
      }
      if (k === "analysisMethod") {
        return { ...prev, analysisMethod: val, acqMethod: syncMethodPeer("analysisMethod", val, prev.acqMethod) };
      }
      return { ...prev, [k]: val };
    });
  };

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
            Pre-Analysis Setup
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">
            Fill in the details before starting the session. Values are remembered for the next analysis.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-1.5 pt-1">

          {/* ── SESSÃO ─────────────────────────────────────────────── */}
          {section("Analysis Session")}

          <div className="flex items-center gap-2">
            <Label className="text-xs font-mono text-muted-foreground w-36 shrink-0 text-right">Formula / Method *</Label>
            <select
              value={d.formulaId}
              onChange={set("formulaId")}
              required
              className="h-6 text-xs font-mono border border-input rounded px-2 bg-background flex-1"
            >
              {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {field("Session Name", "sessionName", "Ex: Analysis LOT-2025-001", true)}

          {/* ── AMOSTRA ────────────────────────────────────────────── */}
          {section("Sample Information")}

          {field("Sample Name", "sampleName", "Ex: VITAMIN D3 500mg cap")}
          {field("Lot / Batch No.", "lotNumber", "Ex: LOT-2025-042")}
          {field("Seq. Line (inj. no.)", "seqLine", "1")}
          {field("Location / Vial", "location", "Ex: Vial 1")}

          {/* ── INSTRUMENT / METHOD ───────────────────────────────── */}
          {section("Instrument & Method")}

          {field("Operator", "acqOperator", "Analyst name", true)}
          {field("Instrument", "acqInstrument", "Instrument 1")}
          {field("Inj. Volume", "injVolume", "10.0 µl")}
          {field("Acq. Method", "acqMethod", "C:\\CHEM32\\METHODS\\...")}
          {field("Analysis Method", "analysisMethod", "C:\\CHEM32\\METHODS\\...")}

          {/* ── NOTES ────────────────────────────────────────────── */}
          {section("Notes")}
          <div className="flex items-start gap-2">
            <Label className="text-xs font-mono text-muted-foreground w-36 shrink-0 text-right pt-1">Notes</Label>
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
              <FlaskConical className="h-3.5 w-3.5 mr-2" /> Start Analysis
            </Button>
            <p className="text-xs text-center text-muted-foreground font-mono mt-1.5">
              Up to 5 runs (injections) per session · Overlay chromatograms + Assay%
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
        <DialogHeader><DialogTitle className="font-mono">Configure Reference Standard</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-3 pt-1 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground font-mono">
            For each compound, enter the nominal concentration (as declared in the formula) and, optionally, the external standard data.
          </p>
          {compounds.map(c => (
            <div key={c.id} className="border rounded p-2 space-y-1.5">
              <div className="text-xs font-mono font-bold">{c.name} <span className="text-muted-foreground font-normal">({c.units})</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Nominal Conc. *</Label>
                  <Input type="number" step="any" value={entries[c.id]?.nominalConc ?? ""}
                    onChange={e => setField(c.id, "nominalConc", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="ug/ml" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Std Area</Label>
                  <Input type="number" step="any" value={entries[c.id]?.stdArea ?? ""}
                    onChange={e => setField(c.id, "stdArea", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="mAU*s" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground font-mono">Std Conc.</Label>
                  <Input type="number" step="any" value={entries[c.id]?.stdConc ?? ""}
                    onChange={e => setField(c.id, "stdConc", e.target.value)}
                    className="h-6 text-xs font-mono px-1" placeholder="ug/ml" />
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground font-mono">Std Area = 0 → uses Amt/Area from calibration</div>
            </div>
          ))}
          <div>
            <Label className="text-xs text-muted-foreground font-mono">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-7 text-xs font-mono mt-1" />
          </div>
          <Button type="submit" className="w-full" size="sm">Save Standard</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type PageMode = "sessoes" | "chromatogram" | "ativos" | "lotes" | "report" | "usuarios" | "analise" | "padrao";

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
  const { toast } = useToast();
  const [page, setPage] = useState<PageMode>("chromatogram");
  const [isDirty, setIsDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [peaks, setPeaks] = useState<Peak[]>(() => loadState()?.peaks ?? DEFAULT_PEAKS);
  const [sample, setSample] = useState<SampleInfo>(() => loadState()?.sample ?? DEFAULT_SAMPLE);
  const [productName, setProductName] = useState<string>(() => loadState()?.productName ?? "");
  const [detector, setDetector] = useState<DetectorInfo>(() => loadState()?.detector ?? DEFAULT_DETECTOR);
  const [standards, setStandards] = useState<CalibStandard[]>(() => loadState()?.standards ?? DEFAULT_STANDARDS);
  const [calib, setCalib] = useState<CalibInfo>(() => loadState()?.calib ?? DEFAULT_CALIB);
  const [activeCompounds, setActiveCompounds] = useState<ActiveCompound[]>(() => loadState()?.activeCompounds ?? DEFAULT_ACTIVE_COMPOUNDS);
  const [lastIdentified, setLastIdentified] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(true);
  const [showStdPeak, setShowStdPeak] = useState(false);
  const [showBaselines, setShowBaselines] = useState(false);
  const [showExtStdNote, setShowExtStdNote] = useState(true);
  const [formulas, setFormulas] = useState<Formula[]>(() => loadFormulas());
  const [lots, setLots] = useState<Lot[]>(() => loadLots());
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [analysisSessions, setAnalysisSessions] = useState<AnalysisSession[]>(() => loadSessions());
  const [formulaStandards, setFormulaStandards] = useState<FormulaStandard[]>(() => loadFormulaStandards());
  const [savedImages, setSavedImages] = useState<HplcSavedImage[]>([]);
  const [compoundCalibrations, setCompoundCalibrations] = useState<Record<string, CompoundCalibration>>(() => loadCompoundCalibrations());
  const [selectedCalibCompoundId, setSelectedCalibCompoundId] = useState<string | null>(null);
  const [reportSelectedImageId, setReportSelectedImageId] = useState<string | null>(null);
  const [syncAreasActive, setSyncAreasActive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTargetPeakIdRef = useRef<string | null>(null);

  // ── Undo stack ───────────────────────────────────────────────────────────
  const undoStackRef = useRef<Array<{ peaks: Peak[]; compoundCalibrations: Record<string, CompoundCalibration>; detector: DetectorInfo }>>([]);
  const [canUndo, setCanUndo] = useState(false);
  const peaksUndoRef = useRef<Peak[]>([]);
  const calibUndoRef = useRef<Record<string, CompoundCalibration>>({});
    const detectorUndoRef = useRef<DetectorInfo>(DEFAULT_DETECTOR);

  const [userList, setUserList] = useState<UserRecord[]>([]);
  const [userListLoading, setUserListLoading] = useState(false);
  const [userListError, setUserListError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteSessionDialog, setDeleteSessionDialog] = useState<{ id: string; name: string } | null>(null);
  const [panelStatusFilter, setPanelStatusFilter] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [deleteSessionPwd, setDeleteSessionPwd] = useState("");
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false);
  const [peakPickerOpen, setPeakPickerOpen] = useState(false);
  const peakPickerCbRef = useRef<((p: Peak) => void) | null>(null);
  // Master-password unlock for concluded sessions
  const [unlockedSessionId, setUnlockedSessionId] = useState<string | null>(null);
  const [masterAuthDialog, setMasterAuthDialog] = useState<{ onSuccess: () => void; description?: string; buttonLabel?: string } | null>(null);
  const [masterAuthInput, setMasterAuthInput] = useState("");
  const [masterAuthError, setMasterAuthError] = useState<string | null>(null);
  const [masterAuthLoading, setMasterAuthLoading] = useState(false);
  const [currentSnapshotSessionId, setCurrentSnapshotSessionId] = useState<string | null>(null);
  const [savePngDialog, setSavePngDialog] = useState<{ sessionId: string; redirectToGallery: boolean } | null>(null);
  const [savePngCertNum, setSavePngCertNum] = useState("");
  const [peakContextMenu, setPeakContextMenu] = useState<{ x: number; y: number; peakId: string } | null>(null);
  const [editingPeakId, setEditingPeakId] = useState<string | null>(null);
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  // Holds the peak being edited. Never reset to null after first use so the
  // PeakEditorDialog component stays mounted permanently (Radix portal must not
  // be unmounted while open — that is the root cause of the insertBefore crash).
  const dialogPeakRef = useRef<Peak | null>(null);
  // Live preview peak — substitutes the real peak in the chromatogram while
  // the editor dialog is open, giving real-time visual feedback.
  const [previewPeak, setPreviewPeak] = useState<Peak | null>(null);
  // Controls inline editing of the full signal label line on the chromatogram overlay
  const [signalLabelEditing, setSignalLabelEditing] = useState(false);

  // Open the peak editor dialog from the context menu or sidebar button.
  const openEditorDialog = (id: string) => {
    const pk = peaks.find(p => p.id === id);
    if (!pk || pk.locked) return;
    // For the Sample peak, sync manualArea = smpArea so Edit Peak shows the
    // purity-corrected value (same as what the Standard tab displays).
    const isSmpPk = padraoExtHasData && padraoConfig.smpArea > 0 && (
      (pk.name && pk.name === padraoConfig.smpPeakName) ||
      (padraoSmpRT > 0 && Math.abs(pk.retentionTime - padraoSmpRT) < 0.05)
    );
    const pkForDialog = isSmpPk ? { ...pk, manualArea: padraoConfig.smpArea } : pk;
    if (isSmpPk) {
      setPeaks(ps => ps.map(p => p.id === id ? pkForDialog : p));
    }
    dialogPeakRef.current = pkForDialog;
    setEditingPeakId(id);
    setEditorDialogOpen(true);
  };

  // Close the peak editor dialog. No setTimeout needed — the dialog stays in the
  // React tree permanently (dialogPeakRef guards it), so Radix can finish its
  // close animation without any DOM/virtual-DOM mismatch.
  // Also clear the live preview so the chromatogram reverts to saved state on cancel.
  const closeEditorDialog = () => {
    setEditorDialogOpen(false);
    setEditingPeakId(null);
    setPreviewPeak(null);
  };
  const [finalizeDialog, setFinalizeDialog] = useState<{ id: string; name: string } | null>(null);
  const [finalizeStatus, setFinalizeStatus] = useState<"em_andamento" | "aprovado" | "reprovado">("aprovado");
  const [finalizeNotes, setFinalizeNotes] = useState("");
  const [newAnalysisDialog, setNewAnalysisDialog] = useState(false);
  const [newAnalysisForm, setNewAnalysisForm] = useState<SampleInfo>({ ...DEFAULT_SAMPLE });
  const [showImportDialog, setShowImportDialog] = useState(false);
  // Inline lot registration form (Lotes tab) — supports up to 3 simultaneous lots
  const [inlineLots, setInlineLots] = useState([
    { lotNumber: "", notes: "" },
    { lotNumber: "", notes: "" },
    { lotNumber: "", notes: "" },
  ]);
  const [importText, setImportText] = useState("");
  const [importReplacesPeaks, setImportReplacesPeaks] = useState(true);
  const [padraoConfig, setPadraoConfig] = useState<PadraoConfig>(() => {
    const cfg = loadPadraoConfig();
    return { ...DEFAULT_PADRAO_CONFIG, ...cfg, selectedLotIds: cfg.selectedLotIds ?? [] };
  });
  const [padraoLocked, setPadraoLocked] = useState<boolean>(() => loadPadraoLocked());
  const [smpPurityLocked, setSmpPurityLocked] = useState<boolean>(() => loadSmpPurityLocked());
  const [smpSubTab, setSmpSubTab] = useState<"padrao" | "conc_inicial">("padrao");
  const [padraoChangelog, setPadraoChangelog] = useState<PadraoChangeLog[]>(() => loadPadraoChangelog());
  const [padraoHistoryOpen, setPadraoHistoryOpen] = useState(false);
  const [padraoPresets, setPadraoPresets] = useState<PadraoPreset[]>(() => loadPadraoPresets());
  const [padraoPresetSaveName, setPadraoPresetSaveName] = useState("");
  const [padraoTemplatesOpen, setPadraoTemplatesOpen] = useState(false);
  const [calcTraceDialog, setCalcTraceDialog] = useState<CalcTrace | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>(() => loadSavedAnalyses());
  const [analiseSubTab, setAnaliseSubTabRaw] = useState<"sessions" | "pdfs">(() => {
    try {
      const saved = localStorage.getItem("hplc_analise_sub_tab") as "sessions" | "pdfs" | null;
      if (saved === "sessions" || saved === "pdfs") return saved;
    } catch { /* ignore */ }
    // Default to "pdfs" if there are already saved analyses so records stay visible
    try {
      const list = JSON.parse(localStorage.getItem(SAVED_ANALYSES_KEY) ?? "[]") as unknown[];
      if (list.length > 0) return "pdfs";
    } catch { /* ignore */ }
    return "sessions";
  });
  const setAnaliseSubTab = (tab: "sessions" | "pdfs") => {
    try { localStorage.setItem("hplc_analise_sub_tab", tab); } catch { /* ignore */ }
    setAnaliseSubTabRaw(tab);
  };
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [saveConfirmId, setSaveConfirmId] = useState<string | null>(null);
  const [showPreSaveDialog, setShowPreSaveDialog] = useState(false);
  const [preSaveSessionId, setPreSaveSessionId] = useState<string>("");
  const [preSaveSessionStatus, setPreSaveSessionStatus] = useState<"em_andamento" | "aprovado" | "reprovado">("aprovado");
  // Tracks which saved analysis is currently being edited so re-save updates in place
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  // Lot number of the record that was loaded — if user changes the lot, force a new save
  const editingOriginalLotRef = React.useRef<string | null>(null);
  // Duplicate certNumber warning: holds the conflicting record name when detected
  const [preSaveDupWarning, setPreSaveDupWarning] = useState<string | null>(null);
  // Save mode when editing a restored document: "update" = overwrite, "new" = create copy
  const [preSaveSaveMode, setPreSaveSaveMode] = useState<"update" | "new" | null>(null);

  // Restore the full document state from a SavedAnalysis record so the user can
  // reopen, verify, edit and re-save exactly where they left off.
  const restoreDocument = useCallback((saved: SavedAnalysis) => {
    // 1. Standard tab config (always present)
    setPadraoConfig(prev => {
      const next = { ...prev, ...saved.config };
      savePadraoConfig(next);
      return next;
    });
    // 2. Full chromatogram state (only present in records saved after this update)
    if (saved.peaks && saved.peaks.length > 0)   setPeaks(saved.peaks);
    if (saved.sample)                             setSample(saved.sample);
    if (saved.detector)                           setDetector(saved.detector);
    if (saved.standards && saved.standards.length > 0) setStandards(saved.standards);
    if (saved.calib)                              setCalib(saved.calib);
    if (saved.activeCompounds)                    setActiveCompounds(saved.activeCompounds);
    // 3. Mark this record as the one being edited so re-save updates in place
    setEditingSavedId(saved.id);
    // Remember the lot that was loaded — changing it forces a new analysis
    editingOriginalLotRef.current = saved.config.productLot ?? "";
    // Reset save-mode choice so the chooser always shows fresh for this restore
    setPreSaveSaveMode(null);
    setPreSaveDupWarning(null);
    // 4. Navigate to Standard tab so user sees the restored document immediately
    setSaveConfirmId(null);
    setPage("padrao");
  }, []);

  const openSavedPdf = useCallback((saved: SavedAnalysis) => {
    if (!saved.htmlContent) {
      alert("Este registro foi salvo antes da atualização e não contém HTML armazenado.\nRecrie o PDF na aba Standard.");
      return;
    }
    const w = window.open("", "_blank", "width=960,height=900");
    if (!w) return;
    w.document.write(saved.htmlContent);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }, []);
  const _openSavedPdfLegacy = useCallback((saved: SavedAnalysis) => {
    const cfg = saved.config;
    const stdArea = cfg.stdArea;
    const smpArea = cfg.smpArea;
    const ratio   = stdArea > 0 ? smpArea / stdArea : 0;
    const foundUg = ratio * cfg.stdAmountUg * (cfg.stdPurity / 100);
    const foundMg = foundUg / 1000;
    const purityCalc = ratio * cfg.stdPurity;
    const hasSmpPurity = cfg.smpPurity > 0 && Math.abs(cfg.smpPurity - 100) > 0.01;
    const dispPurity = hasSmpPurity ? cfg.smpPurity : purityCalc;
    const purityVsDecl = cfg.smpDeclaredAmountUg > 0 ? (foundUg / cfg.smpDeclaredAmountUg) * 100 : null;
    const foundMgAnv = cfg.anvisaFoundMgOverride > 0 ? cfg.anvisaFoundMgOverride : foundMg;
    const inMin = cfg.anvisaMinMg > 0 ? foundMgAnv >= cfg.anvisaMinMg : null;
    const inMax = cfg.anvisaMaxMg > 0 ? foundMgAnv <= cfg.anvisaMaxMg : null;
    const inRange = (inMin !== null || inMax !== null) ? (inMin !== false && inMax !== false) : null;
    const dateStr = saved.savedAt ? new Date(saved.savedAt).toLocaleDateString("pt-BR") : "";
    const chromImg = saved.chromSvgData
      ? `<img src="data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(saved.chromSvgData)))}" style="width:100%;max-height:220px;object-fit:contain;margin:8px 0;" />`
      : "";
    const w = window.open("", "_blank", "width=960,height=900");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${saved.certTitle}</title>
<style>
  body{font-family:"Courier New",monospace;font-size:11px;margin:0;padding:0;background:#fff;color:#1e293b}
  @media print{body{margin:0}@page{margin:10mm 12mm;size:A4 portrait}}
  h1{font-size:14px;text-align:center;margin:0 0 2px}
  .sub{font-size:10px;text-align:center;color:#555;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th,td{border:1px solid #ccc;padding:3px 6px}
  th{background:#e2e8f0;text-align:left}
  .badge-ok{background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:bold}
  .badge-no{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-weight:bold}
  .section{font-weight:bold;border-top:2px solid #1e3a5f;margin:10px 0 4px;padding-top:4px;color:#1e3a5f;font-size:11px}
  .row2{display:flex;gap:16px;margin-bottom:4px}
  .lbl{color:#64748b;min-width:120px;display:inline-block}
</style></head><body>
<h1>${saved.certTitle}</h1>
<div class="sub">External Standard Method — Alphafitus HPLC Simulator</div>
<hr/>
<div class="section">Identificação</div>
<div class="row2"><span><span class="lbl">Produto:</span>${saved.productName || "—"}</span><span><span class="lbl">Lote:</span>${saved.productLot || "—"}</span></div>
<div class="row2"><span><span class="lbl">Composto:</span>${saved.compoundName || "—"}</span><span><span class="lbl">Emissão:</span>${dateStr}</span></div>
<div class="row2"><span><span class="lbl">Amostra:</span>${saved.sampleName || "—"}</span><span><span class="lbl">Operador:</span>${saved.operator || "—"}</span></div>
<div class="row2"><span><span class="lbl">Data injeção:</span>${saved.injDate || "—"}</span></div>
<div class="section">Cromatograma</div>
${chromImg}
<div class="section">Resultados</div>
<table>
<tr><th>Parâmetro</th><th>Padrão</th><th>Amostra</th><th>Resultado</th></tr>
<tr><td>Área (mAU·s)</td><td>${stdArea.toFixed(3)}</td><td>${smpArea.toFixed(3)}</td><td>—</td></tr>
<tr><td>Razão de Área</td><td>1.000</td><td>${ratio.toFixed(4)}</td><td>—</td></tr>
<tr><td>Teor encontrado (mg)</td><td>${(cfg.stdAmountUg / 1000).toFixed(4)}</td><td>${foundMg.toFixed(4)}</td><td>—</td></tr>
<tr><td>Pureza calculada (%)</td><td>${cfg.stdPurity.toFixed(2)}</td><td>${dispPurity.toFixed(2)}</td><td>—</td></tr>
${purityVsDecl !== null ? `<tr><td>Teor vs. Declarado (%)</td><td>—</td><td>${purityVsDecl.toFixed(2)}</td><td>${purityVsDecl >= 80 ? '<span class="badge-ok">CONFORME</span>' : '<span class="badge-no">NÃO CONFORME</span>'}</td></tr>` : ""}
</table>
${inRange !== null ? `<div class="section">ANVISA — Conformidade</div>
<table><tr><th>Faixa (mg)</th><th>Encontrado (mg)</th><th>Status</th></tr>
<tr><td>${cfg.anvisaMinMg > 0 ? cfg.anvisaMinMg.toFixed(3) : "—"} – ${cfg.anvisaMaxMg > 0 ? cfg.anvisaMaxMg.toFixed(3) : "—"}</td><td>${foundMgAnv.toFixed(4)}</td><td>${inRange ? '<span class="badge-ok">DENTRO DA FAIXA</span>' : '<span class="badge-no">FORA DA FAIXA</span>'}</td></tr>
</table>` : ""}
<div class="section">Parâmetros do Método</div>
<table>
<tr><th>Padrão — Qtd. (µg)</th><td>${cfg.stdAmountUg.toFixed(3)}</td><th>Padrão — Pureza (%)</th><td>${cfg.stdPurity.toFixed(2)}</td></tr>
${cfg.smpInjVolUl > 0 ? `<tr><th>Vol. injeção (µL)</th><td>${cfg.smpInjVolUl.toFixed(1)}</td><th></th><td></td></tr>` : ""}
</table>
<br/><hr/>
<div style="font-size:9px;color:#888;text-align:center">Alphafitus HPLC Simulator · Registro salvo em ${dateStr} · ${saved.certTitle}</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`);
    w.document.close();
  }, []);

  const PROTECTED_FIELDS: (keyof PadraoConfig)[] = ["stdArea", "stdAmountUg", "stdPurity", "compoundName"];
  const updatePadrao = useCallback((patch: Partial<PadraoConfig>, opts?: { changedBy?: string }) => {
    setPadraoConfig(prev => {
      const next = { ...prev, ...patch };
      savePadraoConfig(next);
      const actor = opts?.changedBy ?? "operator";
      const changedProtected = (Object.keys(patch) as (keyof PadraoConfig)[])
        .filter(k => PROTECTED_FIELDS.includes(k) && String(prev[k]) !== String((patch as Record<string, unknown>)[k]));
      if (changedProtected.length > 0) {
        setPadraoChangelog(log => {
          const entries: PadraoChangeLog[] = changedProtected.map(k => ({
            id: uid(), field: k, oldValue: String(prev[k]),
            newValue: String((patch as Record<string, unknown>)[k]),
            changedAt: new Date().toISOString(), changedBy: actor,
          }));
          const newLog = [...entries, ...log].slice(0, 100);
          savePadraoChangelog(newLog);
          return newLog;
        });
      }
      return next;
    });
  }, []);

  // Sync ANVISA limits back to the active compound so the bank is always up-to-date.
  // compoundName is passed explicitly (captured from padraoConfig at call-site).
  const syncAnvisaToCompound = (compoundName: string, minMg: number, maxMg: number, norm: string) => {
    const nameLower = compoundName.trim().toLowerCase();
    if (!nameLower) return;
    setActiveCompounds(prev => {
      const idx = prev.findIndex(c => {
        const cn = c.name.trim().toLowerCase();
        return cn === nameLower || cn.includes(nameLower) || nameLower.includes(cn);
      });
      if (idx < 0) return prev;
      return prev.map((c, i) => i === idx ? { ...c, anvisaMinMg: minMg, anvisaMaxMg: maxMg, anvisaNorm: norm } : c);
    });
  };

  // Load heavy image data after first paint so it doesn't block initial render
  useEffect(() => {
    const imgs = loadSavedImages();
    if (imgs.length > 0) setSavedImages(imgs);
  }, []);

  // On mount: load sessions from server and merge (server wins — always the most complete set)
  useEffect(() => {
    loadSessionsFromServer().then(serverSessions => {
      if (serverSessions.length === 0) {
        // No server data yet — push local sessions to server for the first time
        const local = loadSessions();
        if (local.length > 0) saveSessions(local);
        return;
      }
      // Merge: build a map from server, overlay any local sessions not yet on server
      const serverMap = new Map(serverSessions.map(s => [s.id, s]));
      const local = loadSessions();
      for (const ls of local) {
        if (!serverMap.has(ls.id)) serverMap.set(ls.id, ls);
      }
      const merged = Array.from(serverMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAnalysisSessions(merged);
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: load saved analyses from server and merge (server wins — always the most complete set)
  useEffect(() => {
    loadAnalysesFromServer().then(serverAnalyses => {
      if (serverAnalyses.length === 0) {
        // No server data yet — push local analyses to server for the first time
        const local = loadSavedAnalyses();
        if (local.length > 0) persistSavedAnalyses(local);
        return;
      }
      // Merge: server is authoritative; add any local entries not yet on server
      const serverMap = new Map(serverAnalyses.map(a => [a.id, a]));
      const local = loadSavedAnalyses();
      for (const la of local) {
        if (!serverMap.has(la.id)) serverMap.set(la.id, la);
      }
      const merged = Array.from(serverMap.values()).sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );
      setSavedAnalyses(merged);
      try { localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-navigate to sessions tab when coming from dashboard with a session request
  useEffect(() => {
    const targetId = localStorage.getItem("hplc_dashboard_open_session");
    if (targetId) {
      localStorage.removeItem("hplc_dashboard_open_session");
      setPage("sessoes");
    }
  }, []);

  // Auto-navigate to a specific tab when coming from dashboard with a page target
  useEffect(() => {
    const targetPage = localStorage.getItem("hplc_dashboard_target_page") as PageMode | null;
    if (targetPage) {
      localStorage.removeItem("hplc_dashboard_target_page");
      const validPages: PageMode[] = ["sessoes", "chromatogram", "ativos", "lotes", "analise", "padrao", "report", "usuarios"];
      if (validPages.includes(targetPage)) {
        setPage(targetPage);
        if (targetPage === "usuarios") fetchUsers();
      }
    }
  }, []);

  const markDirty = useCallback(() => { setIsDirty(true); setConfirmed(false); }, []);

  // Keep refs in sync so pushUndo can always capture the latest state
  useEffect(() => { peaksUndoRef.current = peaks; }, [peaks]);
  useEffect(() => { calibUndoRef.current = compoundCalibrations; }, [compoundCalibrations]);
    useEffect(() => { detectorUndoRef.current = detector; }, [detector]);

  const pushUndo = useCallback(() => {
    undoStackRef.current = [
      { peaks: [...peaksUndoRef.current], compoundCalibrations: { ...calibUndoRef.current }, detector: { ...detectorUndoRef.current } },
      ...undoStackRef.current.slice(0, 19),
    ];
    setCanUndo(true);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const [prev, ...rest] = undoStackRef.current;
    undoStackRef.current = rest;
    setCanUndo(rest.length > 0);
    setPeaks(prev.peaks);
    setCompoundCalibrations(prev.compoundCalibrations);
    saveCompoundCalibrations(prev.compoundCalibrations);
    setIsDirty(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA') return;
        if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'number') return;
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  // Auto-persist to localStorage 400 ms after any state change so peaks survive
  // page refresh without requiring "Confirmar". Confirmar still creates snapshots.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveState({ peaks, sample, detector, standards, calib, activeCompounds, productName });
    }, 400);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, sample, detector, standards, calib, activeCompounds, productName]);

  // Auto-detect calibration compound from padraoConfig.compoundName
  useEffect(() => {
    const name = padraoConfig.compoundName?.trim().toLowerCase();
    if (!name || activeCompounds.length === 0) return;
    const exact = activeCompounds.find(c => c.name.trim().toLowerCase() === name);
    const partial = !exact ? activeCompounds.find(c =>
      c.name.trim().toLowerCase().includes(name) || name.includes(c.name.trim().toLowerCase())
    ) : null;
    const matched = exact ?? partial ?? null;
    if (matched && matched.id !== selectedCalibCompoundId) {
      setSelectedCalibCompoundId(matched.id);
      setCalib(cb => ({ ...cb, compoundName: matched.name, expRT: matched.expectedRT }));
      // Auto-fill certified purity from compound registration
      const purity = matched.certifiedPurity > 0 ? matched.certifiedPurity : 99.5;
      updatePadrao({ stdPurity: purity });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padraoConfig.compoundName, activeCompounds]);

  useEffect(() => {
    const prevTitle = document.title;
    const before = () => { document.title = ""; };
    const after = () => { document.title = prevTitle; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

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

    const snapshotState: PersistedState = { peaks: finalPeaks, sample, detector, standards, calib, activeCompounds: finalActives, productName };
    saveState(snapshotState);

    // ── Also upsert a snapshot session so the Painel always reflects the latest confirmed state ──
    const sessionName = productName.trim() || sample.sampleName.trim() || `Analysis ${new Date().toLocaleDateString("en-US")}`;
    const now = new Date().toISOString();

    const existingSnapshot = currentSnapshotSessionId
      ? analysisSessions.find(s => s.id === currentSnapshotSessionId && s.status === "em_andamento")
      : null;

    let updatedSessions: AnalysisSession[];
    let newSnapshotId: string | null = null;

    if (existingSnapshot) {
      // Update existing draft — refresh name + snapshot
      updatedSessions = analysisSessions.map(s =>
        s.id === existingSnapshot.id ? { ...s, name: sessionName, snapshotState, updatedAt: now } : s
      );
    } else {
      // Create a new snapshot session (previous one was concluded or doesn't exist)
      newSnapshotId = uid();
      const newSession: AnalysisSession = {
        id: newSnapshotId, name: sessionName, notes: "",
        createdAt: now, updatedAt: now, runs: [], status: "em_andamento",
        snapshotState,
      };
      updatedSessions = [...analysisSessions, newSession];
    }

    setAnalysisSessions(updatedSessions);
    saveSessions(updatedSessions);
    if (newSnapshotId) setCurrentSnapshotSessionId(newSnapshotId);

    setIsDirty(false);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
  }, [peaks, sample, detector, standards, calib, activeCompounds, productName, currentSnapshotSessionId, analysisSessions]);

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
    for (const p of peaks.filter(pp => !pp.locked)) {
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

  const handleChartContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const innerW = rect.width - CM_LEFT - CM_RIGHT;
    const mouseX = e.clientX - rect.left;
    let best: { id: string; dist: number } | null = null;
    for (const p of peaks) {
      const px = CM_LEFT + (p.retentionTime / detector.runTime) * innerW;
      const d = Math.abs(mouseX - px);
      if (d < 24 && (!best || d < best.dist)) best = { id: p.id, dist: d };
    }
    if (best) {
      setPeakContextMenu({ x: e.clientX, y: e.clientY, peakId: best.id });
    }
  }, [peaks, detector.runTime]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!peakDragRef.current) return;
    const newRT = xToTime(e.clientX);
    const pid = peakDragRef.current.peakId;
    // Guard: if the peak was locked while dragging, skip position update.
    // Side-effects (clearing peakDragRef / setDraggingPeakId) must NOT run
    // inside the setPeaks updater — that would trigger a React error
    // ("Cannot update a component while rendering a different component").
    // They are handled outside, via the locked-check below and mouseup.
    // The updater returns ps unchanged when the peak is locked or missing,
    // so the peak position is not updated.  Drag cleanup (peakDragRef / draggingPeakId)
    // is handled by handleChartMouseUp and toggleLockPeak — never inside the updater.
    setPeaks(ps => {
      const target = ps.find(p => p.id === pid);
      if (!target || target.locked) return ps;
      return ps.map(p => p.id === pid ? { ...p, retentionTime: newRT } : p);
    });
  }, [xToTime]);

  const handleChartMouseUp = useCallback(() => {
    if (peakDragRef.current) {
      peakDragRef.current = null;
      setDraggingPeakId(null);
      markDirty();
    }
  }, [markDirty]);

  // ── Chromatogram data ────────────────────────────────────────────────────────

  // While the peak editor is open, substitute the preview version of the peak
  // so the chromatogram reflects every slider/input change in real time.
  const peaksForDisplay = useMemo(
    () => previewPeak ? peaks.map(p => p.id === previewPeak.id ? previewPeak : p) : peaks,
    [peaks, previewPeak],
  );

  const chromatogram = useMemo(
    () => buildChromatogram(peaksForDisplay, detector.runTime, 2000, detector.baselineNoise, detector.baselineDrift, detector.baselinePulse, detector.baselineWander ?? 0, detector.shotNoise ?? 0, detector.baselineHump ?? 0, detector.broadeningFactor ?? 0, detector.baselineOffset ?? 0, detector.baselinePulseFreq ?? 1.6, detector.baselineStartOffset ?? 0, detector.baselineStartDecay ?? 1.0, detector.gradientRamp ?? 0, detector.baselineStep ?? 0, detector.baselineStepRT ?? 0, detector.spikeRate ?? 0, detector.baselineDecay ?? 0, detector.wanderFreq ?? 1.0),
    [peaksForDisplay, detector.runTime, detector.baselineNoise, detector.baselineDrift, detector.baselinePulse, detector.baselineWander, detector.shotNoise, detector.baselineHump, detector.broadeningFactor, detector.baselineOffset, detector.baselinePulseFreq, detector.baselineStartOffset, detector.baselineStartDecay, detector.gradientRamp, detector.baselineStep, detector.baselineStepRT, detector.spikeRate, detector.baselineDecay, detector.wanderFreq],
  );

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
    const chrom = buildChromatogram([stdPeakObj], detector.runTime, 2000, detector.baselineNoise, detector.baselineDrift, detector.baselinePulse, detector.baselineWander ?? 0, detector.shotNoise ?? 0, detector.baselineHump ?? 0, detector.broadeningFactor ?? 0, detector.baselineOffset ?? 0, detector.baselinePulseFreq ?? 1.6, detector.baselineStartOffset ?? 0, detector.baselineStartDecay ?? 1.0);
    return { chrom, midStd, namedPeak, stdHeight, level: Math.floor(sorted.length / 2) + 1, total: sorted.length };
  }, [showStdPeak, standards, peaks, calib.compoundName, detector.runTime, detector.baselineNoise, detector.baselineDrift, detector.baselinePulse]);

  const mergedChrom = useMemo(() => {
    if (!stdPeakInfo) return chromatogram;
    const stdMap = new Map(stdPeakInfo.chrom.map(pt => [pt.time, pt.signal]));
    return chromatogram.map(pt => ({ ...pt, stdSignal: stdMap.get(pt.time) ?? 0 }));
  }, [chromatogram, stdPeakInfo]);

  // ── Calibration ──────────────────────────────────────────────────────────────

  const reg = useMemo(() => {
    const pts = standards.map(s => ({ x: s.amount, y: s.area }));
    return linearRegression(pts);
  }, [standards]);

  const peakStats = useMemo(() =>
    [...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map((p, i) => {
      const computedArea    = computeArea(p);
      const correctedArea   = computeBaselineCorrectedArea(p, chromatogram, detector.runTime);
      const effectiveArea   = showBaselines ? correctedArea : computedArea;
      const displayArea     = p.manualArea > 0 ? p.manualArea : effectiveArea;
      // Compute amount automatically: manual > amtPerArea × area > calibration regression
      let calcAmount = 0;
      if (p.amount > 0) {
        calcAmount = p.amount;
      } else if (p.amtPerArea > 0) {
        calcAmount = displayArea * p.amtPerArea;
      } else if (reg.slope > 0) {
        calcAmount = Math.max(0, (displayArea - reg.intercept) / reg.slope);
      }
      return { ...p, peakNum: i + 1, computedArea, correctedArea, displayArea, calcAmount };
    }),
    [peaks, reg, chromatogram, detector.runTime, showBaselines]
  );
  const totalAmount = peakStats.reduce((s, p) => s + p.calcAmount, 0);

  // ── External Standard Result — computed globally, used in Report tab + Peaks table ──
  const padraoExtHasData   = padraoConfig.stdArea > 0 && padraoConfig.smpArea > 0 && padraoConfig.stdAmountUg > 0;
  const padraoExtRatio     = padraoExtHasData ? padraoConfig.smpArea / padraoConfig.stdArea : 0;

  // Prefer calibration-curve regression for back-calc (consistent with ◆ position on graph).
  // Falls back to the 2-point ratio method when no valid curve exists for the compound.
  const padraoFoundUg = (() => {
    if (!padraoExtHasData) return 0;
    // Find the calibration for the matched compound (by name)
    const cname = padraoConfig.compoundName?.trim().toLowerCase() ?? "";
    const matchedCompound = cname
      ? activeCompounds.find(c => c.name.trim().toLowerCase() === cname)
      : null;
    const calib = matchedCompound ? compoundCalibrations[matchedCompound.id] : null;
    if (calib) {
      const validPts = calib.standards.filter(s => s.amount > 0 && s.area > 0);
      if (validPts.length >= 2) {
        const reg = linearRegression(validPts.map(s => ({ x: s.amount, y: s.area })));
        if (reg.slope > 0) {
          // Back-calc from regression: same formula as the ◆ X position on the chart
          return Math.max(0, (padraoConfig.smpArea - reg.intercept) / reg.slope);
        }
      }
    }
    // 2-point ratio fallback
    return padraoExtRatio * padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100);
  })();
  const padraoFoundMg      = padraoFoundUg / 1000;
  const padraoFoundPurity  = padraoExtHasData
    ? (padraoConfig.smpPurity > 0 && Math.abs(padraoConfig.smpPurity - 100) > 0.01
        ? padraoConfig.smpPurity
        : padraoExtRatio * padraoConfig.stdPurity)
    : 0;
  // RT extracted from smpPeakName (e.g. "TR 2.408 min" → 2.408) or fallback to matching peak
  const padraoSmpRT = (() => {
    const m = padraoConfig.smpPeakName.match(/(\d+\.\d+)/);
    return m ? parseFloat(m[1]) : 0;
  })();
  const isPadraoSamplePeak = (p: { name?: string; retentionTime: number }) =>
    padraoExtHasData && (
      (p.name && p.name === padraoConfig.smpPeakName) ||
      (padraoSmpRT > 0 && Math.abs(p.retentionTime - padraoSmpRT) < 0.05)
    );

  const yMaxAuto = useMemo(() => {
    const max = Math.max(...chromatogram.map(d => d.signal), 10);
    const computed = Math.ceil(max * 1.15 / 50) * 50;
    return Math.max(computed, 2000); // always at least 2000 mAU so peak labels are never cut
  }, [chromatogram]);
  const yMax = detector.yAxisAuto ? yMaxAuto : Math.max(detector.yAxisMax, 50);

  const xTicks = useMemo(() => {
    const t: number[] = [];
    for (let v = 2; v <= detector.runTime; v += 2) t.push(parseFloat(v.toFixed(1))); // skip 0 — it overlaps the Y-axis
    return t;
  }, [detector.runTime]);

  const yTicks = useMemo(() => {
    const step = yMax <= 200 ? 50 : yMax <= 500 ? 100 : yMax <= 2000 ? 500 : 1000;
    const t: number[] = [];
    for (let v = 0; v <= yMax; v += step) t.push(v);
    return t;
  }, [yMax]);

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
  // Full line that appears on chromatogram and in reports — can be overridden by user
  const fullSignalLine = (sample.signalLabelOverride ?? "").trim() !== ""
    ? sample.signalLabelOverride!
    : `${signalLabel} (${sample.dataFile})`;

  // ── Now ───────────────────────────────────────────────────────────────────────

  const now = new Date().toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  // ── Peaks ────────────────────────────────────────────────────────────────────

  const addPeak = useCallback(() => {
    pushUndo();
    setPeaks(ps => [...ps, {
      id: uid(), name: "", peakType: "BB", grp: "", amtPerArea: 0, amount: 0, manualArea: 0,
      peakNoise: 0,
      retentionTime: parseFloat((1 + Math.random() * (detector.runTime - 2)).toFixed(3)),
      height: Math.round(10 + Math.random() * 80),
      width: parseFloat((0.04 + Math.random() * 0.08).toFixed(3)),
      asymmetry: parseFloat((0.95 + Math.random() * 0.2).toFixed(2)),
    }]);
    markDirty();
  }, [detector.runTime, markDirty, pushUndo]);

  const addGhostPeak = useCallback(() => {
    // Place ghost near the tallest existing peak, or random if none
    const tallest = peaks.length > 0 ? peaks.reduce((a, b) => a.height > b.height ? a : b) : null;
    const baseRT = tallest
      ? parseFloat((tallest.retentionTime + (Math.random() > 0.5 ? 1 : -1) * (0.08 + Math.random() * 0.18)).toFixed(3))
      : parseFloat((1 + Math.random() * (detector.runTime - 2)).toFixed(3));
    const clampedRT = Math.max(0.1, Math.min(detector.runTime * 0.97, baseRT));
    setPeaks(ps => [...ps, {
      id: uid(),
      name: "",                               // no label shown
      peakType: "BB",
      grp: "",
      amtPerArea: 0,
      amount: 0,
      manualArea: 0,
      peakNoise: parseFloat((0.85 + Math.random() * 0.15).toFixed(2)),  // very rough/defective
      retentionTime: clampedRT,
      height: tallest ? Math.round(tallest.height * (0.25 + Math.random() * 0.35)) : Math.round(10 + Math.random() * 40),
      width: tallest ? parseFloat((tallest.width * (1.1 + Math.random() * 0.6)).toFixed(3)) : parseFloat((0.05 + Math.random() * 0.10).toFixed(3)),
      asymmetry: parseFloat((0.6 + Math.random() * 1.2).toFixed(2)),    // irregular shape
      isGhost: true,
      printSelected: false,
    }]);
    markDirty();
  }, [peaks, detector.runTime, markDirty]);

  const removePeak = (id: string) => {
    const peak = peaks.find(p => p.id === id);
    if (peak?.locked) return;
    pushUndo();
    setPeaks(ps => ps.filter(p => p.id !== id));
    markDirty();
  };
  const savePeak = (updated: Peak) => {
    if (peaks.find(p => p.id === updated.id)?.locked) return;
    pushUndo();
    setPeaks(ps => ps.map(p => p.id === updated.id ? updated : p));
    markDirty();
  };
  const toggleLockPeak = (id: string) => {
    setPeaks(ps => ps.map(p => p.id === id ? { ...p, locked: !p.locked } : p));
    // Close the editor dialog gracefully — deferred so we never trigger a
    // React state update mid-render (which would throw a batching error).
    if (editingPeakId === id) setTimeout(() => closeEditorDialog(), 0);
    // If the peak being locked is currently dragged, stop the drag immediately
    // so the peak stays at its current position and doesn't drift on next mousemove.
    // Check both state value and ref directly to cover batched-update edge cases.
    if (peakDragRef.current?.peakId === id || draggingPeakId === id) {
      peakDragRef.current = null;
      setDraggingPeakId(null);
    }
    markDirty();
  };

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

  // ── Per-compound calibration helpers ─────────────────────────────────────────

  const getCC = (compoundId: string): CompoundCalibration => {
    const saved = compoundCalibrations[compoundId];
    if (saved) {
      // Detect stale DEFAULT_STANDARDS: all area values match the generic module defaults.
      // If so, auto-upgrade to per-compound generated standards (preserves saved calib metadata).
      const defaultAreaSet = new Set([296.16348, 620.81195, 1286.75647, 1737.21973, 2530.36230]);
      const isStaleDefault = saved.standards.length > 0 &&
        saved.standards.every(s => defaultAreaSet.has(s.area));
      if (!isStaleDefault) return saved;
      // Fall through: regenerate standards but keep the saved calib settings
      const c = activeCompounds.find(ac => ac.id === compoundId);
      return {
        calib: saved.calib,
        standards: c ? makeDefaultCompoundStandards(c) : DEFAULT_STANDARDS.map(s => ({ ...s, id: uid() })),
      };
    }
    const c = activeCompounds.find(ac => ac.id === compoundId);
    return {
      calib: { ...DEFAULT_CALIB, compoundName: c?.name ?? "", expRT: c?.expectedRT ?? 0 },
      standards: c ? makeDefaultCompoundStandards(c) : DEFAULT_STANDARDS.map(s => ({ ...s, id: uid() })),
    };
  };

  const updateCompoundCalibField = (compoundId: string, key: keyof CalibInfo, value: string | number) => {
    pushUndo();
    setCompoundCalibrations(cc => {
      const existing = cc[compoundId] ?? getCC(compoundId);
      const updated = { ...cc, [compoundId]: { ...existing, calib: { ...existing.calib, [key]: value } } };
      saveCompoundCalibrations(updated);
      return updated;
    });
    markDirty();
  };

  const addCompoundStandard = (compoundId: string) => {
    pushUndo();
    setCompoundCalibrations(cc => {
      const existing = cc[compoundId] ?? getCC(compoundId);
      const n = existing.standards.length + 1;
      const compound = activeCompounds.find(c => c.id === compoundId);
      // Use compound's real slope to assign a realistic area to the new level
      const slope = compound && compound.amtPerArea > 0 ? 1 / compound.amtPerArea : 25;
      const amount = 10 * n;
      // derive intercept from existing regression if available, else 0
      const reg = existing.standards.length >= 2
        ? linearRegression(existing.standards.map(s => ({ x: s.amount, y: s.area })))
        : null;
      const intercept = reg ? reg.intercept : 0;
      const seedChar = compoundId.charCodeAt(compoundId.length - 1);
      const jitter = 1 + pseudoNoise(n * 31 + seedChar) * 0.005;
      const area = parseFloat(((slope * amount + intercept) * jitter).toFixed(4));
      const newStd: CalibStandard = { id: uid(), level: n, amount, area: Math.max(1, area) };
      const updated = { ...cc, [compoundId]: { ...existing, standards: [...existing.standards, newStd] } };
      saveCompoundCalibrations(updated);
      return updated;
    });
    markDirty();
  };

  const removeCompoundStandard = (compoundId: string, stdId: string) => {
    pushUndo();
    setCompoundCalibrations(cc => {
      const existing = cc[compoundId] ?? getCC(compoundId);
      const updated = { ...cc, [compoundId]: { ...existing, standards: existing.standards.filter(s => s.id !== stdId) } };
      saveCompoundCalibrations(updated);
      return updated;
    });
    markDirty();
  };

  const lockPadrao = () => {
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: "Enter the manager password to LOCK the Reference Standard. Once locked, editing Area, Amount and Purity requires the password.",
      buttonLabel: "🔒 Lock Standard",
      onSuccess: () => { setPadraoLocked(true); savePadraoLocked(true); },
    });
  };
  const unlockPadrao = () => {
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: "Enter the manager password to UNLOCK the Reference Standard for editing.",
      buttonLabel: "🔓 Unlock Standard",
      onSuccess: () => { setPadraoLocked(false); savePadraoLocked(false); },
    });
  };
  const lockSmpPurity = () => {
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: `Lock Pureza da amostra at ${padraoConfig.smpPurity.toFixed(2)}%. Once locked, no baseline change or peak capture can overwrite this value.`,
      buttonLabel: "🔒 Save & Lock Purity",
      onSuccess: () => { setSmpPurityLocked(true); saveSmpPurityLocked(true); },
    });
  };
  const unlockSmpPurity = () => {
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: "Enter the manager password to UNLOCK Pureza da amostra for editing.",
      buttonLabel: "🔓 Unlock Purity",
      onSuccess: () => { setSmpPurityLocked(false); saveSmpPurityLocked(false); },
    });
  };
  // Syncs the matched sample peak's manualArea (and back-calculated height) to match
  // whatever value is canonical in padraoConfig.smpArea — call this everywhere smpArea changes.
  const syncSmpPeakManualArea = (area: number) => {
    const smpName = padraoConfig.smpPeakName;
    const cmpName = padraoConfig.compoundName;
    const smpRT   = padraoSmpRT;
    if (area <= 0) return;
    setPeaks(ps => ps.map(p => {
      const nameMatch = (!!smpName && p.name === smpName) || (!!cmpName && p.name === cmpName);
      const rtMatch   = smpRT > 0 && Math.abs(p.retentionTime - smpRT) < 0.05;
      if (!nameMatch && !rtMatch) return p;
      const curArea   = p.manualArea > 0 ? p.manualArea : computeArea(p);
      const newHeight = curArea > 0 ? parseFloat((p.height * (area / curArea)).toFixed(4)) : p.height;
      return { ...p, height: newHeight, manualArea: parseFloat(area.toFixed(5)) };
    }));
  };
  const updateSmpPurity = (v: number) => {
    if (smpPurityLocked) {
      setMasterAuthInput("");
      setMasterAuthError(null);
      setMasterAuthDialog({
        description: `Pureza da amostra is locked at ${padraoConfig.smpPurity.toFixed(2)}%. Enter the manager password to edit.`,
        buttonLabel: "✏️ Edit Purity",
        onSuccess: () => {
          const clamped = Math.max(0.01, v || 100);
          const stdA = padraoConfig.stdArea;
          const stdP = padraoConfig.stdPurity;
          const newArea = stdA > 0 && stdP > 0 ? parseFloat((stdA * clamped / stdP).toFixed(5)) : padraoConfig.smpArea;
          updatePadrao({ smpPurity: clamped, smpArea: newArea, smpRawArea: stdA });
          syncSmpPeakManualArea(newArea);
        },
      });
    } else {
      const clamped = Math.max(0.01, v || 100);
      const stdA = padraoConfig.stdArea;
      const stdP = padraoConfig.stdPurity;
      const newArea = stdA > 0 && stdP > 0 ? parseFloat((stdA * clamped / stdP).toFixed(5)) : padraoConfig.smpArea;
      updatePadrao({ smpPurity: clamped, smpArea: newArea, smpRawArea: stdA });
      syncSmpPeakManualArea(newArea);
    }
  };
  const updatePadraoProtected = (patchData: Partial<PadraoConfig>, changedBy?: string) => {
    const protectedKeys: (keyof PadraoConfig)[] = ["stdArea", "stdAmountUg", "stdPurity", "compoundName"];
    const hasProtected = (Object.keys(patchData) as (keyof PadraoConfig)[]).some(k => protectedKeys.includes(k));
    if (padraoLocked && hasProtected) {
      setMasterAuthInput("");
      setMasterAuthError(null);
      setMasterAuthDialog({
        description: "Reference Standard is locked. Enter the manager password to edit this field.",
        buttonLabel: "✏️ Edit Standard",
        onSuccess: () => { updatePadrao(patchData, { changedBy: changedBy ?? "manager" }); },
      });
    } else {
      updatePadrao(patchData, { changedBy });
    }
  };
  const lockCompoundCalib = (compoundId: string) => {
    const name = activeCompounds.find(c => c.id === compoundId)?.name ?? compoundId;
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: `Enter the manager password to LOCK the calibration curve for "${name}". Once locked, it cannot be edited without the password.`,
      buttonLabel: "🔒 Lock Curve",
      onSuccess: () => {
        setCompoundCalibrations(cc => {
          const existing = cc[compoundId] ?? getCC(compoundId);
          const updated = { ...cc, [compoundId]: { ...existing, locked: true } };
          saveCompoundCalibrations(updated);
          return updated;
        });
      },
    });
  };

  const unlockCompoundCalib = (compoundId: string) => {
    const name = activeCompounds.find(c => c.id === compoundId)?.name ?? compoundId;
    setMasterAuthInput("");
    setMasterAuthError(null);
    setMasterAuthDialog({
      description: `Enter the manager password to UNLOCK the calibration curve for "${name}".`,
      buttonLabel: "🔓 Unlock Curve",
      onSuccess: () => {
        setCompoundCalibrations(cc => {
          const existing = cc[compoundId] ?? getCC(compoundId);
          const updated = { ...cc, [compoundId]: { ...existing, locked: false } };
          saveCompoundCalibrations(updated);
          return updated;
        });
      },
    });
  };

  const updateCompoundStandard = (compoundId: string, stdId: string, key: "amount" | "area", val: number) => {
    setCompoundCalibrations(cc => {
      const existing = cc[compoundId] ?? getCC(compoundId);
      const updated = { ...cc, [compoundId]: { ...existing, standards: existing.standards.map(s => s.id === stdId ? { ...s, [key]: val } : s) } };
      saveCompoundCalibrations(updated);
      return updated;
    });
    markDirty();
  };

  // Captura a área do pico identificado no cromatograma atual e preenche o nível de calibração
  const captureCalibArea = (compoundId: string, stdId: string) => {
    const existing = compoundCalibrations[compoundId] ?? getCC(compoundId);
    const allStds   = existing.standards;
    const thisStd   = allStds.find(s => s.id === stdId);
    const compound  = activeCompounds.find(c => c.id === compoundId);

    // ── 1. PADRÃO DE REFERÊNCIA — máxima prioridade ─────────────────────────────
    // Se padraoConfig tem stdArea e stdAmountUg válidos, calcula a área de cada nível
    // proporcionalmente: Rf = stdArea / (stdAmountUg × stdPurity%) → área_i = Rf × amount_i
    if (thisStd && thisStd.amount > 0 &&
        padraoConfig.stdArea > 0 && padraoConfig.stdAmountUg > 0) {
      const purity     = padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity / 100 : 1;
      const effectiveAmt = padraoConfig.stdAmountUg * purity;      // µg real injetado
      const rf         = padraoConfig.stdArea / effectiveAmt;      // mAU·s / µg·mL⁻¹
      const predicted  = rf * thisStd.amount;
      if (predicted > 0) {
        // Ruído analítico determinístico (±0.15–0.30%) — garante Correlation < 1.00000
        const nh = [...stdId].reduce((a, c) => ((a * 127 + c.charCodeAt(0)) & 0xffff), 0);
        const ns = (nh & 1) ? 1 : -1;
        const nm = 0.0015 + (nh % 4) * 0.0005;          // 0.15 / 0.20 / 0.25 / 0.30 %
        const finalArea = parseFloat((predicted * (1 + ns * nm)).toFixed(4));
        updateCompoundStandard(compoundId, stdId, "area", finalArea);
        toast({
          title: "✓ Área calculada pelo Padrão de Referência",
          description:
            `Nível ${thisStd.amount} µg/ml → ${finalArea.toFixed(3)} mAU·s` +
            `  |  Rf = ${rf.toFixed(4)} mAU·s·µg⁻¹` +
            `  |  Std: ${padraoConfig.stdArea.toFixed(3)} mAU·s / ${effectiveAmt.toFixed(4)} µg`,
        });
        return;
      }
    }

    // ── 2. Leave-one-out regression ──────────────────────────────────────────────
    // Sem padrão de referência: usa os outros níveis para prever a área deste
    if (thisStd && thisStd.amount > 0) {
      const others = allStds.filter(s => s.id !== stdId && s.amount > 0 && s.area > 0);
      if (others.length >= 2) {
        const reg = linearRegression(others.map(s => ({ x: s.amount, y: s.area })));
        if (reg.slope !== 0 || reg.intercept !== 0) {
          const predicted = reg.slope * thisStd.amount + reg.intercept;
          if (predicted > 0) {
            // Ruído analítico determinístico (±0.15–0.30%) — garante Correlation < 1.00000
            const nh = [...stdId].reduce((a, c) => ((a * 127 + c.charCodeAt(0)) & 0xffff), 0);
            const ns = (nh & 1) ? 1 : -1;
            const nm = 0.0015 + (nh % 4) * 0.0005;
            const finalArea = parseFloat((predicted * (1 + ns * nm)).toFixed(4));
            updateCompoundStandard(compoundId, stdId, "area", finalArea);
            const r2 = (reg.r * reg.r).toFixed(4);
            toast({
              title: "✓ Área calculada pela regressão (L1O)",
              description: `Nível ${thisStd.amount} µg/ml → ${finalArea.toFixed(3)} mAU·s` +
                ` (${others.length} pontos · R²=${r2} · slope=${reg.slope.toFixed(4)})`,
            });
            return;
          }
        }
      }
    }

    // ── 3. Fallback: capture from chromatogram peak ──────────────────────────────
    if (!compound) return;
    const matchPeak = peaks.find(p => {
      const nameMatch = !!(p.name && (
        p.name.toLowerCase().includes(compound.name.toLowerCase()) ||
        compound.name.toLowerCase().includes(p.name.toLowerCase())
      ));
      const rtMatch = Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol;
      return nameMatch || rtMatch;
    });
    if (!matchPeak) {
      toast({
        title: "⚠ Pico não encontrado no cromatograma",
        description: padraoConfig.stdArea <= 0 || padraoConfig.stdAmountUg <= 0
          ? `Preencha o PADRÃO DE REFERÊNCIA (stdArea e stdAmountUg) para calcular automaticamente, ` +
            `ou configure um pico RT ≈ ${compound.expectedRT.toFixed(3)} min no cromatograma.`
          : `Configure um pico com RT ≈ ${compound.expectedRT.toFixed(3)} min para o composto "${compound.name}".`,
        variant: "destructive",
      });
      return;
    }
    const area = parseFloat((matchPeak.manualArea > 0 ? matchPeak.manualArea : computeArea(matchPeak)).toFixed(4));
    updateCompoundStandard(compoundId, stdId, "area", area);
    toast({
      title: "📥 Área capturada do cromatograma",
      description: `${area.toFixed(3)} mAU·s — pico "${matchPeak.name || `RT ${matchPeak.retentionTime.toFixed(3)}`}"` +
        (padraoConfig.stdArea <= 0 || padraoConfig.stdAmountUg <= 0
          ? " · Preencha o Padrão de Referência para usar o cálculo automático"
          : ""),
    });
  };

  // Simula curva completa: gera áreas para todos os níveis proporcionalmente ao pico atual
  const simulateCalibCurve = (compoundId: string) => {
    const compound = activeCompounds.find(c => c.id === compoundId);
    if (!compound) return;
    pushUndo();
    const matchPeak = peaks.find(p => {
      const nameMatch = !!(p.name && (
        p.name.toLowerCase().includes(compound.name.toLowerCase()) ||
        compound.name.toLowerCase().includes(p.name.toLowerCase())
      ));
      const rtMatch = Math.abs(p.retentionTime - compound.expectedRT) <= compound.rtTol;
      return nameMatch || rtMatch;
    });
    if (!matchPeak) {
      window.alert(`Configure a peak for "${compound.name}" (RT ≈ ${compound.expectedRT} min) before simulating the curve.`);
      return;
    }
    const refArea = matchPeak.manualArea > 0 ? matchPeak.manualArea : computeArea(matchPeak);
    setCompoundCalibrations(cc => {
      const existing = cc[compoundId] ?? getCC(compoundId);
      const sorted = [...existing.standards].sort((a, b) => a.amount - b.amount);
      if (sorted.length === 0) return cc;
      // Usa o nível do meio como referência; os outros níveis são calculados proporcionalmente
      const midIdx = Math.floor(sorted.length / 2);
      const refAmount = sorted[midIdx].amount;
      if (refAmount <= 0) return cc;
      // Gera variação determinística por nível (2.5–5%) para r < 0.99989
      const newStds = existing.standards.map(s => {
        const levelIdx = sorted.findIndex(x => x.id === s.id);
        const e1 = pseudoNoise(levelIdx * 17  + compoundId.charCodeAt(0) * 3);
        const e2 = pseudoNoise(levelIdx * 101 + compoundId.charCodeAt(compoundId.length - 1) * 7) * 0.4;
        const jitter = 1 + (e1 + e2) / 1.4 * 0.050;
        const area = parseFloat((refArea * (s.amount / refAmount) * jitter).toFixed(4));
        return { ...s, area: Math.max(0, area) };
      });
      const updated = { ...cc, [compoundId]: { ...existing, standards: newStds } };
      saveCompoundCalibrations(updated);
      return updated;
    });
    markDirty();
  };

  // ── File attachment per peak ──────────────────────────────────────────────────

  const handlePeakFileOpen = (peakId: string) => {
    const pk = peaks.find(p => p.id === peakId);
    if (pk?.locked) return;
    fileTargetPeakIdRef.current = peakId;
    fileInputRef.current?.click();
  };

  const handlePeakFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const peakId = fileTargetPeakIdRef.current;
    if (!file || !peakId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const rtMatch = text.match(/ret(?:ention)?[\s._\-]?time[\s:=,\t]+([0-9]+\.?[0-9]*)/i);
      const areaMatch = text.match(/\barea[\s:=,\t]+([0-9]+\.?[0-9]*)/i);
      setPeaks(ps => ps.map(p => {
        if (p.id !== peakId || p.locked) return p;
        const updated: Peak = { ...p, attachedFile: file.name };
        if (rtMatch) updated.retentionTime = parseFloat(rtMatch[1]);
        if (areaMatch) updated.manualArea = parseFloat(areaMatch[1]);
        return updated;
      }));
      markDirty();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const sField = (k: keyof SampleInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSample(s => {
      if (k === "acqMethod") {
        return { ...s, acqMethod: val, analysisMethod: syncMethodPeer("acqMethod", val, s.analysisMethod) };
      }
      if (k === "analysisMethod") {
        return { ...s, analysisMethod: val, acqMethod: syncMethodPeer("analysisMethod", val, s.acqMethod) };
      }
      if (k === "sampleName") {
        const safe = val.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, 24) || "SAMPLE";
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const ts = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${now.getHours() >= 12 ? "PM" : "AM"} by ${s.acqOperator || "LAB"}`;
        const newAcqMethod = `C:\\CHEM32\\1\\DATA\\${safe} ${dateStr} ${timeStr}\\${safe}.M`;
        const newAnalysisMethod = `C:\\CHEM32\\1\\METHODS\\${safe}.M`;
        return { ...s, sampleName: val, acqMethod: newAcqMethod, analysisMethod: newAnalysisMethod, lastChanged1: ts, lastChanged2: ts };
      }
      if (k === "dataFile") {
        // Extract date (and optional time) from path.
        // Accepts:  "…\NOME 2025-04-23 12-55-35\…"  (date + time)
        //        or "…\NOME 2025-04-23\…"             (date only)
        const m = val.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2})-(\d{2})-(\d{2}))?/);
        if (m) {
          const [, yr, mo, day, hh = "00", mm = "00", ss = "00"] = m;
          const h = parseInt(hh, 10);
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          const h12Str = String(h12).padStart(2, "0");
          const dateFormatted = `${mo}/${day}/${yr} ${h12Str}:${mm}:${ss} ${ampm}`;
          const byOp = ` by ${s.acqOperator || "LAB"}`;
          return {
            ...s,
            dataFile: val,
            injectionDate: dateFormatted,
            lastChanged1: dateFormatted + byOp,
            lastChanged2: dateFormatted + byOp,
          };
        }
        return { ...s, dataFile: val };
      }
      return { ...s, [k]: val };
    });
    markDirty();
  };
  const dField = (k: keyof DetectorInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericKeys: (keyof DetectorInfo)[] = ["runTime", "sigWavelength", "sigBandwidth", "refWavelength", "refBandwidth", "baselineNoise", "baselineDrift", "baselinePulse", "baselineWander", "shotNoise", "baselineHump", "broadeningFactor", "lineWidth", "baselineStartOffset", "baselineStartDecay"];
    setDetector(d => ({ ...d, [k]: numericKeys.includes(k) ? parseFloat(e.target.value) || 0 : e.target.value }));
    markDirty();
  };
  const cField = (k: keyof CalibInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCalib(c => ({ ...c, [k]: (["expRT"] as (keyof CalibInfo)[]).includes(k) ? parseFloat(val) || 0 : val }));
    // When compound name changes, auto-sync the .M filename in both method paths.
    // e.g. compound "B6" → analysisMethod ends in \B6.M; "Vitamina D" → \VITAMINA D.M
    if (k === "compoundName" && val.trim()) {
      const newFilename = val.trim().toUpperCase() + ".M";
      setSample(s => ({
        ...s,
        analysisMethod: applyMethodFilename(s.analysisMethod, newFilename),
        acqMethod:      applyMethodFilename(s.acqMethod,      newFilename),
      }));
    }
    markDirty();
  };

  // ── Active Compounds ─────────────────────────────────────────────────────────

  const addActiveCompound = () => {
    // ── 1. Find peaks that have no matching compound yet ────────────────────────
    const unmatchedPeaks = peaks.filter(p =>
      !activeCompounds.some(c =>
        Math.abs(c.expectedRT - p.retentionTime) <= (c.rtTol || 0.15) &&
        Math.abs(c.wavelength - detector.sigWavelength) <= (c.waveTol || 8)
      )
    );
    const template = unmatchedPeaks[0] ?? null; // first unmatched peak → use as template

    // ── 2. Generate a unique compound name ─────────────────────────────────────
    const existingNames = new Set(activeCompounds.map(c => c.name.trim().toLowerCase()));
    let candidateName = template?.name?.trim() ?? "";
    if (!candidateName || existingNames.has(candidateName.toLowerCase())) {
      let i = activeCompounds.length + 1;
      while (existingNames.has(`composto ${i}`)) i++;
      candidateName = `Composto ${i}`;
    }

    // ── 3. Choose RT: from template, or next free slot ─────────────────────────
    const usedRTs = activeCompounds.map(c => c.expectedRT);
    let candidateRT = template?.retentionTime ?? (
      usedRTs.length > 0 ? parseFloat((Math.max(...usedRTs) + 1.5).toFixed(3)) : 2.0
    );

    // ── 4. Duplicate guard — same λ ± 5 nm AND RT ± 0.10 min ─────────────────
    const isDupRT = activeCompounds.some(c =>
      Math.abs(c.expectedRT - candidateRT) <= 0.10 &&
      Math.abs(c.wavelength - detector.sigWavelength) <= 5
    );
    if (isDupRT && !template) {
      // Bump RT to an unoccupied slot
      candidateRT = parseFloat((
        usedRTs.length > 0 ? Math.max(...usedRTs) + 1.5 : 2.0
      ).toFixed(3));
    }
    const isDupName = existingNames.has(candidateName.toLowerCase());
    if (isDupRT && isDupName) {
      toast({
        title: "Composto já existe",
        description: `Já há um composto em TR≈${candidateRT.toFixed(2)} min com λ=${detector.sigWavelength} nm. Edite o existente ou altere o detector.`,
        variant: "destructive",
      });
      return;
    }

    // ── 5. Build the new compound from template or smart defaults ─────────────
    const newCompound: ActiveCompound = {
      id: uid(),
      name: candidateName,
      wavelength: detector.sigWavelength,
      waveTol: 8,
      expectedRT: candidateRT,
      rtTol: 0.15,
      typicalWidth: template ? parseFloat(template.width.toFixed(4)) : 0.030,
      typicalAsym: template ? parseFloat(template.asymmetry.toFixed(3)) : 1.15,
      amtPerArea: (template?.amtPerArea ?? 0) > 0 ? template!.amtPerArea : 0.03,
      units: "ug/ml",
      specMin: 0,
      specMax: 0,
      certifiedPurity: 99.5,
      method: sample.analysisMethod || "",
      notes: "",
      stdArea: 0,
      stdAmountUg: 0,
    };

    setActiveCompounds(cs => [...cs, newCompound]);

    // ── 6. Add / update the corresponding peak in the chromatogram ─────────────
    if (template) {
      // Update the existing unmatched peak: give it the compound name + response factor
      setPeaks(ps => ps.map(p =>
        p.id === template.id
          ? { ...p, name: newCompound.name, amtPerArea: newCompound.amtPerArea }
          : p
      ));
    } else {
      // No existing peak → create a new one at the chosen RT
      setPeaks(ps => [...ps, {
        id: uid(),
        name: newCompound.name,
        peakType: "BB",
        grp: "",
        retentionTime: newCompound.expectedRT,
        height: 200,
        width: newCompound.typicalWidth,
        asymmetry: newCompound.typicalAsym,
        amtPerArea: newCompound.amtPerArea,
        amount: 0,
        manualArea: 0,
        peakNoise: 0,
        printSelected: true,
      }]);
    }

    toast({
      title: "Composto adicionado",
      description: template
        ? `"${newCompound.name}" criado a partir do pico TR=${newCompound.expectedRT.toFixed(3)} min — edite o composto para ajustar os parâmetros.`
        : `"${newCompound.name}" criado com pico novo em TR=${newCompound.expectedRT.toFixed(3)} min.`,
    });

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
      if (!res.ok) throw new Error("Error loading users.");
      setUserList(await res.json() as UserRecord[]);
    } catch (e) {
      setUserListError((e as Error).message);
    } finally {
      setUserListLoading(false);
    }
  }, [token]);

  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggleHplcAccess = async (userId: number, current: boolean) => {
    if (!token || togglingId) return;
    setTogglingId(userId);
    setToggleError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hplcAccess: !current }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar acesso.");
      const updated = await res.json() as UserRecord;
      setUserList(ul => ul.map(u => u.id === userId ? { ...u, hplcAccess: updated.hplcAccess } : u));
    } catch (e) {
      setToggleError((e as Error).message);
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
      reportDate:    injDate,
      softwareRev:   DEFAULT_SAMPLE.softwareRev,
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
      if (!session) return ss;
      const runIndex = session.runs.length;
      const run: AnalysisRun = {
        id: uid(),
        runNumber: runIndex + 1,
        label: `R${runIndex + 1}`,
        createdAt: new Date().toISOString(),
        peaks: applyRunVariation([...peaks], runIndex),
        sample: { ...sample },
        color: runColor(runIndex),
      };
      const updated = ss.map(s => s.id === currentSessionId ? { ...s, runs: [...s.runs, run] } : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleDeleteRun = (sessionId: string, runId: string) => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId
        ? { ...s, runs: s.runs.filter(r => r.id !== runId).map((r, i) => ({ ...r, runNumber: i + 1, label: `R${i + 1}`, color: runColor(i) })) }
        : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleToggleRunHidden = (sessionId: string, runId: string) => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId
        ? { ...s, runs: s.runs.map(r => r.id === runId ? { ...r, hidden: !r.hidden } : r) }
        : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleDeleteSession = (id: string) => {
    // Soft-archive on server (data is never permanently deleted)
    archiveSessionOnServer(id);
    // Remove from local view + localStorage
    setAnalysisSessions(ss => { const u = ss.filter(s => s.id !== id); saveSessions(u); return u; });
    if (currentSessionId === id) setCurrentSessionId(null);
    if (unlockedSessionId === id) setUnlockedSessionId(null);
  };

  const handleMasterAuth = async () => {
    if (!masterAuthDialog) return;
    setMasterAuthLoading(true);
    setMasterAuthError(null);
    try {
      const token = sessionStorage.getItem("alphafitus_token") ?? "";
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: masterAuthInput }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setMasterAuthError(data.error ?? "Incorrect Master password.");
        return;
      }
      masterAuthDialog.onSuccess();
      setMasterAuthDialog(null);
      setMasterAuthInput("");
    } catch {
      setMasterAuthError("Error verifying password.");
    } finally {
      setMasterAuthLoading(false);
    }
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
        setDeleteSessionError(data.error ?? "Incorrect password.");
        return;
      }
      handleDeleteSession(deleteSessionDialog.id);
      setDeleteSessionDialog(null);
      setDeleteSessionPwd("");
    } catch {
      setDeleteSessionError("Error verifying password.");
    } finally {
      setDeleteSessionLoading(false);
    }
  };

  const handleConcludeSession = (sessionId: string, status: "em_andamento" | "aprovado" | "reprovado", notes?: string) => {
    // When concluding (locking), clear any active master unlock for that session
    if (status !== "em_andamento") {
      setUnlockedSessionId(prev => prev === sessionId ? null : prev);
    }
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId ? {
        ...s,
        status,
        concludedAt: status !== "em_andamento" ? new Date().toISOString() : s.concludedAt,
        conclusionNotes: notes !== undefined ? notes : s.conclusionNotes,
      } : s);
      saveSessions(updated);
      return updated;
    });
  };

  const handleLoadSnapshotSession = (session: AnalysisSession) => {
    if (!session.snapshotState) return;
    const s = session.snapshotState;
    setPeaks(s.peaks ?? DEFAULT_PEAKS);
    setSample(s.sample ?? DEFAULT_SAMPLE);
    setDetector(s.detector ?? DEFAULT_DETECTOR);
    setStandards(s.standards ?? DEFAULT_STANDARDS);
    setCalib(s.calib ?? DEFAULT_CALIB);
    setActiveCompounds(s.activeCompounds ?? DEFAULT_ACTIVE_COMPOUNDS);
    setProductName(s.productName ?? "");
    setCurrentSnapshotSessionId(session.id);
    setIsDirty(false);
    saveState(s);
    setPage("chromatogram");
  };

  const handleNewAnalysis = () => {
    setPeaks(DEFAULT_PEAKS);
    setSample(DEFAULT_SAMPLE);
    setDetector(DEFAULT_DETECTOR);
    setStandards(DEFAULT_STANDARDS);
    setCalib(DEFAULT_CALIB);
    setActiveCompounds(DEFAULT_ACTIVE_COMPOUNDS);
    setProductName("");
    prevCalibNameRef.current = DEFAULT_CALIB.compoundName;
    setCurrentSnapshotSessionId(null);
    setUnlockedSessionId(null);
    setIsDirty(false);
    setConfirmed(false);
    saveState({ peaks: DEFAULT_PEAKS, sample: DEFAULT_SAMPLE, detector: DEFAULT_DETECTOR, standards: DEFAULT_STANDARDS, calib: DEFAULT_CALIB, activeCompounds: DEFAULT_ACTIVE_COMPOUNDS, productName: "" });
    setPage("sessoes");
    setNewAnalysisDialog(false);
  };

  const handleEmitLaudo = (sessionId: string) => {
    setAnalysisSessions(ss => {
      const updated = ss.map(s => s.id === sessionId ? { ...s, status: "laudo_emitido" as const, laudoEmittedAt: new Date().toISOString() } : s);
      saveSessions(updated);
      return updated;
    });
  };

  // Opens dialog asking for certificate number before saving
  const handleSavePng = (sessionId: string, redirectToGallery = false) => {
    const session = analysisSessions.find(s => s.id === sessionId);
    if (!session || session.runs.length === 0) return;
    setSavePngCertNum("");
    setSavePngDialog({ sessionId, redirectToGallery });
  };

  const handleConfirmSavePng = () => {
    if (!savePngDialog) return;
    const { sessionId, redirectToGallery } = savePngDialog;
    const session = analysisSessions.find(s => s.id === sessionId);
    const formula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
    if (!session || !formula) { setSavePngDialog(null); return; }
    const std = formulaStandards.find(s => s.formulaId === session.formulaId) ?? null;
    const dataUrl = buildChromatogramPng(session, formula, std, reg);
    if (!dataUrl) { setSavePngDialog(null); return; }
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
      certificateNumber: savePngCertNum.trim() || undefined,
    };
    setSavedImages(imgs => { const u = [...imgs, img]; saveSavedImages(u); return u; });
    setSavePngDialog(null);
    // Optionally redirect to sessoes gallery
    if (redirectToGallery) {
      setPage("sessoes");
      setTimeout(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
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
      peakNoise: 0,
    }]);
    setPage("chromatogram");
    markDirty();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const MONO: React.CSSProperties = { fontFamily: "Courier New, monospace" };

  // ── Session lock derived values ────────────────────────────────────────────
  // When the snapshot session linked to the current chromatogram was concluded
  // (aprovado / reprovado / laudo_emitido), every editing page is locked until
  // the user authenticates with the Master password.
  const snapshotSession = currentSnapshotSessionId
    ? analysisSessions.find(s => s.id === currentSnapshotSessionId) ?? null
    : null;
  const snapshotIsLocked = !!(
    snapshotSession &&
    snapshotSession.status !== "em_andamento" &&
    unlockedSessionId !== currentSnapshotSessionId
  );
  const LOCK_PAGES: PageMode[] = ["chromatogram", "report", "ativos", "lotes", "padrao"];

  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", padding: "12px 8px" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="no-print max-w-[1160px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        <FlaskConical className="h-5 w-5 text-blue-700" />
        <span style={{ ...MONO, fontWeight: "bold", fontSize: 13 }}>Agilent ChemStation</span>
        <div className="flex-1" />
        <div style={{ display: "flex", border: "1px solid #bbb", borderRadius: 4, overflow: "hidden" }}>
          {/* Painel button navigates to /dashboard */}
          <button onClick={() => navigate("/dashboard")} style={{
            ...MONO, fontSize: 11, padding: "4px 12px", cursor: "pointer",
            background: "#fff", color: "#333",
            border: "none",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <LayoutDashboard style={{ width: 13, height: 13 }} /> Dashboard
          </button>
          {(([
            ["sessoes", "Sessions", ScrollText, false],
            ["chromatogram", "Chromatogram", BarChart3, false],
            ["ativos", "Compounds", Database, false],
            ["lotes", "Lots", Layers, false],
            ["analise", "Analysis", FlaskConical, false],
            ["padrao", "Standard", Scale, false],
            ["report", "Calibration Curve", FileText, false],
            ["usuarios", "Usuários", Users, true],
          ] as [PageMode, string, React.ElementType, boolean][]).filter(([,, , adminOnly]) => !adminOnly || isAdmin)).map(([mode, label, Icon], idx) => (
            <button key={mode} onClick={() => {
              setPage(mode);
              if (mode === "usuarios") fetchUsers();
            }} style={{
              ...MONO, fontSize: 11, padding: "4px 12px", cursor: "pointer",
              background: page === mode ? "#1d4ed8" : "#fff",
              color: page === mode ? "#fff" : "#333",
              border: "none", borderLeft: "1px solid #bbb",
              display: "flex", alignItems: "center", gap: 4, position: "relative",
            }}>
              <Icon style={{ width: 13, height: 13 }} /> {label}
              {mode === "padrao" && validatePadrao(padraoConfig).some(a => a.severity === "error") && page !== "padrao" && (
                <span style={{ position: "absolute", top: 2, right: 3, width: 7, height: 7, borderRadius: "50%", background: "#dc2626", display: "block" }} />
              )}
              {mode === "padrao" && padraoLocked && (
                <Lock style={{ width: 9, height: 9, color: page === mode ? "#fbbf24" : "#f59e0b", marginLeft: 1 }} />
              )}
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
            <Check className="h-3.5 w-3.5" /> Confirm
          </Button>
        )}
        {confirmed && !isDirty && (
          <span className="flex items-center gap-1 text-xs text-green-700 font-medium px-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved to Sessions
          </span>
        )}

        {/* ── Concluir — opens finalization dialog for the active snapshot session ── */}
        {(() => {
          const activeSnap = currentSnapshotSessionId
            ? analysisSessions.find(s => s.id === currentSnapshotSessionId && s.status === "em_andamento")
            : null;
          return activeSnap ? (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setFinalizeStatus("aprovado");
                setFinalizeNotes("");
                setFinalizeDialog({ id: activeSnap.id, name: activeSnap.name });
              }}
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> Conclude
            </Button>
          ) : null;
        })()}

        {/* ── New Analysis ── */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={() => { setNewAnalysisForm({ ...sample }); setNewAnalysisDialog(true); }}
        >
          <Plus className="h-3.5 w-3.5" /> New Analysis
        </Button>

        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={!canUndo} onClick={handleUndo}
          title="Undo last change (Ctrl+Z)">
          ↩ Undo
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.location.reload()}>
          ↺ Refresh
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </Button>
        {user && (
          <div className="flex items-center gap-2 border-l border-gray-300 pl-3 ml-1">
            <span style={{ ...MONO, fontSize: 11, color: "#444" }}>{user.displayName}</span>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1 text-slate-600 hover:text-slate-800 hover:bg-slate-100"
              onClick={() => navigate("/dashboard")}>
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={async () => { await logout(); const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""; window.location.replace(base + "/login"); }}>
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-[1160px] mx-auto flex gap-3 items-start">

        {/* ── LEFT: controls ───────────────────────────────────────────────── */}
        {showControls && (
          <div className="no-print w-60 flex-shrink-0 space-y-3" style={{ maxHeight: "calc(100vh - 80px)", overflowY: "auto", paddingRight: 2, position: "sticky", top: 8, alignSelf: "flex-start" }}>
            {page === "chromatogram" && (
              <>
                {/* Sample Info — all fields including dataFile */}
                <ControlBox title="Sample Info">
                  {/* ── Product / Supplement Name ── */}
                  <div className="mb-2 pb-2 border-b border-gray-100">
                    <label className="text-xs font-mono font-bold text-gray-700" style={{ fontSize: 9.5 }}>
                      Product / Supplement Name
                    </label>
                    <input
                      type="text"
                      value={productName}
                      placeholder="Ex: Biotina, Tiamina B1, Vitamina D3..."
                      onChange={e => {
                        const nome = e.target.value;
                        setProductName(nome);
                        if (nome.trim()) {
                          const now = new Date();
                          const pad = (n: number) => String(n).padStart(2, "0");
                          const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
                          const seq = String(parseInt(sample.seqLine) || 1).padStart(3, "0");
                          setSample(s => ({
                            ...s,
                            dataFile: `C:\\CHEM32\\1\\DATA\\TESTE ${nome} ${datePart}\\${seq}-${seq}01.D`,
                            sampleName: nome,
                          }));
                        }
                        markDirty();
                      }}
                      className="w-full h-6 text-xs font-mono border border-input rounded px-1 bg-background mt-0.5"
                      style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                    />
                    <p className="text-xs text-muted-foreground font-mono mt-0.5" style={{ fontSize: 9 }}>
                      Auto-fills Data File and Sample Name.
                    </p>
                  </div>
                  {/* ── Quick-fill from active compound bank ── */}
                  {activeCompounds.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-blue-100">
                      <label className="text-xs font-mono font-bold text-blue-700">
                        Find Compound →
                      </label>
                      <select
                        defaultValue=""
                        onChange={e => {
                          const c = activeCompounds.find(ac => ac.id === e.target.value);
                          if (!c) return;
                          // Load ANVISA limits saved for this compound into padraoConfig
                          if ((c.anvisaMinMg ?? 0) > 0 || (c.anvisaMaxMg ?? 0) > 0 || c.anvisaNorm) {
                            updatePadrao({
                              anvisaMinMg: c.anvisaMinMg ?? 0,
                              anvisaMaxMg: c.anvisaMaxMg ?? 0,
                              anvisaNorm: c.anvisaNorm ?? "IN 28/2018",
                            });
                          }
                          const now2 = new Date();
                          const pad2 = (n: number) => String(n).padStart(2, "0");
                          const datePart2 = `${now2.getFullYear()}-${pad2(now2.getMonth() + 1)}-${pad2(now2.getDate())} ${pad2(now2.getHours())}-${pad2(now2.getMinutes())}-${pad2(now2.getSeconds())}`;
                          setSample(s => {
                            const seq = String(parseInt(s.seqLine) || 1).padStart(3, "0");
                            const newAcq = c.method || s.acqMethod;
                            const newFilename = c.name.trim().toUpperCase() + ".M";
                            const newDataFile = `C:\\CHEM32\\1\\DATA\\TESTE ${c.name}-${c.wavelength} ${datePart2}\\${seq}-${seq}01.D`;
                            return {
                              ...s,
                              sampleName: c.name,
                              dataFile: newDataFile,
                              signalLabelOverride: "",
                              acqMethod: applyMethodFilename(newAcq, newFilename),
                              analysisMethod: applyMethodFilename(s.analysisMethod, newFilename),
                            };
                          });
                          setDetector(d => ({ ...d, sigWavelength: c.wavelength }));
                          setCalib(cb => ({ ...cb, compoundName: c.name, expRT: c.expectedRT }));
                          prevCalibNameRef.current = c.name;
                          // If a peak for this compound already exists, update it.
                          // Otherwise ADD a new independent peak — never overwrite a different peak.
                          setPeaks(ps => {
                            const idx = ps.findIndex(p => p.name === c.name);
                            if (idx >= 0) {
                              return ps.map((p, i) => i === idx
                                ? { ...p, name: c.name, retentionTime: c.expectedRT, width: c.typicalWidth, asymmetry: c.typicalAsym }
                                : p
                              );
                            }
                            // No existing peak for this compound — add a new one
                            return [...ps, {
                              id: uid(),
                              name: c.name,
                              peakType: "BB",
                              grp: "",
                              retentionTime: c.expectedRT,
                              height: 200,
                              width: c.typicalWidth,
                              asymmetry: c.typicalAsym,
                              amtPerArea: c.amtPerArea,
                              amount: 0,
                              manualArea: 0,
                              peakNoise: 0,
                            }];
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
                        Auto-fills Sample Name, λ, expected RT, and method.
                      </p>
                    </div>
                  )}
                  {([
                    ["dataFile", "Arquivo de dados (vial/path)"],
                    ["sampleName", "Sample Name"],
                    ["acqOperator", "Acq. Operator"],
                    ["seqLine", "Seq. Line"],
                    ["acqInstrument", "Acq. Instrument"],
                    ["location", "Location"],
                    ["injectionDate", "Injection Date"],
                    ["inj", "Inj #"],
                    ["injVolume", "Inj Volume"],
                  ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                    <SmallField key={k} label={label} value={sample[k] ?? ""} onChange={sField(k)} />
                  ))}
                  {/* Method sync group */}
                  <div style={{ border: "1px solid #bfdbfe", borderRadius: 5, padding: "5px 6px", marginTop: 4, background: "#eff6ff" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#1d4ed8", fontWeight: "bold", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      ⟷ Synchronized methods — changing one updates the other automatically
                    </div>
                    <SmallField label="Acq. Method" value={sample.acqMethod} onChange={sField("acqMethod")} />
                    <SmallField label="Last changed (Acq.)" value={sample.lastChanged1} onChange={sField("lastChanged1")} />
                    <SmallField label="Analysis Method" value={sample.analysisMethod} onChange={sField("analysisMethod")} />
                    <SmallField label="Last changed (Ana.)" value={sample.lastChanged2} onChange={sField("lastChanged2")} />
                  </div>
                  {([
                    ["reportDate", "Report Date (footer)"],
                    ["softwareRev", "Software Version (footer)"],
                  ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                    <SmallField key={k} label={label} value={sample[k] ?? ""} onChange={sField(k)} />
                  ))}
                  <button
                    type="button"
                    onClick={() => { setImportText(""); setShowImportDialog(true); }}
                    style={{
                      marginTop: 6, width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 4, padding: "3px 0",
                      fontFamily: "Courier New, monospace", fontSize: 9.5, color: "#1d4ed8",
                      background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    <ClipboardPaste style={{ width: 11, height: 11 }} />
                    Importar texto ChemStation
                  </button>
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

                {/* Baseline appearance */}
                <ControlBox title="Linha de Base">
                  <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6 }}>
                    Ajuste a aparência do traçado e do ruído de fundo.
                  </p>
                  {/* Line thickness slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Espessura do traçado</span>
                      <input type="number" step="0.1" min="0.3" max="8" value={detector.lineWidth}
                        onChange={e => { setDetector(d => ({ ...d, lineWidth: parseFloat(e.target.value) || 0.3 })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input
                      type="range" min="0.3" max="8" step="0.1"
                      value={detector.lineWidth}
                      onChange={e => { setDetector(d => ({ ...d, lineWidth: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>Fina</span><span>Muito grossa</span>
                    </div>
                  </div>
                  {/* Noise slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Ruído de fundo (mAU)</span>
                      <input type="number" step="0.5" min="0" max="200" value={detector.baselineNoise}
                        onChange={e => { setDetector(d => ({ ...d, baselineNoise: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input
                      type="range" min="0" max="200" step="0.5"
                      value={detector.baselineNoise}
                      onChange={e => { setDetector(d => ({ ...d, baselineNoise: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = plana</span><span>200 = caótica</span>
                    </div>
                  </div>
                  {/* Drift slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Deriva linear (mAU)</span>
                      <input type="number" step="1" min="0" max="500" value={detector.baselineDrift}
                        onChange={e => { setDetector(d => ({ ...d, baselineDrift: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input
                      type="range" min="0" max="500" step="1"
                      value={detector.baselineDrift}
                      onChange={e => { setDetector(d => ({ ...d, baselineDrift: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = plana</span><span>500 = deriva extrema</span>
                    </div>
                  </div>
                  {/* Pulse slider */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Pulsação da bomba (mAU)</span>
                      <input type="number" step="0.5" min="0" max="100" value={detector.baselinePulse}
                        onChange={e => { setDetector(d => ({ ...d, baselinePulse: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input
                      type="range" min="0" max="100" step="0.5"
                      value={detector.baselinePulse}
                      onChange={e => { setDetector(d => ({ ...d, baselinePulse: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = sem pulso</span><span>100 = extremo</span>
                    </div>
                  </div>
                  {/* Baseline Wander slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Ondulação lenta (mAU)</span>
                      <input type="number" step="1" min="0" max="200" value={detector.baselineWander ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineWander: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="0" max="200" step="1"
                      value={detector.baselineWander ?? 0}
                      onChange={e => { setDetector(d => ({ ...d, baselineWander: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = sem oscilação</span><span>200 = ondulação extrema</span>
                    </div>
                  </div>
                  {/* Shot Noise slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Ruído proporcional / shot (LC-MS)</span>
                      <input type="number" step="0.05" min="0" max="5" value={detector.shotNoise ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, shotNoise: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="0" max="5" step="0.05"
                      value={detector.shotNoise ?? 0}
                      onChange={e => { setDetector(d => ({ ...d, shotNoise: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = DAD/UV</span><span>5 = MS TIC extremo</span>
                    </div>
                  </div>
                  {/* Hump slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Hump coluna / matriz (mAU)</span>
                      <input type="number" step="10" min="0" max="3000" value={detector.baselineHump ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineHump: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="0" max="3000" step="10"
                      value={detector.baselineHump ?? 0}
                      onChange={e => { setDetector(d => ({ ...d, baselineHump: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = sem hump</span><span>3000 = column bleed extremo</span>
                    </div>
                  </div>
                  {/* Broadening slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Alargamento c/ RT — van Deemter</span>
                      <input type="number" step="0.01" min="0" max="3" value={detector.broadeningFactor ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, broadeningFactor: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="0" max="3" step="0.01"
                      value={detector.broadeningFactor ?? 0}
                      onChange={e => { setDetector(d => ({ ...d, broadeningFactor: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0 = no broadening</span><span>1 = peaks double in width</span>
                    </div>
                  </div>
                  {/* Baseline offset slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Deslocamento vertical (mAU)</span>
                      <input type="number" step="1" min="-200" max="200" value={detector.baselineOffset ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineOffset: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="-200" max="200" step="1"
                      value={detector.baselineOffset ?? 0}
                      onChange={e => { setDetector(d => ({ ...d, baselineOffset: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>−200 mAU</span><span>0 = sem desvio</span><span>+200 mAU</span>
                    </div>
                  </div>
                  {/* Pulse frequency slider */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                      <span>Frequência da bomba (ciclos/min)</span>
                      <input type="number" step="0.1" min="0.2" max="8" value={detector.baselinePulseFreq ?? 1.6}
                        onChange={e => { setDetector(d => ({ ...d, baselinePulseFreq: parseFloat(e.target.value) || 1.6 })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                    </div>
                    <input type="range" min="0.2" max="8.0" step="0.1"
                      value={detector.baselinePulseFreq ?? 1.6}
                      onChange={e => { setDetector(d => ({ ...d, baselinePulseFreq: parseFloat(e.target.value) })); markDirty(); }}
                      className="w-full h-2 accent-blue-600" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                      <span>0.2 = slow pulse</span><span>8.0 = fast pump</span>
                    </div>
                  </div>
                  {/* Initial baseline instability */}
                  <div style={{ marginBottom: 8, borderTop: "1px dashed #d1d5db", paddingTop: 8 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#888", marginBottom: 6, fontStyle: "italic" }}>
                      Initial instability — erratic baseline at the start of the run:
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Start Offset (mAU)</span>
                        <input type="number" step="5" min="-300" max="300" value={detector.baselineStartOffset ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStartOffset: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="-300" max="300" step="5"
                        value={detector.baselineStartOffset ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStartOffset: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>−300 mAU</span><span>0 = normal</span><span>+300 mAU</span>
                      </div>
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Stabilization Time (min)</span>
                        <input type="number" step="0.1" min="0.1" max="5" value={detector.baselineStartDecay ?? 1.0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStartDecay: parseFloat(e.target.value) || 1.0 })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0.1" max="5.0" step="0.1"
                        value={detector.baselineStartDecay ?? 1.0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStartDecay: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0.1 min (rápido)</span><span>5.0 min (lento)</span>
                      </div>
                    </div>
                    {/* Gradient Ramp slider */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Rampa de gradiente (mAU)</span>
                        <input type="number" step="5" min="0" max="500" value={detector.gradientRamp ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, gradientRamp: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0" max="500" step="5"
                        value={detector.gradientRamp ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, gradientRamp: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0 = isocrático</span><span>500 = gradiente UV extremo</span>
                      </div>
                    </div>
                    {/* Baseline Step sliders */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Degrau (válvula/troca) (mAU)</span>
                        <input type="number" step="5" min="-200" max="200" value={detector.baselineStep ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStep: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="-200" max="200" step="5"
                        value={detector.baselineStep ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStep: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>−200 mAU</span><span>0 = sem degrau</span><span>+200 mAU</span>
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>TR do degrau (min)</span>
                        <input type="number" step="0.1" min="0" max="{detector.runTime}" value={detector.baselineStepRT ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStepRT: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0" max={detector.runTime} step="0.1"
                        value={detector.baselineStepRT ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineStepRT: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0 = desativado</span><span>{detector.runTime.toFixed(0)} min</span>
                      </div>
                    </div>
                    {/* Wander Frequency slider */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Freq. de ondulação (×)</span>
                        <input type="number" step="0.1" min="0.2" max="8" value={detector.wanderFreq ?? 1.0}
                        onChange={e => { setDetector(d => ({ ...d, wanderFreq: parseFloat(e.target.value) || 1.0 })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0.2" max="8" step="0.1"
                        value={detector.wanderFreq ?? 1.0}
                        onChange={e => { setDetector(d => ({ ...d, wanderFreq: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0.2× = muito lenta</span><span>8× = muito rápida</span>
                      </div>
                    </div>
                    {/* Spike Rate slider */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Spikes elétricos (por min)</span>
                        <input type="number" step="0.5" min="0" max="10" value={detector.spikeRate ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, spikeRate: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0" max="10" step="0.5"
                        value={detector.spikeRate ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, spikeRate: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0 = sem spikes</span><span>10 = interferência severa</span>
                      </div>
                    </div>
                    {/* Baseline Decay slider */}
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>Sangria exp. inicial (mAU)</span>
                        <input type="number" step="10" min="0" max="800" value={detector.baselineDecay ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineDecay: parseFloat(e.target.value) })); markDirty(); }}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, width: 62, border: "1px solid #bfdbfe", borderRadius: 3, padding: "0 3px", textAlign: "right", background: "#f0f9ff" }}
                      />
                      </div>
                      <input type="range" min="0" max="800" step="10"
                        value={detector.baselineDecay ?? 0}
                        onChange={e => { setDetector(d => ({ ...d, baselineDecay: parseFloat(e.target.value) })); markDirty(); }}
                        className="w-full h-2 accent-blue-600" />
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa" }}>
                        <span>0 = sem sangria</span><span>800 = column bleed extremo</span>
                      </div>
                    </div>
                  </div>
                  {/* Noise presets */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 4 }}>Presets rápidos:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {([
                        { label: "DAD limpo",   vals: { baselineNoise: 0.6, baselineDrift: 0.3, baselinePulse: 0.1, baselineWander: 0,   shotNoise: 0,    baselineHump: 0,  broadeningFactor: 0.1 } },
                        { label: "HPLC/VWD",    vals: { baselineNoise: 1.8, baselineDrift: 1.2, baselinePulse: 0.35,baselineWander: 0.8, shotNoise: 0,    baselineHump: 0,  broadeningFactor: 0.25 } },
                        { label: "LC-MS TIC",   vals: { baselineNoise: 2.5, baselineDrift: 0.5, baselinePulse: 0.1, baselineWander: 2.0, shotNoise: 0.5,  baselineHump: 20, broadeningFactor: 0.3 } },
                        { label: "Gradiente",   vals: { baselineNoise: 2.0, baselineDrift: 3.0, baselinePulse: 0.2, baselineWander: 2.5, shotNoise: 0.15, baselineHump: 50, broadeningFactor: 0.45 } },
                        { label: "GC/FID",      vals: { baselineNoise: 0.4, baselineDrift: 0.2, baselinePulse: 0,   baselineWander: 0,   shotNoise: 0,    baselineHump: 0,  broadeningFactor: 0.05 } },
                      ] as { label: string; vals: Partial<DetectorInfo> }[]).map(pr => (
                        <button key={pr.label} type="button"
                          onClick={() => { setDetector(d => ({ ...d, ...pr.vals })); markDirty(); }}
                          style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, padding: "2px 6px", border: "1px solid #bbb", borderRadius: 3, background: "#f0f4ff", cursor: "pointer", color: "#1d4ed8", whiteSpace: "nowrap" }}>
                          {pr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Reset button */}
                  <button
                    type="button"
                    onClick={() => { setDetector(d => ({ ...d, baselineNoise: 1.8, baselineDrift: 1.2, baselinePulse: 0.35, baselineWander: 0, shotNoise: 0, baselineHump: 0, broadeningFactor: 0, lineWidth: 1.0 })); markDirty(); }}
                    style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px", border: "1px solid #bbb", borderRadius: 3, background: "#f9fafb", cursor: "pointer", color: "#555", marginTop: 4 }}
                  >
                    ↺ Restaurar padrões
                  </button>
                </ControlBox>

                {/* Y-axis (mAU) scale control */}
                <ControlBox title="Escala Y (mAU)">
                  {/* Auto/manual toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={detector.yAxisAuto ?? true}
                        onChange={e => { setDetector(d => ({ ...d, yAxisAuto: e.target.checked })); markDirty(); }}
                        className="h-3 w-3 accent-blue-600"
                      />
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 9.5 }}>Auto</span>
                    </label>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: (detector.yAxisAuto ?? true) ? "#888" : "#1d4ed8", fontWeight: 600 }}>
                      {(detector.yAxisAuto ?? true) ? `${yMaxAuto} mAU (auto)` : `${detector.yAxisMax ?? 2000} mAU`}
                    </span>
                  </div>
                  {/* Quick Y-max slider — moving it disables auto-scale */}
                  <div style={{ marginBottom: 6 }}>
                    <input
                      type="range" min="50" max="5000" step="50"
                      value={(detector.yAxisAuto ?? true) ? yMaxAuto : (detector.yAxisMax ?? 2000)}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 2000;
                        setDetector(d => ({ ...d, yAxisAuto: false, yAxisMax: v }));
                        markDirty();
                      }}
                      className="w-full h-2 accent-blue-600"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 8, color: "#aaa", marginTop: 1 }}>
                      <span>50</span><span>5000 mAU</span>
                    </div>
                  </div>
                  {/* Precise number inputs when manual */}
                  {!(detector.yAxisAuto ?? true) && (
                    <>
                      <SmallField
                        label="Y mín (mAU)"
                        value={String(detector.yAxisMin ?? 0)}
                        onChange={e => { setDetector(d => ({ ...d, yAxisMin: parseFloat(e.target.value) || 0 })); markDirty(); }}
                        type="number"
                      />
                      <SmallField
                        label="Y máx (mAU)"
                        value={String(detector.yAxisMax ?? 2000)}
                        onChange={e => { setDetector(d => ({ ...d, yAxisMax: parseFloat(e.target.value) || 2000 })); markDirty(); }}
                        type="number"
                      />
                    </>
                  )}
                </ControlBox>

                {/* Ext. Std. Report meta — sorted by, calib date, multiplier, dilution */}
                <ControlBox title="Ext. Std. Report — Meta">
                  <SmallField label="Sorted By" value={calib.sortedBy} onChange={cField("sortedBy")} />
                  {/* Calib. Data Modified + auto-fill button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ flex: 1 }}>
                      <SmallField label="Calib. Data Modified" value={calib.calibDataModified} onChange={cField("calibDataModified")} />
                    </div>
                    <button
                      type="button"
                      title="Preencher com data/hora atual"
                      onClick={() => {
                        const now = new Date();
                        const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                        const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                        const h = now.getHours(); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
                        const val = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} ${h12}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")} ${ampm}`;
                        setCalib(c => { const next = { ...c, calibDataModified: val }; saveCalib(next); return next; });
                        markDirty();
                      }}
                      style={{ marginTop: 14, padding: "2px 5px", fontSize: 9, fontFamily: "Courier New, monospace", border: "1px solid #bfdbfe", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", whiteSpace: "nowrap" }}
                    >📅 Agora</button>
                  </div>
                  <SmallField label="Multiplier" value={calib.multiplier} onChange={cField("multiplier")} />
                  <SmallField label="Dilution" value={calib.dilution} onChange={cField("dilution")} />
                </ControlBox>

                {/* Peaks */}
                <ControlBox title="Peaks" extra={
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={addPeak}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2"
                      style={{ borderColor: "#a78bfa", color: "#7c3aed" }}
                      title="Add ghost peak (approximate overlay)"
                      onClick={addGhostPeak}>
                      👻
                    </Button>
                  </div>
                }>
                  <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 4 }}>
                    Click ⚙ to edit · drag on graph to move.<br />
                    <span style={{ color: "#1d4ed8" }}>☑ = include in print</span>
                  </p>
                  {peakStats.map((p) => (
                    <div key={p.id} className="group mb-2"
                      onContextMenu={e => { e.preventDefault(); setPeakContextMenu({ x: e.clientX, y: e.clientY, peakId: p.id }); }}>
                      <div className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                        style={{ background: p.locked ? "#fef9ec" : p.isGhost ? "#f5f3ff" : undefined, borderLeft: p.locked ? "2px solid #f59e0b" : p.isGhost ? "2px solid #a78bfa" : "2px solid transparent" }}>
                        <input
                          type="checkbox"
                          title="Include in print"
                          checked={p.printSelected !== false}
                          disabled={!!p.locked}
                          onChange={e => {
                            if (p.locked) return;
                            setPeaks(ps => ps.map(pk => pk.id === p.id ? { ...pk, printSelected: e.target.checked } : pk));
                            markDirty();
                          }}
                          className="h-3 w-3 flex-shrink-0"
                          style={{ accentColor: "#1d4ed8" }}
                        />
                        <span style={{ ...MONO, fontSize: 9.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.locked && <Lock style={{ display: "inline", width: 9, height: 9, color: "#f59e0b", marginRight: 3, verticalAlign: "middle" }} />}
                          {p.isGhost && <span style={{ marginRight: 3 }}>👻</span>}
                          {p.retentionTime.toFixed(3)} {p.isGhost ? <span style={{ color: "#7c3aed" }}>ghost</span> : p.name ? `(${p.name})` : "—"}
                          {isPadraoSamplePeak(p) && padraoConfig.smpArea > 0
                            ? <span style={{ color: "#f97316" }}> ✎{padraoConfig.smpArea.toFixed(2)}</span>
                            : p.manualArea > 0
                              ? <span style={{ color: "#1d4ed8" }}> ✎{p.manualArea.toFixed(2)}</span>
                              : <span style={{ color: "#888" }}> ~{p.computedArea.toFixed(1)}</span>}
                        </span>
                        <Button size="sm" variant="ghost"
                          className={p.locked ? "h-5 w-5 p-0" : "h-5 w-5 p-0 opacity-0 group-hover:opacity-100"}
                          title={p.locked ? "Unlock peak" : "Lock peak"}
                          onClick={() => toggleLockPeak(p.id)}>
                          {p.locked
                            ? <LockOpen className="h-3 w-3 text-amber-500" />
                            : <Lock className="h-3 w-3 text-gray-400" />}
                        </Button>
                        {/* Opens the single always-mounted controlled dialog — no inline
                            PeakEditorDialog per-peak (that caused the insertBefore crash) */}
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                          title="Edit peak"
                          style={{ visibility: p.locked ? "hidden" : "visible" }}
                          onClick={() => { if (!p.locked) openEditorDialog(p.id); }}>
                          <Settings className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 hover:text-red-500"
                          title={p.locked ? "Peak locked — unlock to delete" : "Delete peak"}
                          disabled={!!p.locked}
                          onClick={() => removePeak(p.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {/* File attachment row */}
                      <div className="flex items-center gap-1 pl-4 mt-0.5">
                        <button
                          type="button"
                          disabled={!!p.locked}
                          onClick={() => handlePeakFileOpen(p.id)}
                          style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "1px 5px", border: "1px solid #bbb", borderRadius: 3, background: p.locked ? "#f1f5f9" : "#f9fafb", cursor: p.locked ? "not-allowed" : "pointer", color: p.locked ? "#bbb" : "#555", flexShrink: 0 }}
                          title={p.locked ? "Peak locked — unlock to attach file" : "Attach file to peak"}
                        >
                          📂 File
                        </button>
                        {p.attachedFile ? (
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#1d4ed8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.attachedFile}>
                            {p.attachedFile}
                          </span>
                        ) : (
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#bbb" }}>no file</span>
                        )}
                      </div>
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
                      <span className="text-xs font-mono font-bold text-orange-600">Show Standard</span>
                    </label>
                    {showStdPeak && standards.length === 0 && (
                      <p style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", marginTop: 4 }}>
                        Add calibration standards in the Calibration Curve → Standards tab.
                      </p>
                    )}
                    {stdPeakInfo && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
                        <div style={{ color: "#f97316", fontWeight: "bold" }}>── Standard Level {stdPeakInfo.level}/{stdPeakInfo.total} ──</div>
                        <div>Amount: <b>{stdPeakInfo.midStd.amount.toFixed(3)} µg/mL</b></div>
                        <div>Standard Area: <b>{stdPeakInfo.midStd.area.toFixed(3)} mAU·s</b></div>
                        <div>Simulated Height: {stdPeakInfo.stdHeight.toFixed(1)} mAU</div>
                        <div>RT: {stdPeakInfo.namedPeak.retentionTime.toFixed(3)} min</div>
                        {(() => {
                          const samplePeak = peakStats.find(p => p.name === calib.compoundName) ?? peakStats.find(p => p.name);
                          if (!samplePeak) return null;
                          const sampleArea = samplePeak.displayArea;
                          const ratio = stdPeakInfo.midStd.area > 0 ? sampleArea / stdPeakInfo.midStd.area : null;
                          const conc = ratio !== null ? ratio * stdPeakInfo.midStd.amount : null;
                          return (
                            <>
                              <div style={{ marginTop: 4, borderTop: "1px solid #e5e7eb", paddingTop: 4 }}>
                                <div>Sample Area: {sampleArea.toFixed(3)} mAU·s</div>
                                <div>Ratio A/Aₛₜ𝒹: {ratio !== null ? ratio.toFixed(4) : "—"}</div>
                                <div style={{ color: "#166534", fontWeight: "bold" }}>
                                  Calc. Conc.: {conc !== null ? conc.toFixed(3) + " µg/mL" : "—"}
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

            {page === "report" && (() => {
              const calibCompoundId = selectedCalibCompoundId ?? activeCompounds[0]?.id ?? null;
              const calibCompound = activeCompounds.find(c => c.id === calibCompoundId) ?? null;
              const cc = calibCompoundId ? getCC(calibCompoundId) : null;
              return (
                <>
                  {/* Compound selector */}
                  <ControlBox title="Compound Calibration">
                    {activeCompounds.length === 0 ? (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa" }}>
                        Add compounds in the Active Compounds tab first.
                      </div>
                    ) : (
                      <>
                        <label style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", display: "block", marginBottom: 2 }}>Compound:</label>
                        <select
                          value={calibCompoundId ?? ""}
                          onChange={e => {
                            const id = e.target.value;
                            setSelectedCalibCompoundId(id);
                            const chosen = activeCompounds.find(ac => ac.id === id);
                            if (chosen) {
                              setCalib(cb => ({ ...cb, compoundName: chosen.name, expRT: chosen.expectedRT }));
                              // ── Auto-fill External Standard from compound's calibration data ──
                              // Pega o padrão médio da curva do composto e replica em stdArea/stdAmountUg
                              const chosenCC = getCC(id);
                              const stds = chosenCC.standards;
                              if (stds.length > 0) {
                                const mid = stds[Math.floor(stds.length / 2)];
                                const patch: Partial<PadraoConfig> = {
                                  compoundName: chosen.name,
                                  stdArea:      parseFloat(mid.area.toFixed(3)),
                                  stdAmountUg:  parseFloat(mid.amount.toFixed(3)),
                                  stdPurity:    parseFloat((chosen.certifiedPurity > 0 ? chosen.certifiedPurity : 99.5).toFixed(3)),
                                };
                                // ANVISA fields — só auto-preenche se o composto tem dados
                                if (chosen.anvisaMinMg && chosen.anvisaMinMg > 0) patch.anvisaMinMg = chosen.anvisaMinMg;
                                if (chosen.anvisaMaxMg && chosen.anvisaMaxMg > 0) patch.anvisaMaxMg = chosen.anvisaMaxMg;
                                if (chosen.anvisaNorm)                             patch.anvisaNorm  = chosen.anvisaNorm;
                                updatePadrao(patch);
                              }
                            }
                          }}
                          className="w-full h-6 text-xs font-mono border border-input rounded px-1 bg-background mb-3"
                        >
                          {activeCompounds.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {calibCompound && cc && (
                          <>
                            <SmallField label="Calib. Data Modified" value={cc.calib.calibDataModified} onChange={e => updateCompoundCalibField(calibCompound.id, "calibDataModified", e.target.value)} />
                            <SmallField label="Expected RT (min)" value={String(cc.calib.expRT || calibCompound.expectedRT)} onChange={e => updateCompoundCalibField(calibCompound.id, "expRT", parseFloat(e.target.value) || 0)} type="number" />
                            <SmallField label="Curve Type" value={cc.calib.curveType} onChange={e => updateCompoundCalibField(calibCompound.id, "curveType", e.target.value)} />
                            <SmallField label="Origin" value={cc.calib.origin} onChange={e => updateCompoundCalibField(calibCompound.id, "origin", e.target.value)} />
                            <SmallField label="Weight" value={cc.calib.weight} onChange={e => updateCompoundCalibField(calibCompound.id, "weight", e.target.value)} />
                            {/* ── Padrão de Referência (External Standard) ── */}
                            <div style={{
                              borderTop: "1px solid #e2e8f0", marginTop: 8, paddingTop: 7,
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              marginBottom: 4,
                            }}>
                              <span style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#64748b", fontWeight: "bold", letterSpacing: "0.04em" }}>
                                PADRÃO DE REFERÊNCIA
                              </span>
                              {/* Toggle: Ocultar/Mostrar ◆ na curva */}
                              <button
                                type="button"
                                title={padraoConfig.hideDiamondOnCurve ? "◆ oculto na curva — clique para mostrar" : "◆ visível na curva — clique para ocultar"}
                                onClick={() => updatePadrao({ hideDiamondOnCurve: !padraoConfig.hideDiamondOnCurve }, { changedBy: "operator" })}
                                style={{
                                  fontFamily: "Courier New, monospace", fontSize: 8, padding: "1px 6px",
                                  border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer",
                                  background: padraoConfig.hideDiamondOnCurve ? "#f1f5f9" : "#e0f2fe",
                                  color: padraoConfig.hideDiamondOnCurve ? "#94a3b8" : "#0369a1",
                                  fontWeight: "bold",
                                }}
                              >
                                {padraoConfig.hideDiamondOnCurve ? "◆ oculto" : "◆ visível"}
                              </button>
                            </div>
                            <div className="mb-1.5">
                              <Label style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", display: "block" }}>
                                Area [mAU*s] {padraoConfig.smpAreaSaved && <span style={{ color: "#dc2626" }}>🔒</span>}
                              </Label>
                              <Input
                                type="number"
                                step="0.00001"
                                readOnly={padraoConfig.smpAreaSaved}
                                value={padraoConfig.smpArea === 0 ? "" : padraoConfig.smpArea}
                                placeholder="0.00000"
                                onChange={e => updatePadrao({ smpArea: parseFloat(e.target.value) || 0 }, { changedBy: "operator" })}
                                className="h-6 px-1.5"
                                style={{
                                  fontFamily: "Courier New, monospace", fontSize: 10,
                                  background: padraoConfig.smpAreaSaved ? "#fef2f2" : undefined,
                                  cursor: padraoConfig.smpAreaSaved ? "not-allowed" : undefined,
                                }}
                              />
                            </div>
                            <div className="mb-2">
                              <Label style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", display: "block" }}>
                                Amount [ug/ml]
                              </Label>
                              <Input
                                readOnly
                                tabIndex={-1}
                                value={padraoFoundUg > 0 ? padraoFoundUg.toFixed(5) : ""}
                                placeholder="calculado"
                                className="h-6 px-1.5"
                                style={{ fontFamily: "Courier New, monospace", fontSize: 10, background: "#f8fafc", cursor: "default", color: "#374151" }}
                              />
                            </div>
                            {/* ── Salvar / Alterar buttons ── */}
                            {!padraoConfig.smpAreaSaved ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (padraoConfig.smpArea <= 0) return;
                                  updatePadrao({ smpAreaSaved: true }, { changedBy: "operator" });

                                  // ── Sync to Active Compounds Library ──────────────────────────
                                  // Case-insensitive match by compound name
                                  const cname = padraoConfig.compoundName.trim().toLowerCase();
                                  const newStdArea    = padraoConfig.stdArea    > 0 ? padraoConfig.stdArea    : undefined;
                                  const newStdAmtUg   = padraoConfig.stdAmountUg > 0 ? padraoConfig.stdAmountUg : undefined;
                                  let matched = false;
                                  const updatedCompounds = activeCompounds.map(c => {
                                    const isMatch = cname
                                      ? c.name.trim().toLowerCase() === cname
                                      : false;
                                    if (!isMatch) return c;
                                    matched = true;
                                    return {
                                      ...c,
                                      ...(newStdArea   !== undefined ? { stdArea:    newStdArea   } : {}),
                                      ...(newStdAmtUg  !== undefined ? { stdAmountUg: newStdAmtUg } : {}),
                                    };
                                  });
                                  setActiveCompounds(updatedCompounds);
                                  // Force-persist immediately so data survives a quick window close
                                  saveState({ peaks, sample, detector, standards, calib, activeCompounds: updatedCompounds, productName });

                                  toast({
                                    title: matched ? "✓ Library atualizada" : cname ? "⚠ Composto não encontrado na library" : "⚠ Nenhum composto selecionado",
                                    description: matched
                                      ? `${padraoConfig.compoundName}${newStdArea !== undefined ? ` · Std Area: ${newStdArea.toFixed(5)} mAU·s` : ""}${newStdAmtUg !== undefined ? ` · Amt: ${newStdAmtUg.toFixed(5)} µg` : ""}`
                                      : cname
                                        ? `"${padraoConfig.compoundName}" não existe na Active Compounds Library. Cadastre o composto primeiro.`
                                        : "Selecione um composto no Reference Standard antes de salvar.",
                                    variant: matched ? "default" : "destructive",
                                  });
                                }}
                                disabled={padraoConfig.smpArea <= 0}
                                style={{
                                  width: "100%", fontFamily: "Courier New, monospace", fontSize: 9,
                                  padding: "3px 0", border: "1px solid #16a34a", borderRadius: 4,
                                  background: padraoConfig.smpArea > 0 ? "#dcfce7" : "#f1f5f9",
                                  color: padraoConfig.smpArea > 0 ? "#15803d" : "#94a3b8",
                                  cursor: padraoConfig.smpArea > 0 ? "pointer" : "not-allowed",
                                  fontWeight: "bold",
                                }}
                              >
                                💾 Salvar e travar valores
                              </button>
                            ) : (
                              <div style={{ display: "flex", gap: 4 }}>
                                <div style={{
                                  flex: 1, fontFamily: "Courier New, monospace", fontSize: 8.5,
                                  padding: "3px 6px", border: "1px solid #fca5a5", borderRadius: 4,
                                  background: "#fef2f2", color: "#dc2626", fontWeight: "bold",
                                  display: "flex", alignItems: "center", gap: 4,
                                }}>
                                  🔒 Salvo — travado
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMasterAuthInput("");
                                    setMasterAuthError(null);
                                    setMasterAuthDialog({
                                      description: "Digite a senha de manager para liberar a edição do PADRÃO DE REFERÊNCIA.",
                                      buttonLabel: "🔓 Liberar edição",
                                      onSuccess: () => { updatePadrao({ smpAreaSaved: false }, { changedBy: "manager" }); },
                                    });
                                  }}
                                  style={{
                                    fontFamily: "Courier New, monospace", fontSize: 8.5,
                                    padding: "3px 7px", border: "1px solid #f97316", borderRadius: 4,
                                    background: "#fff7ed", color: "#ea580c",
                                    cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap",
                                  }}
                                >
                                  🔓 Alterar
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </ControlBox>

                  {/* Standards for selected compound */}
                  {calibCompound && cc && (
                    <ControlBox title={`Standards — ${calibCompound.name}`} extra={
                      <div className="flex gap-1 flex-wrap">
                        <button
                          type="button"
                          title={syncAreasActive ? "Area sync ACTIVE — all levels share the same area value. Click to disable." : "Area sync OFF — click to enable: changing one area updates all levels"}
                          onClick={() => setSyncAreasActive(v => !v)}
                          style={{
                            fontFamily: "Courier New, monospace", fontSize: 9,
                            padding: "1px 6px", borderRadius: 3, cursor: "pointer",
                            border: `1px solid ${syncAreasActive ? "#1d4ed8" : "#ccc"}`,
                            background: syncAreasActive ? "#dbeafe" : "#f9fafb",
                            color: syncAreasActive ? "#1d4ed8" : "#555",
                            fontWeight: syncAreasActive ? "bold" : "normal",
                            whiteSpace: "nowrap",
                          }}
                        >
                          🔗 {syncAreasActive ? "Sync ON" : "Sync OFF"}
                        </button>
                        <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2"
                          title="Simulate areas for all levels proportionally to the current chromatogram peak"
                          onClick={() => simulateCalibCurve(calibCompound.id)}>
                          ⚡ Simulate
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2"
                          title="Copy these standards to Global Standards — syncs the chromatogram overlay"
                          onClick={() => {
                            const ccData = getCC(calibCompound.id);
                            if (ccData.standards.length === 0) return;
                            pushUndo();
                            setStandards(ccData.standards
                              .sort((a, b) => a.amount - b.amount)
                              .map((s, i) => ({ id: s.id, level: i + 1, amount: s.amount, area: s.area })));
                          }}>
                          ⟳ Sync
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={() => addCompoundStandard(calibCompound.id)}>
                            <Plus className="h-3 w-3" /> Add Std
                          </Button>
                          <button
                            type="button"
                            title="Load 5-point B6 calibration template from Agilent ChemStation data (10/25/50/70/100 µg/ml)"
                            onClick={() => {
                              if (cc.standards.length > 0 && !window.confirm("Replace existing standards with the B6 5-point template?")) return;
                              pushUndo();
                              const b6Points = [
                                { amount: 10.00000, area: 296.16348 },
                                { amount: 25.00000, area: 620.81195 },
                                { amount: 50.00000, area: 1286.75647 },
                                { amount: 70.00000, area: 1737.21973 },
                                { amount: 100.00000, area: 2530.36230 },
                              ];
                              setCompoundCalibrations(prev => {
                                const existing = prev[calibCompound.id] ?? getCC(calibCompound.id);
                                const newStds = b6Points.map((pt, i) => ({ id: uid(), level: i + 1, amount: pt.amount, area: pt.area }));
                                const updated = {
                                  ...prev,
                                  [calibCompound.id]: {
                                    ...existing,
                                    standards: newStds,
                                    calib: {
                                      ...existing.calib,
                                      calibDataModified: "Thursday, April 24, 2025 6:00:25 PM",
                                      curveType: "Linear",
                                      origin: "Included",
                                      weight: "Equal",
                                      expRT: 2.438,
                                      relRefWindow: "5.000 %",
                                      absRefWindow: "0.000 min",
                                      relNonRefWindow: "5.000 %",
                                      absNonRefWindow: "0.000 min",
                                      uncalibratedPeaks: "not reported",
                                      partialCalibration: "Yes, identified peaks are recalibrated",
                                      correctAllRetTimes: "No, only for identified peaks",
                                      avgResponse: "Average all calibrations",
                                      avgRetentionTime: "Floating Average New 75%",
                                    },
                                  },
                                };
                                saveCompoundCalibrations(updated);
                                return updated;
                              });
                              markDirty();
                            }}
                            style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 7px", border: "1px solid #7c3aed", borderRadius: 3, background: "#f5f3ff", cursor: "pointer", color: "#6d28d9", fontWeight: "bold", whiteSpace: "nowrap" }}
                          >
                            📅 B6 Template
                          </button>
                        {cc.locked ? (
                          <button
                            type="button"
                            title="Curve locked — click to unlock with manager password"
                            onClick={() => unlockCompoundCalib(calibCompound.id)}
                            style={{
                              fontFamily: "Courier New, monospace", fontSize: 9,
                              padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                              border: "1px solid #f59e0b", background: "#fef3c7", color: "#b45309",
                              fontWeight: "bold", whiteSpace: "nowrap",
                            }}>
                            🔒 Locked
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Lock this calibration curve with manager password"
                            onClick={() => lockCompoundCalib(calibCompound.id)}
                            style={{
                              fontFamily: "Courier New, monospace", fontSize: 9,
                              padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                              border: "1px solid #cbd5e1", background: "#f8fafc", color: "#64748b",
                              whiteSpace: "nowrap",
                            }}>
                            🔓 Lock
                          </button>
                        )}
                      </div>
                    }>
                      {cc.locked && (
                        <div style={{
                          background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4,
                          padding: "6px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
                          fontFamily: "Courier New, monospace", fontSize: 9, color: "#92400e",
                        }}>
                          <span style={{ fontSize: 12 }}>🔒</span>
                          <span>
                            Curve locked. Editing disabled to protect the approved calibration.{" "}
                            <button
                              type="button"
                              onClick={() => unlockCompoundCalib(calibCompound.id)}
                              style={{ color: "#b45309", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", fontWeight: "bold" }}>
                              Unlock with password →
                            </button>
                          </span>
                        </div>
                      )}
                      <div style={{ position: "relative" }}>
                        {cc.locked && (
                          <div style={{
                            position: "absolute", inset: 0, zIndex: 5,
                            background: "rgba(255,255,255,0.65)", borderRadius: 4, cursor: "not-allowed",
                          }} />
                        )}
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 4, lineHeight: 1.6 }}>
                        Amount [ug/ml] / Area [mAU*s]<br />
                        <span style={{ color: "#1d4ed8" }}>📥 Capture</span> — reads area from current chromatogram peak
                        {syncAreasActive && (
                          <span style={{ color: "#1d4ed8", display: "block", marginTop: 2 }}>
                            🔗 Sync ON — editing any area updates all levels
                          </span>
                        )}
                      </div>
                      {[...cc.standards].sort((a, b) => a.amount - b.amount).map((s, i) => (
                        <div key={s.id} className="flex items-center gap-1 group mb-1.5">
                          <span style={{ ...MONO, fontSize: 9, color: "#555", width: 14 }}>{i + 1}</span>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <Input type="number" step="0.00001" value={s.amount}
                              onFocus={() => pushUndo()}
                              onChange={e => updateCompoundStandard(calibCompound.id, s.id, "amount", parseFloat(e.target.value) || 0)}
                              className="h-5 text-xs font-mono px-1" placeholder="Amount (ug/ml)" />
                            <div className="flex gap-0.5">
                              <Input type="number" step="0.00001" value={s.area}
                                onFocus={() => pushUndo()}
                                onChange={e => {
                                  const newArea = parseFloat(e.target.value) || 0;
                                  if (syncAreasActive) {
                                    // Update ALL standards to the same area value
                                    setCompoundCalibrations(prev => {
                                      const existing = prev[calibCompound.id] ?? getCC(calibCompound.id);
                                      const updated = {
                                        ...prev,
                                        [calibCompound.id]: {
                                          ...existing,
                                          standards: existing.standards.map(st => ({ ...st, area: newArea })),
                                        },
                                      };
                                      saveCompoundCalibrations(updated);
                                      return updated;
                                    });
                                    markDirty();
                                  } else {
                                    updateCompoundStandard(calibCompound.id, s.id, "area", newArea);
                                  }
                                }}
                                className="h-5 text-xs font-mono px-1 flex-1"
                                style={{ borderColor: syncAreasActive ? "#93c5fd" : undefined }}
                                placeholder="Area (mAU*s)" />
                              <button
                                type="button"
                                title="Capture current chromatogram peak area for this level"
                                onClick={() => captureCalibArea(calibCompound.id, s.id)}
                                style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 5px", border: "1px solid #ccc", borderRadius: 3, background: "#f9fafb", cursor: "pointer", color: "#333", flexShrink: 0, whiteSpace: "nowrap" }}
                              >
                                📥
                              </button>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-red-500"
                            onClick={() => removeCompoundStandard(calibCompound.id, s.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {/* Concentração nominal declarada para cálculo de pureza */}
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 3 }}>
                          Nominal Conc. (ug/ml) — for purity %:
                        </div>
                        <Input type="number" step="any"
                          value={cc.calib.nominalConc ?? ""}
                          onChange={e => updateCompoundCalibField(calibCompound.id, "nominalConc", parseFloat(e.target.value) || 0)}
                          className="h-5 text-xs font-mono px-1 w-full" placeholder="Ex: 50 ug/ml" />
                      </div>
                      </div>{/* end position:relative overlay wrapper */}
                    </ControlBox>
                  )}

                  {/* Teor de Pureza via Curva de Calibração */}
                  {activeCompounds.some(c => {
                    const ccc = getCC(c.id);
                    return ccc.standards.length >= 2;
                  }) && (() => {
                    const purityRows = activeCompounds.map(compound => {
                      const ccc = getCC(compound.id);
                      if (ccc.standards.length < 2) return null;
                      const compReg = linearRegression(ccc.standards.map(s => ({ x: s.amount, y: s.area })));
                      if (compReg.slope <= 0) return null;
                      const expRT = ccc.calib.expRT > 0 ? ccc.calib.expRT : compound.expectedRT;
                      const matchPeak = peaks.find(p => {
                        const nameMatch = !!(p.name && (
                          p.name.toLowerCase().includes(compound.name.toLowerCase()) ||
                          compound.name.toLowerCase().includes(p.name.toLowerCase())
                        ));
                        const rtMatch = Math.abs(p.retentionTime - expRT) <= compound.rtTol;
                        return nameMatch || rtMatch;
                      });
                      if (!matchPeak) return null;
                      const area = matchPeak.manualArea > 0 ? matchPeak.manualArea : computeArea(matchPeak);
                      const calcConc = Math.max(0, (area - compReg.intercept) / compReg.slope);
                      const nominalConc = ccc.calib.nominalConc ?? 0;
                      const purityPct = nominalConc > 0 ? (calcConc / nominalConc) * 100 : null;
                      return { compound, area, calcConc, nominalConc, purityPct, r: compReg.r, r2: compReg.r * compReg.r, slope: compReg.slope, intercept: compReg.intercept, residStdDev: compReg.residStdDev };
                    }).filter(Boolean) as { compound: ActiveCompound; area: number; calcConc: number; nominalConc: number; purityPct: number | null; r: number; r2: number; slope: number; intercept: number; residStdDev: number }[];

                    if (purityRows.length === 0) return null;
                    return (
                      <ControlBox title="Purity Assay (Calibration Curve)">
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.6 }}>
                          Concentration calculated from the calibration curve and purity assay vs. nominal.
                        </div>
                        {purityRows.map(row => {
                          const pct = row.purityPct;
                          const pctColor = pct === null ? "#888" : pct >= 98 ? "#16a34a" : pct >= 80 ? "#d97706" : "#dc2626";
                          return (
                            <div key={row.compound.id} style={{ marginBottom: 8, padding: "5px 7px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, fontWeight: "bold", color: "#1e293b", marginBottom: 3 }}>
                                {row.compound.name}
                              </div>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", lineHeight: 1.8 }}>
                                <div>Detected Area: <b>{row.area.toFixed(2)} mAU·s</b></div>
                                <div>Calc. Conc.: <b>{row.calcConc.toFixed(4)} {row.compound.units}</b></div>
                                {row.nominalConc > 0 && (
                                  <div>Nominal: <b>{row.nominalConc.toFixed(4)} {row.compound.units}</b></div>
                                )}
                              </div>
                              {/* Regression stats — update live as standards change */}
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#334155", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 3, padding: "4px 6px", marginTop: 5, lineHeight: 1.85 }}>
                                <div style={{ color: "#0f172a", fontWeight: "bold", marginBottom: 2 }}>Calibration Curve</div>
                                <div>Correlation (r): <b style={{ color: row.r >= 0.999 ? "#16a34a" : row.r >= 0.99 ? "#d97706" : "#dc2626" }}>{Math.min(row.r, 0.99986).toFixed(5)}</b></div>
                                <div>R²: <b>{Math.min(row.r2, 0.99972).toFixed(5)}</b></div>
                                <div>Residual Std Dev: <b>{row.residStdDev.toFixed(5)}</b></div>
                                <div style={{ marginTop: 3 }}>y = mx + b</div>
                                <div style={{ paddingLeft: 8 }}>m = <b>{row.slope.toFixed(5)}</b></div>
                                <div style={{ paddingLeft: 8 }}>b = <b>{row.intercept.toFixed(5)}</b></div>
                              </div>
                              {pct !== null ? (
                                <div style={{ marginTop: 5, padding: "4px 6px", background: pct >= 98 ? "#f0fdf4" : pct >= 80 ? "#fffbeb" : "#fef2f2", borderRadius: 3, textAlign: "center" }}>
                                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 14, fontWeight: "bold", color: pctColor }}>{pct.toFixed(2)}%</div>
                                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: pctColor }}>Purity</div>
                                </div>
                              ) : (
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#888", marginTop: 4, textAlign: "center" }}>
                                  Set Nominal Conc. above to calculate purity %
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </ControlBox>
                    );
                  })()}

                  {/* Ext. Std. Report meta (shared) */}
                  <ControlBox title="Ext. Std. Report — Meta">
                    <SmallField label="Sorted By" value={calib.sortedBy} onChange={cField("sortedBy")} />
                    {/* Calib. Data Modified + auto-fill button */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ flex: 1 }}>
                        <SmallField label="Calib. Data Modified" value={calib.calibDataModified} onChange={cField("calibDataModified")} />
                      </div>
                      <button
                        type="button"
                        title="Preencher com data/hora atual"
                        onClick={() => {
                          const now = new Date();
                          const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                          const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                          const h = now.getHours(); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
                          const val = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} ${h12}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")} ${ampm}`;
                          setCalib(c => { const next = { ...c, calibDataModified: val }; saveCalib(next); return next; });
                          markDirty();
                        }}
                        style={{ marginTop: 14, padding: "2px 5px", fontSize: 9, fontFamily: "Courier New, monospace", border: "1px solid #bfdbfe", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", whiteSpace: "nowrap" }}
                      >📅 Agora</button>
                    </div>
                    <SmallField label="Multiplier" value={calib.multiplier} onChange={cField("multiplier")} />
                    <SmallField label="Dilution" value={calib.dilution} onChange={cField("dilution")} />
                  </ControlBox>

                  {/* Saved chromatogram viewer */}
                  <ControlBox title="Saved Chromatograms">
                    {savedImages.length === 0 ? (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", lineHeight: 1.5 }}>
                        No saved images.<br />
                        Save chromatograms via the camera button in the Analysis tab.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6 }}>
                          Click to show in report:
                        </div>
                        {savedImages.map(img => (
                          <div
                            key={img.id}
                            onClick={() => setReportSelectedImageId(img.id === reportSelectedImageId ? null : img.id)}
                            style={{
                              padding: "5px 8px", marginBottom: 4, borderRadius: 3, cursor: "pointer",
                              background: img.id === reportSelectedImageId ? "#dbeafe" : "#f8fafc",
                              border: `1px solid ${img.id === reportSelectedImageId ? "#93c5fd" : "#e2e8f0"}`,
                              fontFamily: "Courier New, monospace",
                            }}
                          >
                            <div style={{ fontWeight: "bold", color: "#1d4ed8", fontSize: 9.5, marginBottom: 1 }}>{img.sessionName}</div>
                            <div style={{ fontSize: 8.5, color: "#666" }}>{new Date(img.createdAt).toLocaleString("en-US")}</div>
                            {img.id === reportSelectedImageId && (
                              <div style={{ fontSize: 8, color: "#1d4ed8", marginTop: 2 }}>▼ visible in report</div>
                            )}
                          </div>
                        ))}
                        {reportSelectedImageId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-xs mt-1"
                            onClick={() => setReportSelectedImageId(null)}
                          >
                            Hide image
                          </Button>
                        )}
                      </>
                    )}
                  </ControlBox>
                </>
              );
            })()}

            {page === "ativos" && (
              <>
                <ControlBox title="Active Compounds">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                    Define compounds and HPLC properties. "Auto-identify" names peaks whose λ and RT match.
                  </div>
                  <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2" onClick={addActiveCompound}>
                    <Plus className="h-3 w-3" /> Add Compound
                  </Button>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={autoIdentifyPeaks}>
                    <Zap className="h-3 w-3" /> Auto-identify Peaks
                  </Button>
                  {lastIdentified.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 9, color: "#166534", fontFamily: "Courier New, monospace" }}>
                      Identified: {lastIdentified.join(", ")}
                    </div>
                  )}
                </ControlBox>
                <ControlBox title="Current Detector">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555" }}>
                    λ signal: <b>{detector.sigWavelength} nm</b><br />
                    ID: λ ± tolerance AND RT ± tolerance
                  </div>
                </ControlBox>
              </>
            )}

            {page === "analise" && (() => {
              const session = analysisSessions.find(s => s.id === currentSessionId) ?? null;
              const sessionFormula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
              const std = sessionFormula ? formulaStandards.find(s => s.formulaId === sessionFormula.id) ?? null : null;
              const filteredSaved = savedAnalyses.filter(a => {
                const q = analysisSearch.trim().toLowerCase();
                if (!q) return true;
                return (a.productName || "").toLowerCase().includes(q) ||
                  (a.certTitle || "").toLowerCase().includes(q) ||
                  (a.productLot || "").toLowerCase().includes(q) ||
                  (a.compoundName || "").toLowerCase().includes(q);
              }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
              return (
                <>
                  {/* Sub-tab switcher */}
                  <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "2px solid #e2e8f0" }}>
                    {([["sessions", "🔬 Sessions"], ["pdfs", `📄 PDFs Salvos${savedAnalyses.length > 0 ? ` (${savedAnalyses.length})` : ""}`]] as const).map(([tab, label]) => (
                      <button key={tab} onClick={() => setAnaliseSubTab(tab)} style={{
                        fontFamily: "Courier New, monospace", fontSize: 10, padding: "4px 12px", border: "none",
                        borderBottom: analiseSubTab === tab ? "2px solid #1e3a5f" : "2px solid transparent",
                        background: "none", cursor: "pointer", fontWeight: analiseSubTab === tab ? "bold" : "normal",
                        color: analiseSubTab === tab ? "#1e3a5f" : "#64748b", marginBottom: -2,
                      }}>{label}</button>
                    ))}
                  </div>

                  {analiseSubTab === "pdfs" && (
                    <ControlBox title="PDFs Salvos">
                      <div style={{ marginBottom: 8 }}>
                        <input
                          type="text"
                          value={analysisSearch}
                          onChange={e => setAnalysisSearch(e.target.value)}
                          placeholder="Buscar por produto, certificado ou lote…"
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "Courier New, monospace", fontSize: 10, padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4, outline: "none" }}
                        />
                      </div>
                      {filteredSaved.length === 0 ? (
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", textAlign: "center", padding: "12px 0" }}>
                          {analysisSearch ? "Nenhum resultado encontrado." : "Nenhuma análise salva ainda. Use o botão 💾 na aba Standard."}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {filteredSaved.map(a => {
                            const date = a.savedAt ? new Date(a.savedAt).toLocaleDateString("pt-BR") : "—";
                            const badge = a.inSpec === true ? { bg: "#dcfce7", color: "#166534", txt: "✓ Conforme" }
                              : a.inSpec === false ? { bg: "#fee2e2", color: "#991b1b", txt: "✗ Não Conforme" }
                              : { bg: "#f1f5f9", color: "#64748b", txt: "Sem faixa" };
                            return (
                              <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", background: "#f8fafc" }}>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", color: "#1e293b", marginBottom: 2 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span>{a.certTitle || "Certificado de Análise"}</span>
                                  {a.certNumber && (
                                    <span style={{ background: "#dbeafe", color: "#1d4ed8", fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 7px", borderRadius: 3, fontWeight: "bold", letterSpacing: 0.3 }}>
                                      Nº {a.certNumber}
                                    </span>
                                  )}
                                </div>
                                </div>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#475569", marginBottom: 4 }}>
                                  {a.productName && <span style={{ fontWeight: "bold", color: "#1e293b" }}>{a.productName}</span>}
                                  {a.productLot && <span> · <span style={{ color: "#7c3aed", fontWeight: "bold" }}>Lote: {a.productLot}</span></span>}
                                  {a.compoundName && <span> · {a.compoundName}</span>}
                                  <span style={{ marginLeft: 6, color: "#94a3b8" }}>{date}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ background: badge.bg, color: badge.color, fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: "bold" }}>
                                    {badge.txt}
                                  </span>
                                  {a.foundAmountMg > 0 && (
                                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#475569" }}>
                                      {a.foundAmountMg.toFixed(4)} mg
                                    </span>
                                  )}
                                  <button onClick={() => restoreDocument(a)} style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px", border: "1px solid #16a34a", borderRadius: 3, background: "#16a34a", color: "#fff", cursor: "pointer", marginLeft: "auto" }} title="Restaura todo o documento — cromatograma, configurações e dados">
                                    🔄 Restaurar
                                  </button>
                                  <button onClick={() => openSavedPdf(a)} style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px", border: "1px solid #1e3a5f", borderRadius: 3, background: "#1e3a5f", color: "#fff", cursor: "pointer" }}>
                                    📄 PDF
                                  </button>
                                  <button onClick={() => {
                                    setMasterAuthDialog({
                                      description: `Digite a senha Master para remover permanentemente "${a.certTitle || "Certificado de Análise"}${a.certNumber ? ` Nº ${a.certNumber}` : ""}".`,
                                      buttonLabel: "Confirmar exclusão",
                                      onSuccess: () => {
                                        const upd = savedAnalyses.filter(x => x.id !== a.id);
                                        setSavedAnalyses(upd);
                                        persistSavedAnalyses(upd);
                                        void archiveAnalysisOnServer(a.id);
                                      },
                                    });
                                    setMasterAuthInput("");
                                    setMasterAuthError(null);
                                  }} style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 6px", border: "1px solid #fca5a5", borderRadius: 3, background: "#fff", color: "#dc2626", cursor: "pointer" }} title="Remover (requer senha Master)">
                                    🗑
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ControlBox>
                  )}

                  {analiseSubTab === "sessions" && <ControlBox title="Analysis Sessions">
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                      Each session registers up to 5 independent injections with overlay chromatograms and assay (%) calculation.
                    </div>
                    {formulas.length === 0 ? (
                      <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace" }}>
                        Save a formula in the "Lots" menu before creating an analysis session.
                      </div>
                    ) : (
                      <NewSessionDialog formulas={formulas} onSave={handleCreateSession}>
                        <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2">
                          <Plus className="h-3 w-3" /> New Session
                        </Button>
                      </NewSessionDialog>
                    )}
                    <div className="space-y-1 mt-1">
                      {analysisSessions.length === 0 && (
                        <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "6px 0" }}>
                          No sessions created
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
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", marginTop: 1 }}>{fName} · {s.runs.length}/5 runs</div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa" }}>{new Date(s.createdAt).toLocaleDateString("en-US")}</div>
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" variant="destructive" className="h-5 text-xs px-1.5 flex-1 opacity-70"
                                onClick={e => { e.stopPropagation(); openDeleteSessionDialog(s.id, s.name); }}>
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Delete
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ControlBox>}

                  {session && sessionFormula && analiseSubTab === "sessions" && (
                    <>
                      <ControlBox title={`Runs — ${session.name}`}>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6 }}>
                          Set up peaks in the chromatogram and click "Register" to save the current run.
                        </div>
                        <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2"
                          onClick={handleRegisterRun}>
                          <Download className="h-3 w-3" /> Register Run {session.runs.length + 1}
                        </Button>
                        <div className="space-y-1 mt-1">
                          {session.runs.map(r => (
                            <div key={r.id} style={{
                              display: "flex", alignItems: "center", gap: 4, padding: "3px 6px",
                              border: `1px solid ${r.hidden ? "#e5e7eb" : "#d1d5db"}`,
                              borderRadius: 4,
                              background: r.hidden ? "#f9fafb" : "#fff",
                              opacity: r.hidden ? 0.6 : 1,
                              transition: "opacity 0.15s",
                            }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: r.hidden ? "#ccc" : r.color }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", color: r.hidden ? "#aaa" : "#111" }}>
                                  {r.label}
                                  {r.hidden && <span style={{ fontWeight: 400, fontSize: 8, color: "#bbb", marginLeft: 4 }}>hidden</span>}
                                </div>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#999" }}>
                                  {new Date(r.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                              {/* Toggle visibility */}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                                title={r.hidden ? "Show run" : "Hide run"}
                                style={{ color: r.hidden ? "#9ca3af" : "#3b82f6" }}
                                onClick={() => handleToggleRunHidden(session.id, r.id)}>
                                {r.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              {/* Delete */}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                                title="Delete run"
                                onClick={() => handleDeleteRun(session.id, r.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          {session.runs.length === 0 && (
                            <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "6px 0" }}>No runs registered</div>
                          )}
                        </div>
                      </ControlBox>

                      <ControlBox title="Reference Standard">
                        {std ? (
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 9 }}>
                            <div style={{ color: "#166534", fontWeight: "bold", marginBottom: 4 }}>✓ Standard saved</div>
                            {std.entries.map(e => (
                              <div key={e.compoundId} style={{ marginBottom: 3, padding: "3px 5px", background: "#f0fdf4", borderRadius: 3, border: "1px solid #bbf7d0" }}>
                                <div style={{ fontWeight: "bold" }}>{e.compoundName}</div>
                                <div style={{ color: "#555" }}>Nominal: {e.nominalConc} {e.units}</div>
                                {e.stdArea > 0 && <div style={{ color: "#555" }}>Std area: {e.stdArea} / conc: {e.stdConc}</div>}
                              </div>
                            ))}
                            <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                              <SetStandardDialog compounds={sessionFormula.activeCompounds} existing={std} onSave={(entries, notes) => handleSaveStandard(sessionFormula.id, entries, notes)}>
                                <Button size="sm" variant="outline" className="h-5 text-xs px-1.5 flex-1">Edit</Button>
                              </SetStandardDialog>
                              <Button size="sm" variant="destructive" className="h-5 text-xs px-1.5 flex-1 opacity-70" onClick={() => handleDeleteStandard(sessionFormula.id)}>
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#ea580c", marginBottom: 6 }}>
                              ⚠ No standard saved. Enter values to calculate assay (%).
                            </div>
                            <SetStandardDialog compounds={sessionFormula.activeCompounds} existing={null} onSave={(entries, notes) => handleSaveStandard(sessionFormula.id, entries, notes)}>
                              <Button size="sm" className="w-full h-7 text-xs gap-1">
                                <Plus className="h-3 w-3" /> Set Standard
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
                <ControlBox title="Saved Formulas">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                    Save the current method as a formula. Then register analyzed lots to compare results.
                  </div>
                  <SaveFormulaDialog onSave={handleSaveFormula}>
                    <Button size="sm" className="w-full h-7 text-xs gap-1 mb-2">
                      <Plus className="h-3 w-3" /> Save Current Formula
                    </Button>
                  </SaveFormulaDialog>
                  <div className="space-y-1.5 mt-1">
                    {formulas.length === 0 && (
                      <div style={{ fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", textAlign: "center", padding: "8px 0" }}>
                        No formulas saved
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
                            {lotCount} lot{lotCount !== 1 ? "s" : ""} · {new Date(f.createdAt).toLocaleDateString("en-US")}
                          </div>
                          <div className="flex gap-1 mt-1.5">
                            <Button size="sm" variant="outline" className="h-5 text-xs px-1.5 flex-1"
                              onClick={e => { e.stopPropagation(); handleLoadFormula(f); }}>
                              <Download className="h-2.5 w-2.5 mr-0.5" /> Load
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

            {page === "padrao" && (
              <ControlBox title="📚 Standards Library">
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#888", marginBottom: 6, lineHeight: 1.5 }}>
                  Save reference standard configs to reuse quickly. Click <b>Load</b> to restore any preset.
                </div>
                {/* Save current config as a new preset */}
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder={padraoConfig.compoundName || "Preset name…"}
                    value={padraoPresetSaveName}
                    onChange={e => setPadraoPresetSaveName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== "Enter") return;
                      const name = padraoPresetSaveName.trim() || padraoConfig.compoundName || "Standard";
                      const preset: PadraoPreset = { id: uid(), name, compoundName: padraoConfig.compoundName, stdArea: padraoConfig.stdArea, stdAmountUg: padraoConfig.stdAmountUg, stdPurity: padraoConfig.stdPurity };
                      const next = [...padraoPresets, preset];
                      setPadraoPresets(next); savePadraoPresets(next); setPadraoPresetSaveName("");
                    }}
                    style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: 9, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
                  />
                  <button
                    onClick={() => {
                      const name = padraoPresetSaveName.trim() || padraoConfig.compoundName || "Standard";
                      const preset: PadraoPreset = { id: uid(), name, compoundName: padraoConfig.compoundName, stdArea: padraoConfig.stdArea, stdAmountUg: padraoConfig.stdAmountUg, stdPurity: padraoConfig.stdPurity };
                      const next = [...padraoPresets, preset];
                      setPadraoPresets(next); savePadraoPresets(next); setPadraoPresetSaveName("");
                    }}
                    style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "3px 8px", border: "1px solid #3b82f6", borderRadius: 4, background: "#eff6ff", cursor: "pointer", color: "#1d4ed8", fontWeight: "bold", whiteSpace: "nowrap" }}
                  >
                    + Save
                  </button>
                </div>
                {/* Saved presets list */}
                {padraoPresets.length === 0 ? (
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa", textAlign: "center", padding: "8px 0" }}>
                    No standards saved yet.<br />Fill in the Reference Standard and click "+ Save".
                  </div>
                ) : (
                  <div className="space-y-1">
                    {padraoPresets.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 6px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                        <div style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: 9, color: "#1e293b", overflow: "hidden", minWidth: 0 }}>
                          <div style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</div>
                          <div style={{ color: "#94a3b8", fontSize: 8 }}>{p.compoundName || "—"} · {p.stdPurity}%</div>
                        </div>
                        <button
                          onClick={() => updatePadraoProtected({ compoundName: p.compoundName, stdArea: p.stdArea, stdAmountUg: p.stdAmountUg, stdPurity: p.stdPurity })}
                          title="Load this standard into the Reference Standard card"
                          style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "2px 6px", border: "1px solid #3b82f6", borderRadius: 3, background: "#eff6ff", cursor: "pointer", color: "#1d4ed8", flexShrink: 0 }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => { const next = padraoPresets.filter(x => x.id !== p.id); setPadraoPresets(next); savePadraoPresets(next); }}
                          title="Delete this preset"
                          style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "2px 5px", border: "1px solid #fca5a5", borderRadius: 3, background: "#fff1f2", cursor: "pointer", color: "#dc2626", flexShrink: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Pre-registered templates ── */}
                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 8 }}>
                  <button
                    onClick={() => setPadraoTemplatesOpen(v => !v)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 9, fontWeight: "bold", color: "#475569", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: padraoTemplatesOpen ? 6 : 0 }}
                  >
                    <span>🧪 Padrões de Referência</span>
                    <span style={{ fontSize: 8 }}>{padraoTemplatesOpen ? "▲" : "▼"}</span>
                  </button>
                  {padraoTemplatesOpen && (
                    <>
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#94a3b8", marginBottom: 5, lineHeight: 1.4 }}>
                        Clique <b>Load</b> para preencher o Composto e a Pureza.<br />
                        Área e Quantidade devem ser inseridas manualmente.
                      </div>
                      <div className="space-y-1">
                        {PADRAO_TEMPLATES.map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4 }}>
                            <div style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: 9, color: "#1e293b", overflow: "hidden", minWidth: 0 }}>
                              <div style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>{t.name}</div>
                              <div style={{ color: "#6b7280", fontSize: 8 }}>{t.compoundName} · {t.stdPurity}%</div>
                            </div>
                            <button
                              onClick={() => updatePadraoProtected({ compoundName: t.compoundName, stdPurity: t.stdPurity })}
                              title="Carrega nome e pureza do padrão"
                              style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "2px 6px", border: "1px solid #16a34a", borderRadius: 3, background: "#dcfce7", cursor: "pointer", color: "#15803d", flexShrink: 0 }}
                            >
                              Load
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </ControlBox>
            )}
          </div>
        )}

        {/* ── RIGHT: Agilent report paper ──────────────────────────────────── */}
        <div style={{ flex: 1, background: "#fff", border: "1px solid #bbb", boxShadow: "0 2px 8px rgba(0,0,0,.18)", padding: "28px 32px 20px", minWidth: 0, ...MONO, fontSize: 11.5, position: "relative", overflow: "hidden" }}>

          {/* ── SESSION LOCK OVERLAY — blocks editing when session is concluded ── */}
          {snapshotIsLocked && LOCK_PAGES.includes(page) && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 200,
              background: "rgba(15,23,42,0.72)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(3px)",
            }}>
              <div style={{ background: "#fff", borderRadius: 14, padding: "32px 40px", textAlign: "center", maxWidth: 430, boxShadow: "0 8px 40px rgba(0,0,0,0.35)", fontFamily: "Courier New, monospace" }}>
                <div style={{ fontSize: 38, marginBottom: 12 }}>🔒</div>
                <div style={{ fontWeight: "bold", fontSize: 15, color: "#1e293b", marginBottom: 6 }}>Analysis Closed</div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, lineHeight: 1.7 }}>
                  <b>{snapshotSession?.name}</b> was concluded as{" "}
                  <b style={{ color: snapshotSession?.status === "aprovado" ? "#16a34a" : snapshotSession?.status === "reprovado" ? "#dc2626" : "#7c3aed" }}>
                    {snapshotSession?.status === "aprovado" ? "Approved" : snapshotSession?.status === "reprovado" ? "Rejected" : "Report Issued"}
                  </b>.
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
                  Editing any step of this analysis requires<br />Master password authentication.
                </div>
                <button
                  onClick={() => {
                    setMasterAuthDialog({ onSuccess: () => setUnlockedSessionId(currentSnapshotSessionId ?? "") });
                    setMasterAuthInput("");
                    setMasterAuthError(null);
                  }}
                  style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "11px 30px", fontWeight: "bold", cursor: "pointer", fontSize: 12, fontFamily: "Courier New, monospace", boxShadow: "0 2px 8px rgba(29,78,216,0.4)", display: "block", width: "100%", marginBottom: 10 }}
                >
                  🔑 Unlock with Master Password
                </button>
                <button
                  onClick={() => setPage("sessoes")}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 10, fontFamily: "Courier New, monospace", textDecoration: "underline" }}
                >
                  ← Back to Sessions
                </button>
              </div>
            </div>
          )}

          {/* ── SESSÕES DE ANÁLISE ───────────────────────────────────── */}
          {page === "sessoes" && (() => {
            const total = analysisSessions.length;
            const emAndamento = analysisSessions.filter(s => s.status === "em_andamento").length;
            const aprovados = analysisSessions.filter(s => s.status === "aprovado").length;
            const reprovados = analysisSessions.filter(s => s.status === "reprovado").length;
            const laudos = analysisSessions.filter(s => s.status === "laudo_emitido").length;
            const imgCount = savedImages.length;

            const statusLabel: Record<string, string> = {
              em_andamento: "In Progress",
              aprovado: "Approved",
              reprovado: "Rejected",
              laudo_emitido: "Report Issued",
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
                  Analysis Sessions
                </div>

                {/* Stat cards — clickable to filter the session list below */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
                  {[
                    { label: "Total", value: total, bg: "#f8fafc", color: "#334155", Icon: Activity, filter: null },
                    { label: "In Progress", value: emAndamento, bg: "#dbeafe", color: "#1d4ed8", Icon: FlaskConical, filter: "em_andamento" },
                    { label: "Approved", value: aprovados, bg: "#dcfce7", color: "#16a34a", Icon: ClipboardCheck, filter: "aprovado" },
                    { label: "Rejected", value: reprovados, bg: "#fee2e2", color: "#dc2626", Icon: ClipboardX, filter: "reprovado" },
                  ].map(({ label, value, bg, color, Icon, filter }) => {
                    const isActive = panelStatusFilter === filter;
                    return (
                      <div key={label}
                        onClick={() => setPanelStatusFilter(isActive ? null : filter)}
                        style={{
                          background: bg, border: `2px solid ${isActive ? color : color + "33"}`,
                          borderRadius: 8, padding: "14px 12px", textAlign: "center",
                          cursor: "pointer", transform: isActive ? "scale(1.03)" : "scale(1)",
                          boxShadow: isActive ? `0 2px 10px ${color}44` : "none",
                          transition: "all 0.15s",
                          userSelect: "none",
                        }}>
                        <Icon style={{ width: 20, height: 20, color, margin: "0 auto 6px" }} />
                        <div style={{ fontSize: 22, fontWeight: "bold", color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: 9, color: "#666", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                        {isActive && <div style={{ fontSize: 8, color, marginTop: 3, fontWeight: "bold" }}>filtered ✓</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Imagens salvas banner */}
                <div style={{ background: imgCount > 0 ? "#f0fdf4" : "#fafaf9", border: `1px solid ${imgCount > 0 ? "#86efac" : "#e5e7eb"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
                  <ImageIcon style={{ width: 16, height: 16, color: imgCount > 0 ? "#16a34a" : "#64748b" }} />
                  <span style={{ fontSize: 11, color: "#555" }}>
                    <b style={{ color: imgCount > 0 ? "#16a34a" : "#334155", fontSize: 13 }}>{imgCount}</b>{" "}
                    chromatogram image{imgCount !== 1 ? "s" : ""} saved and available to attach to the Stability Protocol.
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    {imgCount > 0 && (
                      <>
                        <button style={{ fontSize: 10, padding: "2px 10px", border: "1px solid #16a34a", borderRadius: 4, background: "#dcfce7", cursor: "pointer", color: "#16a34a", fontWeight: "bold", fontFamily: "Courier New, monospace" }}
                          onClick={() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                          View gallery ↓
                        </button>
                        <button style={{ fontSize: 10, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontFamily: "Courier New, monospace" }}
                          onClick={() => { if (confirm(`Delete all ${imgCount} saved images?`)) { setSavedImages([]); saveSavedImages([]); } }}>
                          Clear library
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Session list */}
                {analysisSessions.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: "40px 0" }}>
                    No analysis sessions created yet.<br />
                    <span style={{ fontSize: 10 }}>Go to the "Analysis" tab and create a new session.</span>
                  </div>
                ) : (() => {
                  const filtered = [...analysisSessions]
                    .filter(s => !panelStatusFilter || s.status === panelStatusFilter)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  return (
                  <>
                    {panelStatusFilter && (
                      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "#555", fontFamily: "Courier New, monospace" }}>
                          Showing {filtered.length} session(s) with filter: <b>{statusLabel[panelStatusFilter]}</b>
                        </span>
                        <button style={{ fontSize: 9, padding: "1px 8px", border: "1px solid #94a3b8", borderRadius: 4, background: "#f1f5f9", cursor: "pointer", color: "#475569" }}
                          onClick={() => setPanelStatusFilter(null)}>
                          ✕ Clear filter
                        </button>
                      </div>
                    )}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        {["Session", "Formula", "Runs", "Status", "Date", "Actions"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: "bold", color: "#334155", borderBottom: "1px solid #cbd5e1", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s, i) => {
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
                                {s.runs.length}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ background: statusBg[s.status] ?? "#f1f5f9", color: statusColor[s.status] ?? "#334155", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold", whiteSpace: "nowrap" }}>
                                {statusLabel[s.status] ?? s.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap" }}>
                              {new Date(s.createdAt).toLocaleDateString("en-US")}
                            </td>
                            <td style={{ padding: "8px 6px" }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {/* Go to analysis */}
                                <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #1d4ed8", borderRadius: 4, background: "#eff6ff", cursor: "pointer", color: "#1d4ed8", fontWeight: "bold" }}
                                  onClick={goToSession}>
                                  → Open
                                </button>

                                {/* Revisar — loads snapshot; concluded sessions require Master password */}
                                {s.snapshotState && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #0284c7", borderRadius: 4, background: "#e0f2fe", cursor: "pointer", color: "#0284c7" }}
                                    onClick={() => {
                                      if (s.status !== "em_andamento") {
                                        setMasterAuthDialog({
                                          onSuccess: () => {
                                            setUnlockedSessionId(s.id);
                                            handleLoadSnapshotSession(s);
                                          },
                                        });
                                        setMasterAuthInput("");
                                        setMasterAuthError(null);
                                      } else {
                                        handleLoadSnapshotSession(s);
                                      }
                                    }}>
                                    {s.status !== "em_andamento" ? "🔒 Review" : "↩ Review"}
                                  </button>
                                )}

                                {/* Concluir — opens proper dialog for em_andamento sessions */}
                                {s.status === "em_andamento" && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #16a34a", borderRadius: 4, background: "#dcfce7", cursor: "pointer", color: "#16a34a" }}
                                    onClick={() => {
                                      setFinalizeStatus("aprovado");
                                      setFinalizeNotes(s.conclusionNotes ?? "");
                                      setFinalizeDialog({ id: s.id, name: s.name });
                                    }}>
                                    <ClipboardCheck style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Conclude
                                  </button>
                                )}

                                {/* Reopen — move back to em_andamento */}
                                {(s.status === "aprovado" || s.status === "reprovado") && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #f59e0b", borderRadius: 4, background: "#fef9c3", cursor: "pointer", color: "#92400e" }}
                                    onClick={() => {
                                      setFinalizeStatus("em_andamento");
                                      setFinalizeNotes(s.conclusionNotes ?? "");
                                      setFinalizeDialog({ id: s.id, name: s.name });
                                    }}>
                                    ✎ Change Status
                                  </button>
                                )}

                                {/* Emit Laudo */}
                                {(s.status === "aprovado" || s.status === "reprovado") && (
                                  <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #7c3aed", borderRadius: 4, background: "#f3e8ff", cursor: "pointer", color: "#7c3aed" }}
                                    onClick={() => { if (confirm(`Issue report for "${s.name}"?`)) handleEmitLaudo(s.id); }}>
                                    <ScrollText style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Issue Report
                                  </button>
                                )}

                                {/* Save PNG */}
                                {s.runs.length > 0 && (
                                  <>
                                    <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #0284c7", borderRadius: 4, background: "#e0f2fe", cursor: "pointer", color: "#0284c7" }}
                                      onClick={() => handleSavePng(s.id, false)}>
                                      <ImageDown style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />PNG
                                    </button>
                                    <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #16a34a", borderRadius: 4, background: "#dcfce7", cursor: "pointer", color: "#16a34a" }}
                                      onClick={() => handleSavePng(s.id, true)}>
                                      <ImageIcon style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />→ Biblioteca
                                    </button>
                                  </>
                                )}

                                {/* Delete with password */}
                                <button style={{ fontSize: 9, padding: "2px 7px", border: "1px solid #dc2626", borderRadius: 4, background: "#fee2e2", cursor: "pointer", color: "#dc2626" }}
                                  onClick={() => openDeleteSessionDialog(s.id, s.name)}>
                                  <Trash2 style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} />Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </>
                  );
                })()}

                {/* Saved images gallery */}
                <div ref={galleryRef} />
                {savedImages.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ fontWeight: "bold", fontSize: 12, marginBottom: 12, borderBottom: "1px solid #bbb", paddingBottom: 6, color: "#334155" }}>
                      Biblioteca de Imagens — disponíveis para o Protocolo de Estabilidade
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {savedImages.map(img => (
                        <div key={img.id} style={{ border: img.certificateNumber ? "1.5px solid #16a34a" : "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                          <div style={{ position: "relative" }}>
                            <img src={img.imageData} alt={img.sessionName} style={{ width: "100%", height: 120, objectFit: "cover", borderBottom: "1px solid #e2e8f0", display: "block" }} />
                            {img.certificateNumber && (
                              <span style={{ position: "absolute", top: 4, right: 4, background: "#16a34a", color: "#fff", fontSize: 7, fontWeight: "bold", padding: "2px 5px", borderRadius: 3 }}>
                                CERT: {img.certificateNumber}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: "6px 8px" }}>
                            <div style={{ fontSize: 9, fontWeight: "bold", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.sessionName}</div>
                            <div style={{ fontSize: 8, color: "#64748b" }}>{img.formulaName} · {new Date(img.createdAt).toLocaleDateString("en-US")}</div>
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
              {/* Data File + Sample Name — Agilent ChemStation format */}
              <div style={{ marginBottom: 6 }}>
                <div>Data File {sample.dataFile}</div>
                <div>Sample Name: {sample.sampleName}</div>
              </div>

              <Div />
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Acq. Operator   : " + sample.acqOperator.padEnd(38) + "Seq. Line : " + String(sample.seqLine).padStart(3)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Acq. Instrument : " + sample.acqInstrument.padEnd(36) + "Location : " + sample.location}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    Injection Date  : " + sample.injectionDate.padEnd(38) + "Inj :  " + sample.inj}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {"    " + " ".repeat(59) + "Inj Volume : " + sample.injVolume}
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {"    Acq. Method     : " + sample.acqMethod}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Courier New, monospace", fontSize: "inherit" }}>
                <span style={{ whiteSpace: "pre", flexShrink: 0 }}>{"    Last changed    : "}</span>
                <input
                  value={sample.lastChanged1}
                  onChange={sField("lastChanged1")}
                  style={{ fontFamily: "Courier New, monospace", fontSize: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed #94a3b8", outline: "none", padding: 0, margin: 0, flex: 1, minWidth: 160 }}
                />
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{"    Analysis Method : " + sample.analysisMethod}</div>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Courier New, monospace", fontSize: "inherit" }}>
                <span style={{ whiteSpace: "pre", flexShrink: 0 }}>{"    Last changed    : "}</span>
                <input
                  value={sample.lastChanged2}
                  onChange={sField("lastChanged2")}
                  style={{ fontFamily: "Courier New, monospace", fontSize: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed #94a3b8", outline: "none", padding: 0, margin: 0, flex: 1, minWidth: 160 }}
                />
              </div>
              <div style={{ whiteSpace: "pre", wordBreak: "break-all" }}>{"              " + fullSignalLine}</div>
              {/* ── Baseline toggle (never prints) ───────────────────────── */}
              <div className="no-print">
                <Div />
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => setShowBaselines(s => !s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
                      border: `1px solid ${showBaselines ? "#16a34a" : "#94a3b8"}`,
                      borderRadius: 4, cursor: "pointer",
                      background: showBaselines ? "#f0fdf4" : "#f8fafc",
                      color: showBaselines ? "#16a34a" : "#64748b",
                      fontSize: 9, fontFamily: "Courier New, monospace", fontWeight: "bold",
                    }}
                  >
                    {showBaselines ? "▼" : "▶"}&nbsp;Integration Baseline&nbsp;
                    <span style={{ fontWeight: "normal" }}>{showBaselines ? "ON — corrected area" : "OFF"}</span>
                  </button>
                  {showBaselines && (
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#16a34a" }}>
                      Green line = integration baseline · area above baseline used for quantification
                    </span>
                  )}
                </div>
              </div>

              {/* Chromatogram chart */}
              <div
                ref={chartContainerRef}
                style={{ marginTop: 14, marginBottom: 6, position: "relative", cursor: draggingPeakId ? "ew-resize" : "crosshair" }}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseUp}
                onContextMenu={handleChartContextMenu}
              >
                <div style={{ fontSize: 11, marginBottom: 2 }}>mAU</div>
                {/* Drag hint tooltip — hidden when printing */}
                {!draggingPeakId && peakStats.some(p => !p.locked) && (
                  <div className="no-print" style={{ position: "absolute", bottom: 28, left: 54, fontSize: 9, color: "#aaa", fontFamily: "Courier New, monospace", pointerEvents: "none" }}>
                    ← drag peak to adjust RT →
                  </div>
                )}
                {/* overflow:visible lets vertical peak labels render above the plot margin */}
                <style>{`.hplc-main-chart .recharts-wrapper svg { overflow: visible; }`}</style>
                <div className="hplc-main-chart" style={{ position: "relative", border: "1px solid #333" }}>
                {/* Signal label overlay inside chart — blue, matches ChemStation annotation */}
                {signalLabelEditing ? (
                  <div style={{
                    position: "absolute", top: 2, left: 4, right: 20,
                    zIndex: 20, display: "flex", alignItems: "center", gap: 3,
                  }}>
                    <input
                      autoFocus
                      value={sample.signalLabelOverride ?? ""}
                      placeholder={`${signalLabel} (${sample.dataFile})`}
                      onChange={e => setSample(s => ({ ...s, signalLabelOverride: e.target.value }))}
                      onBlur={() => setSignalLabelEditing(false)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setSignalLabelEditing(false); }}
                      style={{
                        flex: 1, fontSize: 9, fontFamily: "Courier New, monospace",
                        color: "#1560bd", fontWeight: 600,
                        border: "1px solid #1560bd", borderRadius: 2,
                        background: "rgba(255,255,255,0.97)", padding: "1px 4px",
                        outline: "none",
                      }}
                    />
                    {(sample.signalLabelOverride ?? "").trim() !== "" && (
                      <button
                        onMouseDown={e => { e.preventDefault(); setSample(s => ({ ...s, signalLabelOverride: "" })); }}
                        title="Restore auto text"
                        style={{ fontSize: 8, padding: "1px 3px", cursor: "pointer", borderRadius: 2, border: "1px solid #ccc", background: "#f5f5f5", color: "#555" }}
                      >↺</button>
                    )}
                  </div>
                ) : (
                  <div
                    className="no-print"
                    title="Click to edit"
                    onClick={() => setSignalLabelEditing(true)}
                    style={{
                      position: "absolute", top: 3, left: 4, right: 20,
                      fontSize: 9, fontFamily: "Courier New, monospace",
                      color: "#1560bd", fontWeight: 600,
                      zIndex: 20, cursor: "text",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      background: "rgba(255,255,255,0.88)", padding: "0 3px", borderRadius: 2,
                      maxWidth: "calc(100% - 24px)",
                    }}
                  >
                    {fullSignalLine}
                    <span style={{ marginLeft: 4, opacity: 0.4, fontSize: 8 }}>✎</span>
                  </div>
                )}
                {/* Print version — always static */}
                <div
                  className="print-only"
                  style={{
                    position: "absolute", top: 3, left: 4, right: 20,
                    fontSize: 9, fontFamily: "Courier New, monospace",
                    color: "#1560bd", fontWeight: 600,
                    zIndex: 20, pointerEvents: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    background: "rgba(255,255,255,0.88)", padding: "0 3px", borderRadius: 2,
                    maxWidth: "calc(100% - 24px)",
                  }}
                >
                  {fullSignalLine}
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={mergedChrom} margin={{ top: 75, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#e2e2e2" />
                    <XAxis dataKey="time" type="number" domain={[0, detector.runTime]} ticks={xTicks}
                      tickFormatter={v => v.toFixed(1)}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                      label={{ value: "min", position: "insideBottomRight", offset: 0, dy: 16, fontFamily: "Courier New, monospace", fontSize: 11 }}
                      axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} />
                    <YAxis domain={[detector.yAxisAuto ? 0 : (detector.yAxisMin ?? 0), yMax]} ticks={yTicks}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                      axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} width={46} />
                    <Tooltip content={<ChromTooltip peakStats={peakStats} />} />

                    {/* Integration boundary lines removed — hidden on screen and print */}

                    {/* Name + RT label above named peaks (any type), plus RT-only label
                        for any unnamed peak that is currently being dragged */}
                    {peakStats
                      .filter(p => p.name || p.id === draggingPeakId)
                      .map(p => (
                        <ReferenceLine key={`rt-${p.id}`} x={p.retentionTime} stroke="none"
                          label={(props: { viewBox?: { x: number; y: number } }) => (
                            <PeakLabel
                              viewBox={props.viewBox}
                              rt={p.retentionTime}
                              name={p.name || (p.isGhost ? "👻" : undefined)}
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

                {/* ── Integration Baseline SVG Overlay ─────────────────────── */}
                {showBaselines && (() => {
                  const CM_L = 54, CM_R = 16, CM_T = 75, CM_B = 24;
                  const CHART_H = 360;
                  const w = chartContainerRef.current?.clientWidth ?? 640;
                  const plotW = w - CM_L - CM_R;
                  const plotH = CHART_H - CM_T - CM_B;
                  const tx = (t: number) => CM_L + (Math.max(0, Math.min(detector.runTime, t)) / detector.runTime) * plotW;
                  const ty = (mAU: number) => CM_T + plotH * (1 - Math.max(0, Math.min(yMax, mAU)) / yMax);
                  return (
                    <svg
                      className="no-print"
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: CHART_H, pointerEvents: "none", zIndex: 10 }}
                    >
                      {peakStats.map(p => {
                        const { tStart, tEnd } = peakIntegBounds(p, detector.runTime);
                        const yStart = interpolateChromSignal(chromatogram, tStart);
                        const yEnd   = interpolateChromSignal(chromatogram, tEnd);
                        const x1 = tx(tStart), y1 = ty(yStart);
                        const x2 = tx(tEnd),   y2 = ty(yEnd);
                        const color = p.name ? "#16a34a" : "#94a3b8";

                        // Sample chromatogram points between the integration boundaries for the fill polygon
                        const chromPts = chromatogram.filter(d => d.time >= tStart - 0.001 && d.time <= tEnd + 0.001);
                        // Top edge: signal curve; bottom edge: straight baseline back from tEnd to tStart
                        const polyPoints = [
                          `${x1},${ty(yStart)}`,
                          ...chromPts.map(d => `${tx(d.time)},${ty(d.signal)}`),
                          `${x2},${ty(yEnd)}`,
                          `${x2},${y2}`,
                          `${x1},${y1}`,
                        ].join(' ');

                        return (
                          <g key={p.id}>
                            {/* Filled integration zone — light shading above the baseline */}
                            <polygon points={polyPoints} fill={color} fillOpacity={0.09} stroke="none" />
                            {/* Straight integration baseline — dashed */}
                            <line x1={x1} y1={y1} x2={x2} y2={y2}
                              stroke={color} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.85} />
                            {/* Boundary tick at integration start */}
                            <line x1={x1} y1={y1 - 7} x2={x1} y2={y1 + 7}
                              stroke={color} strokeWidth={1.5} opacity={0.85} />
                            {/* Boundary tick at integration end */}
                            <line x1={x2} y1={y2 - 7} x2={x2} y2={y2 + 7}
                              stroke={color} strokeWidth={1.5} opacity={0.85} />
                            {/* Corrected area label above the baseline midpoint */}
                            {p.name && p.correctedArea > 0 && (
                              <text
                                x={(x1 + x2) / 2}
                                y={Math.min(y1, y2) - 10}
                                textAnchor="middle"
                                style={{ fontFamily: "Courier New, monospace", fontSize: 8, fill: color, fontWeight: "bold" }}
                              >
                                {p.correctedArea.toFixed(0)} mAU·s
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}

                {/* Legend when std peak is visible */}
                {stdPeakInfo && (
                  <div style={{ display: "flex", gap: 16, fontSize: 9, fontFamily: "Courier New, monospace", marginTop: 4, paddingLeft: 54 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 20, height: 2, background: "#1560bd" }} /> Sample
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 20, height: 2, background: "#f97316", borderTop: "2px dashed #f97316" }} /> Standard (Level {stdPeakInfo.level})
                    </span>
                  </div>
                )}
                </div>{/* /hplc-main-chart */}
              </div>

              {/* External Standard Report */}
              <div style={{ marginTop: 16 }}>
                <SectionTitle title="Report — External Standard" />
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
                  <div style={{ whiteSpace: "pre" }}>{"    -------|------|----------|----------|----------|--|------------------"}</div>
                  {peakStats.map(p => {
                    const area = p.displayArea;
                    const amtPerArea = p.amtPerArea > 0 ? p.amtPerArea : (area > 0 && p.calcAmount > 0 ? p.calcAmount / area : 0);
                    const rt = p.retentionTime.toFixed(3).padStart(7);
                    const type = p.peakType.padEnd(6);
                    const areaStr = fmtArea(area).padStart(10);
                    const aptStr = amtPerArea > 0 ? fmtSci2(amtPerArea, -2).padStart(10) : "".padStart(10);
                    const amtStr = p.calcAmount > 0 ? p.calcAmount.toFixed(5).padStart(10) : "".padStart(10);
                    const grpStr = (p.grp || "").padEnd(2);
                    const nameStr = p.name;
                    return (
                      <div key={p.id} style={{ whiteSpace: "pre" }}>
                        {"    " + rt + " " + type + " " + areaStr + " " + aptStr + " " + amtStr + " " + grpStr + "  " + nameStr}
                      </div>
                    );
                  })}
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                  <div style={{ whiteSpace: "pre" }}>
                    {"    Totals :                                                                             " + totalAmount.toFixed(5)}
                  </div>
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                </div>
              </div>
            </>
          )}

          {/* ── REPORT PAGE ──────────────────────────────────────────────── */}
          {page === "report" && (
            <>
              {/* Data File + Sample Name — Agilent ChemStation format */}
              <div style={{ marginBottom: 6 }}>
                <div>Data File {sample.dataFile}</div>
                <div>Sample Name: {sample.sampleName}</div>
              </div>
              <Div />
              <div style={{ whiteSpace: "pre-wrap" }}>{"    Acq. Operator   : " + sample.acqOperator.padEnd(38) + "Seq. Line : " + String(sample.seqLine).padStart(3)}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{"    Acq. Instrument : " + sample.acqInstrument.padEnd(36) + "Location : " + sample.location}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{"    Injection Date  : " + sample.injectionDate.padEnd(38) + "Inj :  " + sample.inj}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{"    " + " ".repeat(59) + "Inj Volume : " + sample.injVolume}</div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{"    Acq. Method     : " + sample.acqMethod}</div>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Courier New, monospace", fontSize: "inherit" }}>
                <span style={{ whiteSpace: "pre", flexShrink: 0 }}>{"    Last changed    : "}</span>
                <input
                  value={sample.lastChanged1}
                  onChange={sField("lastChanged1")}
                  style={{ fontFamily: "Courier New, monospace", fontSize: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed #94a3b8", outline: "none", padding: 0, margin: 0, flex: 1, minWidth: 160 }}
                />
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{"    Analysis Method : " + sample.analysisMethod}</div>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Courier New, monospace", fontSize: "inherit" }}>
                <span style={{ whiteSpace: "pre", flexShrink: 0 }}>{"    Last changed    : "}</span>
                <input
                  value={sample.lastChanged2}
                  onChange={sField("lastChanged2")}
                  style={{ fontFamily: "Courier New, monospace", fontSize: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed #94a3b8", outline: "none", padding: 0, margin: 0, flex: 1, minWidth: 160 }}
                />
              </div>
              <div style={{ whiteSpace: "pre", wordBreak: "break-all" }}>{"              " + fullSignalLine}</div>
              <Div />

              {/* External Standard Report — only print-selected peaks */}
              <div style={{ marginTop: 16, position: "relative" }}>
                <SectionTitle title="Report — External Standard" />
                {/* Botão fora do quadro — no-print, nunca aparece no PDF */}
                {padraoExtHasData && (
                  <button
                    onClick={() => setShowExtStdNote(v => !v)}
                    title={showExtStdNote ? "Ocultar nota do padrão externo" : "Mostrar nota do padrão externo"}
                    className="no-print"
                    style={{ position: "absolute", top: 0, right: 0, background: "none", border: "1px solid #d1d5db", borderRadius: 4, padding: "1px 7px", cursor: "pointer", fontSize: 9, color: "#9ca3af", fontFamily: "Courier New, monospace", display: "flex", alignItems: "center", gap: 3 }}
                  >
                    👁
                  </button>
                )}
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
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <div style={{ whiteSpace: "pre" }}>{"    RetTime Type      Area     Amt/Area    Amount   Grp    Name"}</div>
                  <div style={{ whiteSpace: "pre" }}>{"     [min]          [mAU*s]               [ug/ml]"}</div>
                  <div style={{ whiteSpace: "pre" }}>{"    -------|------|----------|----------|----------|--|------------------"}</div>
                  {peakStats.filter(p => p.printSelected !== false).map(p => {
                    const isSmpPeak = isPadraoSamplePeak(p);
                    // For the sample peak, always use the value typed in Standard tab
                    const area = isSmpPeak && padraoConfig.smpArea > 0 ? padraoConfig.smpArea : p.displayArea;
                    const effectiveAmt = isSmpPeak ? padraoFoundUg : p.calcAmount;
                    const amtPerArea = p.amtPerArea > 0 ? p.amtPerArea : (area > 0 && effectiveAmt > 0 ? effectiveAmt / area : 0);
                    const rt = p.retentionTime.toFixed(3).padStart(7);
                    const type = p.peakType.padEnd(6);
                    const areaStr = fmtArea(area).padStart(10);
                    const aptStr = amtPerArea > 0 ? fmtSci2(amtPerArea, -2).padStart(10) : "".padStart(10);
                    const amtStr = effectiveAmt > 0 ? effectiveAmt.toFixed(5).padStart(10) : "".padStart(10);
                    const grpStr = (p.grp || "").padEnd(2);
                    const calibCompound = activeCompounds.find(c => c.id === (selectedCalibCompoundId ?? activeCompounds[0]?.id));
                    const displayName = isSmpPeak
                      ? (calibCompound?.name || padraoConfig.compoundName || p.name)
                      : p.name;
                    return (
                      <div key={p.id} style={{ whiteSpace: "pre" }}>
                        {"    " + rt + " " + type + " " + areaStr + " " + aptStr + " " + amtStr + " " + grpStr + "  " + displayName}
                      </div>
                    );
                  })}
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                  <div style={{ whiteSpace: "pre" }}>
                    {"    Totals :                                                                             " +
                      peakStats.filter(p => p.printSelected !== false).reduce((s, p) => s + (isPadraoSamplePeak(p) ? padraoFoundUg : p.calcAmount), 0).toFixed(5)}
                  </div>
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                  <div style={{ whiteSpace: "pre" }}>{""}</div>
                </div>
              </div>




              {/* Per-compound Calibration Tables — only show the compound selected/configured in the chromatogram */}
              {activeCompounds
                .filter(compound => {
                  // Filter 1: match the compound selected in the Calibration panel (by ID, then by name fallback)
                  const effectiveCalibId = selectedCalibCompoundId ?? activeCompounds[0]?.id ?? null;
                  if (effectiveCalibId) {
                    if (compound.id !== effectiveCalibId) return false;
                  } else if (calib.compoundName.trim()) {
                    const n = compound.name.toLowerCase();
                    const cn = calib.compoundName.toLowerCase().trim();
                    if (n !== cn) return false;
                  }
                  // Filter 2: must have calibration standards defined
                  const cc = getCC(compound.id);
                  if (cc.standards.length === 0) return false;
                  // Chart shows whenever ≥1 standard is defined (no peak required)
                  return true;
                })
                .map(compound => {
                const cc = getCC(compound.id);
                if (cc.standards.length === 0) return null;
                const compReg = linearRegression(cc.standards.map(s => ({ x: s.amount, y: s.area })));

                // Pre-calc diamond position so it's always included in axis bounds
                const _stdPurityFracPre = (padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity : 100) / 100;
                const _smpAreaPre = padraoConfig.smpArea > 0 ? padraoConfig.smpArea : 0;
                let _preDiamondX = 0, _preDiamondY = 0;
                if (compReg.slope > 0 && !padraoConfig.hideDiamondOnCurve) {
                  if (_smpAreaPre > 0) {
                    _preDiamondY = _smpAreaPre;
                    _preDiamondX = Math.max(0, (_smpAreaPre - compReg.intercept) / compReg.slope);
                  } else if (padraoConfig.stdAmountUg > 0) {
                    _preDiamondX = padraoConfig.stdAmountUg * _stdPurityFracPre;
                    _preDiamondY = Math.max(0, compReg.slope * _preDiamondX + compReg.intercept);
                  }
                }
                const compCalibXMax = Math.max(...cc.standards.map(s => s.amount), _preDiamondX, 1) * 1.15;
                const compCalibYMax = Math.max(...cc.standards.map(s => s.area), _preDiamondY, 1) * 1.2;
                const expRT = cc.calib.expRT > 0 ? cc.calib.expRT : compound.expectedRT;

                return (
                  <div key={compound.id} style={{ marginTop: 24 }}>



                    {/* ══════════════════════════════════════════════════════════════ */}
                    {/* Calibration Curves — full-width SVG chart matching original   */}
                    {/* ══════════════════════════════════════════════════════════════ */}
                    <div style={{ marginTop: 28 }}>
                      <div style={{ whiteSpace: "pre" }}>{"    " + "=".repeat(69)}</div>
                      <div style={{ whiteSpace: "pre" }}>{"    " + " ".repeat(26) + "Calibration Curves"}</div>
                      <div style={{ whiteSpace: "pre" }}>{"    " + "=".repeat(69)}</div>
                    </div>

                    {(() => {
                      const svgW = 360, svgH = 250;
                      const mL = 70, mR = 10, mT = 12, mB = 38;
                      const iW = svgW - mL - mR;
                      const iH = svgH - mT - mB;
                      const xs = (v: number) => mL + (v / compCalibXMax) * iW;
                      const ys = (v: number) => mT + iH - (Math.min(Math.max(v, 0), compCalibYMax) / compCalibYMax) * iH;
                      const sorted = [...cc.standards].sort((a, b) => a.amount - b.amount);
                      // Y ticks — números inteiros bonitos (ex: 0, 500, 1000, 1500, 2000)
                      const niceYTicks = (maxVal: number, target = 5): number[] => {
                        if (maxVal <= 0) return [0];
                        const raw = maxVal / target;
                        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
                        const norm = raw / mag;
                        const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
                        const ticks: number[] = [];
                        for (let t = 0; t <= maxVal * 1.001; t += step) ticks.push(Math.round(t));
                        return ticks;
                      };
                      const yTicks = niceYTicks(compCalibYMax);
                      // X ticks — números inteiros bonitos
                      const niceXTicks = (maxVal: number, target = 5): number[] => {
                        if (maxVal <= 0) return [0];
                        const raw = maxVal / target;
                        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
                        const norm = raw / mag;
                        const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
                        const ticks: number[] = [];
                        for (let t = 0; t <= maxVal * 1.001; t += step) ticks.push(Math.round(t));
                        return ticks;
                      };
                      const xTicks = niceXTicks(compCalibXMax);
                      // ── Reta de regressão: clip correto nas bordas do gráfico ──
                      // Borda esquerda (x=0): se intercept < 0, a reta entra em y=0 a x = -b/m
                      const lineX0 = compReg.intercept < 0 && compReg.slope > 0
                        ? Math.max(0, -compReg.intercept / compReg.slope)
                        : 0;
                      const ry0 = Math.max(0, compReg.slope * lineX0 + compReg.intercept);
                      // Borda direita: pode ser limitada por x=compCalibXMax ou por y=compCalibYMax
                      const yAtXMax = compReg.slope * compCalibXMax + compReg.intercept;
                      const lineX1 = yAtXMax <= compCalibYMax
                        ? compCalibXMax
                        : Math.min(compCalibXMax, (compCalibYMax - compReg.intercept) / compReg.slope);
                      const ry1 = Math.min(compCalibYMax, yAtXMax);

                      // Format y-axis labels: integers only (ticks são sempre números bonitos)
                      const fmtY = (v: number) => {
                        if (v === 0) return "0";
                        if (v >= 100000) return Math.round(v / 1000) + "k";
                        return Math.round(v).toString();
                      };
                      // Format x-axis labels: integers only
                      const fmtX = (v: number) => {
                        if (v === 0) return "0";
                        return Math.round(v).toString();
                      };

                      return (
                        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 12 }}>
                          {/* Chart */}
                          <div style={{ flex: "none" }}>
                            <div style={{ fontSize: 10, marginBottom: 3, fontFamily: "Courier New, monospace", color: "#333" }}>Area</div>
                            <svg width={svgW} height={svgH} style={{ fontFamily: "Courier New, monospace", overflow: "visible", display: "block", border: "1px solid #555" }}>
                              {/* Y grid lines */}
                              {yTicks.map(t => (
                                <line key={`yg-${t}`} x1={mL} y1={ys(t)} x2={mL + iW} y2={ys(t)} stroke="#e0e0e0" strokeWidth={0.6} />
                              ))}
                              {/* Dashed guide lines: horizontal from Y-axis to point, vertical from point down to X-axis */}
                              {sorted.map(s => (
                                <g key={`gl-${s.id}`}>
                                  <line x1={mL} y1={ys(s.area)} x2={xs(s.amount)} y2={ys(s.area)} stroke="#ccc" strokeDasharray="3 2" strokeWidth={0.8} />
                                  <line x1={xs(s.amount)} y1={ys(s.area)} x2={xs(s.amount)} y2={mT + iH} stroke="#ccc" strokeDasharray="3 2" strokeWidth={0.8} />
                                </g>
                              ))}
                              {/* Axis lines */}
                              <line x1={mL} y1={mT} x2={mL} y2={mT + iH} stroke="#222" strokeWidth={1.2} />
                              <line x1={mL} y1={mT + iH} x2={mL + iW} y2={mT + iH} stroke="#222" strokeWidth={1.2} />
                              {/* Y ticks + labels */}
                              {yTicks.map(t => (
                                <g key={`yt-${t}`}>
                                  <line x1={mL - 4} y1={ys(t)} x2={mL} y2={ys(t)} stroke="#222" strokeWidth={1} />
                                  <text x={mL - 6} y={ys(t) + 3.5} textAnchor="end" fontSize={9.5} fill="#222">{fmtY(t)}</text>
                                </g>
                              ))}
                              {/* X ticks + labels */}
                              {xTicks.map(t => (
                                <g key={`xt-${t}`}>
                                  <line x1={xs(t)} y1={mT + iH} x2={xs(t)} y2={mT + iH + 4} stroke="#222" strokeWidth={1} />
                                  <text x={xs(t)} y={mT + iH + 14} textAnchor="middle" fontSize={9} fill="#222"
                                    transform={t > 0 ? `rotate(-35,${xs(t)},${mT + iH + 14})` : undefined}
                                  >{fmtX(t)}</text>
                                </g>
                              ))}
                              {/* X axis label */}
                              <text x={mL + iW / 2} y={svgH - 4} textAnchor="middle" fontSize={10} fill="#222">Amount[ug/ml]</text>
                              {/* Regression line — endpoints calculados com clip correto */}
                              <line x1={xs(lineX0)} y1={ys(ry0)} x2={xs(lineX1)} y2={ys(ry1)} stroke="#1560bd" strokeWidth={0.5} />
                              {/* Residual lines — vertical dashed segment from each point to the regression line */}
                              {sorted.map(s => {
                                const predictedArea = compReg.slope * s.amount + compReg.intercept;
                                const yPoint = ys(s.area);
                                const yPred  = ys(predictedArea);
                                if (Math.abs(yPoint - yPred) < 1) return null;
                                return (
                                  <line key={`res-${s.id}`}
                                    x1={xs(s.amount)} y1={yPoint}
                                    x2={xs(s.amount)} y2={yPred}
                                    stroke="#111" strokeWidth={1.2} strokeDasharray="3 2" opacity={0.8} />
                                );
                              })}
                              {/* Data point circles — black, numbered above */}
                              {sorted.map((s, idx) => (
                                <g key={`pt-${s.id}`}>
                                  <text x={xs(s.amount)} y={ys(s.area) - 8} textAnchor="middle" fontSize={8.5} fontWeight="bold" fill="#111">{idx + 1}</text>
                                  <circle cx={xs(s.amount)} cy={ys(s.area)} r={5} fill="#111" stroke="white" strokeWidth={1.5} />
                                </g>
                              ))}
                              {/* Standard point ◆ — padrão na curva de calibração */}
                              {(() => {
                                if (compReg.slope <= 0) return null;

                                const stdPurityFrac = (padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity : 100) / 100;
                                const midStd = cc.standards.length > 0
                                  ? cc.standards[Math.floor(cc.standards.length / 2)]
                                  : null;

                                // ── Determinar Area e Amount do ◆ ──
                                // Regra: Y = smpArea (área real medida);
                                //        X = back-calc da regressão: (smpArea − b) / m
                                // Isso garante que ◆ fique SEMPRE sobre a reta y=mx+b.
                                // O label X mostra o amount calculado pela curva (igual ao que aparece na tabela).
                                const smpAreaVal = padraoConfig.smpArea > 0 ? padraoConfig.smpArea : 0;
                                let stdArea: number;
                                let stdAmount: number;
                                let isAutoLine: boolean;
                                if (smpAreaVal > 0) {
                                  // Área real → X back-calculado da regressão → ponto sobre a reta
                                  stdArea    = smpAreaVal;
                                  stdAmount  = Math.max(0, (smpAreaVal - compReg.intercept) / compReg.slope);
                                  isAutoLine = false;
                                } else {
                                  // Sem área da amostra → usar ponto médio, predizer y
                                  const rawAmt = padraoConfig.stdAmountUg > 0
                                    ? padraoConfig.stdAmountUg * stdPurityFrac
                                    : (midStd ? midStd.amount : 0);
                                  stdAmount  = rawAmt;
                                  stdArea    = Math.max(0, compReg.slope * rawAmt + compReg.intercept);
                                  isAutoLine = true;
                                }
                                if (stdAmount <= 0 || stdArea <= 0) return null;
                                if (padraoConfig.hideDiamondOnCurve) return null;

                                // ◆ deve ficar SEMPRE exatamente sobre a reta y=mx+b.
                                // X vem do back-calc: (smpArea - b)/m  →  ys(smpArea) = cy está SOBRE a reta por definição.
                                // Nunca deslocar cy — qualquer shift tira o cristal da reta.
                                const cx = xs(Math.min(stdAmount, compCalibXMax));
                                const cy = ys(Math.min(Math.max(stdArea, 0), compCalibYMax));

                                const d = 3.5;
                                const diamond = `M${cx},${cy - d} L${cx + d},${cy} L${cx},${cy + d} L${cx - d},${cy} Z`;
                                return (
                                  <g key="std-pt">
                                    {/* Horizontal dashed guide: Y-axis → diamond */}
                                    <line x1={mL} y1={cy} x2={cx} y2={cy} stroke="#555" strokeDasharray="2 2" strokeWidth={0.6} opacity={0.5} />
                                    {/* Vertical dashed guide: diamond → X-axis */}
                                    <line x1={cx} y1={cy} x2={cx} y2={mT + iH} stroke="#555" strokeDasharray="2 2" strokeWidth={0.6} opacity={0.5} />
                                    {/* Diamond — filled if real area, outlined if predicted */}
                                    <path
                                      d={diamond}
                                      fill={isAutoLine ? "none" : "#111"}
                                      stroke="#111"
                                      strokeWidth={1}
                                    />
                                    {/* Y label */}
                                    <text x={mL + 4} y={cy - 3} textAnchor="start" fontSize={8.5} fontWeight="bold" fill="#333">
                                      {stdArea.toFixed(3)}{isAutoLine ? "*" : ""}
                                    </text>
                                    {/* X label — mostra padraoFoundUg (igual à tabela de resultados) */}
                                    <text x={cx + 3} y={mT + iH - 4} textAnchor="start" fontSize={8.5} fontWeight="bold" fill="#111">
                                      {(padraoFoundUg > 0 ? padraoFoundUg : stdAmount).toFixed(3)}
                                    </text>
                                  </g>
                                );
                              })()}
                            </svg>
                          </div>
                          {/* Stats panel — scientific format (Agilent ChemStation style) */}
                          {(() => {
                            const sorted2 = [...cc.standards].sort((a, b) => a.amount - b.amount);
                            const n2 = sorted2.length;
                            const r2val = compReg.r * compReg.r;
                            const rss = n2 > 2 ? compReg.residStdDev * compReg.residStdDev * (n2 - 2) : 0;
                            const rfs = sorted2.map(s => s.amount > 0 ? s.area / s.amount : 0);
                            const meanRF = rfs.length > 0 ? rfs.reduce((a, b) => a + b, 0) / rfs.length : 0;
                            const rfsd = rfs.length > 1 ? Math.sqrt(rfs.reduce((a, b) => a + Math.pow(b - meanRF, 2), 0) / (rfs.length - 1)) : 0;
                            const rfrsd = meanRF > 0 ? (rfsd / meanRF) * 100 : 0;
                            const slopeAbs = Math.abs(compReg.slope);
                            const slopeExp = slopeAbs > 0 ? Math.floor(Math.log10(slopeAbs)) : 0;
                            const slopeMant = slopeAbs / Math.pow(10, slopeExp);
                            const slopeSign = compReg.slope < 0 ? "-" : "";
                            const slopeStr = `${slopeSign}${slopeMant.toFixed(5)}e+${String(slopeExp).padStart(3, "0")}`;
                            const intSign = compReg.intercept >= 0 ? "+" : "";
                            const intStr = `${intSign}${compReg.intercept.toFixed(0)}`;
                            return (
                              <div style={{ paddingTop: 14, fontSize: 10, fontFamily: "Courier New, monospace", lineHeight: 2, color: "#111", minWidth: 260 }}>
                                <div>{compound.name + " at exp. RT: " + expRT.toFixed(3)}</div>
                                <div style={{ color: "#444" }}>{signalLabel}</div>
                                <div>{"Correlation:             " + Math.min(compReg.r, 0.99986).toFixed(5)}</div>
                                <div>{"Residual Std. Dev.:    " + compReg.residStdDev.toFixed(5)}</div>
                                <div>{"Formula: y = mx + b"}</div>
                                <div>{"     m:      " + compReg.slope.toFixed(5)}</div>
                                <div>{"     b:      " + compReg.intercept.toFixed(5)}</div>
                                <div>{"     x: Amount"}</div>
                                <div>{"     y: Area"}</div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* *** End of Report *** */}
                    <div style={{ marginTop: 28, fontFamily: "Courier New, monospace" }}>
                      <div style={{ whiteSpace: "pre" }}>{"    " + "=".repeat(69)}</div>
                      <div style={{ whiteSpace: "pre", textAlign: "center", fontWeight: "bold", letterSpacing: 2 }}>{"                   *** End of Report ***"}</div>
                      <div style={{ whiteSpace: "pre" }}>{"    " + "=".repeat(69)}</div>
                    </div>

                  </div>
                );
              })}

              {/* Saved chromatogram image viewer — shown when an image is selected in the left panel */}
              {reportSelectedImageId && (() => {
                const img = savedImages.find(i => i.id === reportSelectedImageId);
                if (!img) return null;
                return (
                  <div style={{ marginTop: 24 }}>
                    <SectionTitle title="Saved Chromatogram" />
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#555", marginBottom: 8 }}>
                      <div><b>Session:</b> {img.sessionName}</div>
                      <div><b>Saved on:</b> {new Date(img.createdAt).toLocaleString("en-US")}</div>
                    </div>
                    <div style={{ border: "1px solid #d1d5db", borderRadius: 4, overflow: "hidden", background: "#f9fafb" }}>
                      <img
                        src={img.imageData}
                        alt={`Chromatogram — ${img.sessionName}`}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = img.imageData;
                          a.download = `chromatogram_${img.sessionName.replace(/\s+/g, "_")}.png`;
                          a.click();
                        }}
                      >
                        <Download className="h-3 w-3" /> Download PNG
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setReportSelectedImageId(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* ── ATIVOS PAGE ───────────────────────────────────────────────── */}
          {page === "ativos" && (
            <div style={{ fontFamily: "Courier New, monospace" }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: "bold" }}>Active Compounds Library</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                  {activeCompounds.length} compound(s) — current detector: λ={detector.sigWavelength} nm
                </div>
              </div>
              <Div />
              <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={addActiveCompound}>
                  <Plus className="h-3 w-3" /> Add Compound
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={autoIdentifyPeaks}>
                  <Zap className="h-3 w-3" /> Auto-identify in Chromatogram
                </Button>
                {lastIdentified.length > 0 && (
                  <span style={{ fontSize: 10, color: "#166534", display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 style={{ width: 13, height: 13 }} />
                    {lastIdentified.length} peak(s) identified: {lastIdentified.join(", ")}
                  </span>
                )}
              </div>

              {/* Table — table-layout:fixed para caber sem scroll lateral */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "12%" }} /> {/* Compound */}
                  <col style={{ width: "5%" }} />  {/* λ */}
                  <col style={{ width: "4%" }} />  {/* ±λ */}
                  <col style={{ width: "5%" }} />  {/* RT */}
                  <col style={{ width: "4%" }} />  {/* ±RT */}
                  <col style={{ width: "7%" }} />  {/* Amt/Area */}
                  <col style={{ width: "5%" }} />  {/* Units */}
                  <col style={{ width: "4%" }} />  {/* Min */}
                  <col style={{ width: "4%" }} />  {/* Max */}
                  <col style={{ width: "6%" }} />  {/* Pureza % */}
                  <col style={{ width: "8%" }} />  {/* Std Area */}
                  <col style={{ width: "7%" }} />  {/* Inj. Amt */}
                  <col style={{ width: "7%" }} />  {/* Method */}
                  <col style={{ width: "8%" }} />  {/* Notes */}
                  <col style={{ width: "14%" }} /> {/* Status + ações */}
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "2px solid #333", background: "#f4f4f4" }}>
                    {[
                      "Compound", "λ nm", "±λ", "RT min", "±RT",
                      "Amt/Area", "Units", "Min", "Max",
                      "Pureza %", "Std Area\nmAU·s", "Inj. Amt\nµg", "Method", "Notes", "Status / Ações",
                    ].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "3px 5px",
                        fontFamily: "Courier New, monospace", fontWeight: "bold",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 9.5,
                      }}>{h}</th>
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
                    const td: React.CSSProperties = { padding: "3px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #ddd", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ ...td, fontWeight: "bold" }} title={c.name}>{c.name}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={{
                            background: wavMatch ? "#dcfce7" : "#f3f4f6",
                            color: wavMatch ? "#166534" : "#555",
                            padding: "0 4px", borderRadius: 3, fontWeight: wavMatch ? "bold" : "normal",
                          }}>{c.wavelength}</span>
                        </td>
                        <td style={{ ...td, textAlign: "center", color: "#888" }}>±{c.waveTol}</td>
                        <td style={{ ...td, textAlign: "center" }}>{c.expectedRT.toFixed(2)}</td>
                        <td style={{ ...td, textAlign: "center", color: "#888" }}>±{c.rtTol}</td>
                        <td style={{ ...td, textAlign: "right" }}>{c.amtPerArea.toFixed(4)}</td>
                        <td style={{ ...td }}>{c.units}</td>
                        <td style={{ ...td, textAlign: "right", color: c.specMin > 0 ? "#111" : "#bbb" }}>
                          {c.specMin > 0 ? c.specMin.toFixed(1) : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right", color: c.specMax > 0 ? "#111" : "#bbb" }}>
                          {c.specMax > 0 ? c.specMax.toFixed(1) : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={{
                            background: (c.certifiedPurity || 99.5) >= 99 ? "#dcfce7" : (c.certifiedPurity || 99.5) >= 95 ? "#fef9c3" : "#fee2e2",
                            color: (c.certifiedPurity || 99.5) >= 99 ? "#166534" : (c.certifiedPurity || 99.5) >= 95 ? "#713f12" : "#b91c1c",
                            padding: "0 5px", borderRadius: 3, fontWeight: "bold", fontSize: 9,
                          }}>
                            {(c.certifiedPurity || 99.5).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {(c.stdArea ?? 0) > 0
                            ? <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#166534", fontWeight: "bold" }}>{(c.stdArea!).toFixed(3)}</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {(c.stdAmountUg ?? 0) > 0
                            ? <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#166534", fontWeight: "bold" }}>{(c.stdAmountUg!).toFixed(3)}</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td style={{ ...td, color: "#666" }} title={c.method}>{c.method}</td>
                        <td style={{ ...td, color: "#888", fontSize: 9 }} title={c.notes}>{c.notes}</td>
                        <td style={{ padding: "2px 4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap" }}>
                            {/* Status pill */}
                            {peakMatch ? (
                              <span style={{
                                display: "flex", alignItems: "center", gap: 1, fontSize: 9,
                                padding: "1px 4px", borderRadius: 3,
                                background: inSpec === null ? "#e0f2fe" : inSpec ? "#dcfce7" : "#fee2e2",
                                color: inSpec === null ? "#0369a1" : inSpec ? "#166534" : "#b91c1c",
                                fontWeight: "bold", whiteSpace: "nowrap", flexShrink: 0,
                              }}>
                                {inSpec === null
                                  ? <><CheckCircle2 style={{ width: 9, height: 9 }} />{amount?.toFixed(2)} {c.units}</>
                                  : inSpec
                                    ? <><CheckCircle2 style={{ width: 9, height: 9 }} />{amount?.toFixed(2)} ✓</>
                                    : <><XCircle style={{ width: 9, height: 9 }} />{amount?.toFixed(2)} ✗</>
                                }
                              </span>
                            ) : (
                              <span style={{ fontSize: 9, color: "#aaa" }}>no peak</span>
                            )}
                            {/* Add to chrom */}
                            <Button size="sm" variant="ghost" title="Add to chromatogram"
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

              {activeCompounds.length === 0 && (
                <div style={{ textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: 12 }}>
                  No compounds registered. Click "Add Compound" to start.
                </div>
              )}

              <Div />
              <div style={{ marginTop: 12, fontSize: 10, color: "#666" }}>
                <b>Legend:</b> highlighted λ = current detector within tolerance · green = peak found and within spec · blue = peak found, no spec · red = out of spec · "no peak" = no chromatogram peak matches (RT ± tol)
              </div>
            </div>
          )}

          {/* ── ANÁLISE PAGE ──────────────────────────────────────────────── */}
          {page === "analise" && (() => {
            const session = analysisSessions.find(s => s.id === currentSessionId) ?? null;
            const sessionFormula = session ? formulas.find(f => f.id === session.formulaId) ?? null : null;
            const std = sessionFormula ? formulaStandards.find(s => s.formulaId === sessionFormula.id) ?? null : null;
            const compounds = sessionFormula?.activeCompounds ?? [];

            // ── PDFs Salvos sub-tab ──────────────────────────────────────
            if (analiseSubTab === "pdfs") {
              const filteredSaved = savedAnalyses.filter(a => {
                const q = analysisSearch.trim().toLowerCase();
                if (!q) return true;
                return (a.productName || "").toLowerCase().includes(q) ||
                  (a.certTitle || "").toLowerCase().includes(q) ||
                  (a.productLot || "").toLowerCase().includes(q) ||
                  (a.compoundName || "").toLowerCase().includes(q);
              }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

              if (filteredSaved.length === 0) {
                return (
                  <div style={{ textAlign: "center", color: "#aaa", padding: "60px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6, color: "#64748b" }}>
                      {analysisSearch ? "Nenhuma análise encontrada" : "Nenhuma análise salva ainda"}
                    </div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#bbb", maxWidth: 360, margin: "0 auto" }}>
                      {analysisSearch
                        ? `Não há resultados para "${analysisSearch}". Limpe a busca no painel à esquerda.`
                        : "Na aba Standard, preencha os campos de identificação e clique em 💾 Salvar para registrar uma análise aqui."}
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#1e3a5f", borderBottom: "2px solid #e2e8f0", paddingBottom: 6, marginBottom: 2 }}>
                    📄 PDFs Salvos — {filteredSaved.length} {filteredSaved.length === 1 ? "análise" : "análises"}
                  </div>
                  {filteredSaved.map(a => {
                    const date = a.savedAt ? new Date(a.savedAt).toLocaleString("pt-BR") : "—";
                    const cfg = a.config;
                    const stdArea = cfg.stdArea;
                    const smpArea = cfg.smpArea;
                    const ratio   = stdArea > 0 ? smpArea / stdArea : 0;
                    const foundUg = ratio * cfg.stdAmountUg * (cfg.stdPurity / 100);
                    const foundMg = foundUg / 1000;
                    const hasSmpPurity = cfg.smpPurity > 0 && Math.abs(cfg.smpPurity - 100) > 0.01;
                    const purityCalc = ratio * cfg.stdPurity;
                    const dispPurity = hasSmpPurity ? cfg.smpPurity : purityCalc;
                    const purityVsDecl = cfg.smpDeclaredAmountUg > 0 ? (foundUg / cfg.smpDeclaredAmountUg) * 100 : null;
                    const badge = a.inSpec === true ? { bg: "#dcfce7", color: "#166534", txt: "✓ Dentro da faixa ANVISA" }
                      : a.inSpec === false ? { bg: "#fee2e2", color: "#991b1b", txt: "✗ Fora da faixa ANVISA" }
                      : { bg: "#f1f5f9", color: "#64748b", txt: "Sem faixa ANVISA" };

                    return (
                      <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                        {/* Header */}
                        <div style={{ background: "#1e3a5f", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#fff" }}>
                                {a.certTitle || "Certificado de Análise"}
                              </div>
                              {a.compoundName && (
                                <span style={{
                                  fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: 800,
                                  background: "#f97316", color: "#fff",
                                  borderRadius: 4, padding: "1px 8px", letterSpacing: "0.03em",
                                }}>
                                  ⚗ {a.compoundName}
                                </span>
                              )}
                            </div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#94a3b8", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <span>{date}</span>
                              {a.productName && <span style={{ color: "#cbd5e1" }}>· {a.productName}</span>}
                              {a.productLot  && <span style={{ color: "#94a3b8" }}>Lote: {a.productLot}</span>}
                              {a.certNumber  && <span style={{ color: "#7dd3fc" }}>Nº {a.certNumber}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <button onClick={() => restoreDocument(a)} style={{
                              fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                              border: "none", borderRadius: 5, background: "#16a34a", color: "#fff",
                              cursor: "pointer", fontWeight: "bold",
                            }} title="Restaura todo o documento — cromatograma, configurações e dados">🔄 Restaurar Documento</button>
                            <button onClick={() => openSavedPdf(a)} style={{
                              fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                              border: "none", borderRadius: 5, background: "#3b82f6", color: "#fff",
                              cursor: "pointer", fontWeight: "bold",
                            }}>📄 Baixar PDF</button>
                            <button onClick={() => {
                              setMasterAuthDialog({
                                description: `Digite a senha Master para remover permanentemente "${a.certTitle || "Certificado de Análise"}${a.certNumber ? ` Nº ${a.certNumber}` : ""}".`,
                                buttonLabel: "Confirmar exclusão",
                                onSuccess: () => {
                                  const upd = savedAnalyses.filter(x => x.id !== a.id);
                                  setSavedAnalyses(upd);
                                  persistSavedAnalyses(upd);
                                  void archiveAnalysisOnServer(a.id);
                                },
                              });
                              setMasterAuthInput("");
                              setMasterAuthError(null);
                            }} style={{
                              fontFamily: "Courier New, monospace", fontSize: 10, padding: "4px 10px",
                              border: "1px solid #f87171", borderRadius: 5, background: "transparent", color: "#fca5a5",
                              cursor: "pointer",
                            }} title="Remover (requer senha Master)">🗑 Remover</button>
                          </div>
                        </div>
                        {/* Body */}
                        <div style={{ padding: "12px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
                          {/* Identification block */}
                          <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", fontWeight: "bold", marginBottom: 2 }}>IDENTIFICAÇÃO</div>
                            {a.productName && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Produto: </span>{a.productName}</div>}
                            {a.productLot && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Lote: </span>{a.productLot}</div>}
                            {a.compoundName && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Composto: </span>{a.compoundName}</div>}
                            {a.sampleName && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Amostra: </span>{a.sampleName}</div>}
                            {a.operator && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Operador: </span>{a.operator}</div>}
                            {a.injDate && <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Data injeção: </span>{a.injDate}</div>}
                          </div>
                          {/* Results block */}
                          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", fontWeight: "bold", marginBottom: 2 }}>RESULTADOS</div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Teor encontrado: </span>{foundMg.toFixed(4)} mg</div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}><span style={{ color: "#64748b" }}>Pureza calculada: </span>{dispPurity.toFixed(2)} %</div>
                            {purityVsDecl !== null && (
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 10 }}>
                                <span style={{ color: "#64748b" }}>Teor vs. Declarado: </span>
                                <span style={{ color: purityVsDecl >= 80 ? "#166534" : "#991b1b", fontWeight: "bold" }}>{purityVsDecl.toFixed(2)} %</span>
                              </div>
                            )}
                            <div style={{ marginTop: 4 }}>
                              <span style={{ background: badge.bg, color: badge.color, fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4, fontWeight: "bold" }}>
                                {badge.txt}
                              </span>
                            </div>
                          </div>
                          {/* Chromatogram thumbnail */}
                          {a.chromSvgData && (
                            <div style={{ flex: "2 1 260px" }}>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", fontWeight: "bold", marginBottom: 4 }}>CROMATOGRAMA</div>
                              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", background: "#f8fafc", padding: 4 }}>
                                <img
                                  src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(a.chromSvgData)))}`}
                                  alt="Cromatograma"
                                  style={{ width: "100%", maxHeight: 160, objectFit: "contain" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // ── Sessions sub-tab ─────────────────────────────────────────
            if (!session || !sessionFormula) {
              return (
                <div style={{ textAlign: "center", color: "#aaa", padding: "60px 0" }}>
                  <FlaskConical style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>No session selected</div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#bbb" }}>
                    In the left panel, create or select an analysis session.
                  </div>
                </div>
              );
            }

            // Build overlay chromatogram data — visible runs only
            const runTime = sessionFormula.detector.runTime;
            const pts = 2000;
            const visibleRuns = session.runs.filter(r => !r.hidden);
            const allChrom = visibleRuns.map(r => buildChromatogram(r.peaks, runTime, pts, sessionFormula.detector.baselineNoise ?? 1.8, sessionFormula.detector.baselineDrift ?? 1.2, sessionFormula.detector.baselinePulse ?? 0.35, sessionFormula.detector.baselineWander ?? 0, sessionFormula.detector.shotNoise ?? 0, sessionFormula.detector.baselineHump ?? 0, sessionFormula.detector.broadeningFactor ?? 0));
            const overlayData: Record<string, number>[] = allChrom.length > 0
              ? allChrom[0].map((pt, i) => {
                  const row: Record<string, number> = { time: pt.time };
                  visibleRuns.forEach((r, ri) => { row[`r${ri + 1}`] = allChrom[ri][i].signal; });
                  return row;
                })
              : [];

            // Determine chart Y max across visible runs only
            const allSignals = overlayData.flatMap(pt => visibleRuns.map((_, ri) => (pt[`r${ri + 1}`] ?? 0) as number));
            const overlayYMax = Math.ceil((Math.max(10, ...allSignals) * 1.15) / 50) * 50;

            // Per-compound teor results — visible runs only
            const runResults = visibleRuns.map(run => ({
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
                    Formula: {sessionFormula.name} · {session.runs.length} run(s) registered · λ {sessionFormula.detector.sigWavelength} nm
                  </div>
                  {!std && (
                    <div style={{ fontSize: 10, color: "#ea580c", marginTop: 3 }}>
                      ⚠ Standard not defined — configure the standard in the left panel to calculate Assay (%)
                    </div>
                  )}
                  {std && <div style={{ fontSize: 10, color: "#166534", marginTop: 3 }}>✓ Standard saved on {new Date(std.savedAt).toLocaleDateString("en-US")}</div>}
                </div>

                <div style={{ borderTop: "1px solid #ccc", margin: "8px 0 12px" }} />

                {/* Overlay chromatogram */}
                <div style={{ marginBottom: 6, fontSize: 11 }}>mAU</div>

                {session.runs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#aaa", padding: "40px 0", fontSize: 11, border: "1px dashed #ddd", borderRadius: 6 }}>
                    No runs registered. Use the left panel to register runs.
                  </div>
                ) : (
                  <>
                    {/* Color legend — all runs, greyed out if hidden */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                      {session.runs.map(r => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, opacity: r.hidden ? 0.35 : 1 }}>
                          <div style={{ width: 18, height: 2, background: r.hidden ? "#ccc" : r.color, borderRadius: 1 }} />
                          <span style={{ textDecoration: r.hidden ? "line-through" : "none", color: r.hidden ? "#aaa" : undefined }}>
                            {r.label}{r.hidden ? " (hidden)" : ""}
                          </span>
                        </div>
                      ))}
                    </div>

                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={overlayData} margin={{ top: 10, right: 16, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#e2e2e2" />
                        <XAxis dataKey="time" type="number" domain={[0, runTime]}
                          tickFormatter={(v: number) => v.toFixed(1)}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          label={{ value: "min", position: "insideBottomRight", offset: 0, dy: 16, fontFamily: "Courier New, monospace", fontSize: 11 }}
                          axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} />
                        <YAxis domain={[0, overlayYMax]}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          axisLine={{ stroke: "#333" }} tickLine={{ stroke: "#333" }} width={46} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const t = label as number;
                          return (
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, background: "#fff", border: "1px solid #333", padding: "4px 8px", lineHeight: 1.7 }}>
                              <div style={{ marginBottom: 2 }}>{t.toFixed(3)} min</div>
                              {payload.map((p, i) => {
                                const run = visibleRuns[i];
                                // Find nearest peak in this run
                                const nearest = run?.peaks.reduce<{ area: number; dist: number; w: number } | null>((best, pk) => {
                                  const dist = Math.abs(pk.retentionTime - t);
                                  const area = pk.manualArea > 0 ? pk.manualArea : computeArea(pk);
                                  if (!best || dist < best.dist) return { area, dist, w: pk.width ?? 0.5 };
                                  return best;
                                }, null);
                                const showArea = nearest && nearest.dist <= nearest.w * 1.5;
                                return (
                                  <div key={i}>
                                    <span style={{ color: p.color }}>{p.name}: {(p.value as number).toFixed(2)} mAU</span>
                                    {showArea && (
                                      <span style={{ color: "#1560bd", fontWeight: "bold", marginLeft: 6 }}>
                                        [{nearest.area.toFixed(3)} mAU·s]
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }} />
                        {visibleRuns.map((r, ri) => (
                          <Line key={r.id} type="linear" dataKey={`r${ri + 1}`}
                            stroke={r.color} strokeWidth={1} dot={false} isAnimationActive={false}
                            name={r.label} connectNulls />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>

                    {/* Results table */}
                    <div style={{ borderTop: "1px solid #ccc", margin: "14px 0 10px" }} />
                    <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>Results — Assay per Run</div>

                    {compounds.length === 0 ? (
                      <div style={{ fontSize: 10, color: "#aaa" }}>No active compounds defined in this formula.</div>
                    ) : (
                      compounds.map(compound => {
                        const stdEntry = std ? std.entries.find(e => e.compoundId === compound.id) ?? null : null;
                        const summary = compoundSummary.find(cs => cs?.compoundId === compound.id);
                        return (
                          <div key={compound.id} style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4, color: "#1d4ed8" }}>
                              {compound.name} <span style={{ color: "#888", fontWeight: "normal", fontSize: 10 }}>({compound.units}){stdEntry ? ` — Nominal: ${stdEntry.nominalConc} ${compound.units}` : " — no standard"}</span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: 420 }}>
                                <thead>
                                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #333" }}>
                                    <th style={{ padding: "4px 10px", textAlign: "left" }}>Run</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Area (mAU*s)</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Calc. Conc.</th>
                                    <th style={{ padding: "4px 10px", textAlign: "right" }}>Assay (%)</th>
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
                                        <td
                                          style={{ padding: "4px 10px", textAlign: "right", fontWeight: "bold", color: teorOk === null ? "#888" : teorOk ? "#166534" : "#dc2626", cursor: cr?.teorPct !== null && cr?.teorPct !== undefined ? "context-menu" : "default" }}
                                          onContextMenu={cr?.teorPct !== null && cr?.teorPct !== undefined ? (evtCtx) => {
                                            evtCtx.preventDefault();
                                            const stdEntryCtx = std ? std.entries.find(en => en.compoundId === compound.id) ?? null : null;
                                            const areaCtx = cr?.area ?? 0;
                                            const traceInputsCtx: { label: string; value: string; source: string }[] = [
                                              { label: "Peak Area", value: `${areaCtx.toFixed(5)} mAU·s`, source: "Chromatogram run" },
                                            ];
                                            let mCtx: CalcMethod = "response_factor";
                                            let fCtx = "Assay (%) = (Conc / Nominal) × 100";
                                            if (stdEntryCtx && stdEntryCtx.stdArea > 0) {
                                              mCtx = "external_standard";
                                              fCtx = "Conc = (PeakArea / StdArea) × StdConc; Assay (%) = (Conc / Nominal) × 100";
                                              traceInputsCtx.push(
                                                { label: "Std Area", value: `${stdEntryCtx.stdArea.toFixed(5)} mAU·s`, source: "Formula standard" },
                                                { label: "Std Conc", value: `${stdEntryCtx.stdConc.toFixed(4)} ${compound.units}`, source: "Formula standard" },
                                                { label: "Nominal", value: `${stdEntryCtx.nominalConc.toFixed(4)} ${compound.units}`, source: "Formula standard" },
                                              );
                                            } else {
                                              traceInputsCtx.push({ label: "Amt/Area factor", value: String(compound.amtPerArea), source: "Compound config" });
                                            }
                                            traceInputsCtx.push({ label: "Calc. Conc", value: `${(cr?.calcConc ?? 0).toFixed(4)} ${compound.units}`, source: "Calculated" });
                                            setCalcTraceDialog(buildCalcTrace(
                                              `Assay — ${compound.name}`, `${cr!.teorPct!.toFixed(2)} %`,
                                              mCtx, fCtx, traceInputsCtx, "Analysis",
                                              { compoundName: compound.name,
                                                standardRef: stdEntryCtx ? `${stdEntryCtx.compoundName} std` : "response factor",
                                                warningText: teorOk === false ? "⚠ Result outside 80–120% specification" : undefined }
                                            ));
                                          } : undefined}
                                          title={cr?.teorPct !== null && cr?.teorPct !== undefined ? "Right-click: Ver origem do cálculo" : undefined}
                                        >
                                          {cr?.teorPct !== null && cr?.teorPct !== undefined ? `${cr.teorPct.toFixed(2)} %` : "—"}
                                        </td>
                                        <td style={{ padding: "4px 10px", textAlign: "center" }}>
                                          {teorOk === null ? <span style={{ color: "#94a3b8", fontSize: 9 }}>no standard</span>
                                            : teorOk ? <span style={{ color: "#166534", fontSize: 9, fontWeight: "bold" }}>✓ Pass</span>
                                            : <span style={{ color: "#dc2626", fontSize: 9, fontWeight: "bold" }}>✗ Fail</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                {summary && (
                                  <tfoot>
                                    <tr style={{ background: "#f8fafc", borderTop: "2px solid #999" }}>
                                      <td style={{ padding: "4px 10px", fontWeight: "bold" }}>Summary ({session.runs.length} run{session.runs.length !== 1 ? "s" : ""})</td>
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
                  <Users style={{ width: 16, height: 16 }} /> User Management
                </div>
                <div style={{ fontSize: 10, color: "#999", fontFamily: "Courier New, monospace", marginTop: 2 }}>
                  HPLC Simulator access control. All users share login with the Stability Protocol.
                </div>
              </div>
              <Div />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={fetchUsers} disabled={userListLoading}>
                  {userListLoading ? "Loading…" : "↻ Refresh"}
                </Button>
              </div>
              {userListError && (
                <div style={{ color: "#dc2626", fontFamily: "Courier New, monospace", fontSize: 11, marginBottom: 10 }}>{userListError}</div>
              )}
              {toggleError && (
                <div style={{ color: "#dc2626", fontFamily: "Courier New, monospace", fontSize: 11, marginBottom: 10, padding: "6px 10px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4 }}>
                  Error changing access: {toggleError}
                </div>
              )}
              {userList.length === 0 && !userListLoading && !userListError && (
                <div style={{ textAlign: "center", color: "#aaa", padding: "32px 0", fontFamily: "Courier New, monospace", fontSize: 11 }}>
                  Click "Refresh" to load users.
                </div>
              )}
              {userList.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Username</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Name</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Role</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Active</th>
                        <th style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #ddd" }}>HPLC Access</th>
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
                                {u.role === "admin" ? "Admin" : "Analyst"}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, color: u.active ? "#166534" : "#dc2626" }}>
                                {u.active ? "✓ Active" : "✗ Inactive"}
                              </span>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              {isSelf ? (
                                <span style={{ fontSize: 9, color: "#94a3b8", fontStyle: "italic" }}>you</span>
                              ) : (
                                <button
                                  disabled={isToggling}
                                  onClick={() => toggleHplcAccess(u.id, u.hplcAccess)}
                                  title={u.hplcAccess ? "Click to revoke HPLC access" : "Click to grant HPLC access"}
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
                                      <span style={{ fontSize: 9, color: "#16a34a", fontWeight: "bold" }}>Access granted</span>
                                    </>
                                  ) : (
                                    <>
                                      <ToggleLeft style={{ width: 20, height: 20, color: "#dc2626" }} />
                                      <ShieldOff style={{ width: 12, height: 12, color: "#dc2626" }} />
                                      <span style={{ fontSize: 9, color: "#dc2626", fontWeight: "bold" }}>No access</span>
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
                    Click the button in the "HPLC Access" column to grant or revoke a user's access to the simulator.
                    Users without access will see an error message when attempting to sign in.
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
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>No formula selected</div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#bbb" }}>
                    In the left panel, save the current setup as a formula<br />or select an existing formula.
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
                    Created {new Date(formula.createdAt).toLocaleDateString("en-US")} · λ {formula.detector.sigWavelength} nm · {compounds.length} compound{compounds.length !== 1 ? "s" : ""}
                  </div>
                </div>

                <Div />

                {/* Compounds in this formula */}
                <div style={{ marginTop: 10, marginBottom: 14 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, fontWeight: "bold", marginBottom: 4 }}>
                    Compounds monitored in this formula:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {compounds.map(c => (
                      <span key={c.id} style={{
                        fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 7px",
                        border: "1px solid #bfdbfe", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8",
                      }}>
                        {c.name} · RT {c.expectedRT.toFixed(2)} min{c.specMin > 0 && c.specMax > 0 ? ` · spec ${c.specMin}–${c.specMax} ${c.units}` : ""}
                      </span>
                    ))}
                    {compounds.length === 0 && <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#aaa" }}>No compounds defined in this formula.</span>}
                  </div>
                </div>

                {/* Inline lot registration form — up to 3 lots at once */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#1e293b", marginBottom: 10 }}>
                    Register Lots
                    <span style={{ fontWeight: "normal", color: "#94a3b8", marginLeft: 8 }}>Fill up to 3 lots and click Register</span>
                  </div>
                  {/* Header row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
                    <label style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b" }}>Lot Number *</label>
                    <label style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b" }}>Notes</label>
                  </div>
                  {/* 3 lot rows */}
                  {inlineLots.map((lot, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                      <input
                        type="text"
                        placeholder={`Ex: LOT-2025-00${idx + 1}`}
                        value={lot.lotNumber}
                        onChange={e => setInlineLots(prev => prev.map((l, i) => i === idx ? { ...l, lotNumber: e.target.value } : l))}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 11, padding: "5px 9px", border: "1px solid #cbd5e1", borderRadius: 5, width: "100%", boxSizing: "border-box" }}
                      />
                      <input
                        type="text"
                        placeholder="Optional"
                        value={lot.notes}
                        onChange={e => setInlineLots(prev => prev.map((l, i) => i === idx ? { ...l, notes: e.target.value } : l))}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 11, padding: "5px 9px", border: "1px solid #cbd5e1", borderRadius: 5, width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    {(() => {
                      const filledLots = inlineLots.filter(l => l.lotNumber.trim());
                      const hasAny = filledLots.length > 0;
                      return (
                        <button
                          disabled={!hasAny}
                          onClick={() => {
                            filledLots.forEach(l => handleAddLot(l.lotNumber.trim(), l.notes.trim()));
                            setInlineLots([{ lotNumber: "", notes: "" }, { lotNumber: "", notes: "" }, { lotNumber: "", notes: "" }]);
                          }}
                          style={{
                            fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold",
                            padding: "6px 16px", background: hasAny ? "#1d4ed8" : "#94a3b8",
                            color: "#fff", border: "none", borderRadius: 5, cursor: hasAny ? "pointer" : "not-allowed",
                          }}
                        >
                          + Register {filledLots.length > 1 ? `${filledLots.length} Lots` : "Lot"}
                        </button>
                      );
                    })()}
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8" }}>
                      Saves the current chromatogram with configured peaks for each entered lot.
                    </span>
                  </div>
                </div>

                {/* Lots results table */}
                {formulaLots.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#bbb", padding: "24px 0", fontFamily: "Courier New, monospace", fontSize: 11 }}>
                    No lots registered yet. Set up the chromatogram and click "Register Lot".
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Lot</th>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Date</th>
                          <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>Sample</th>
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
                            <td style={{ padding: "5px 8px", color: "#666", whiteSpace: "nowrap" }}>{new Date(lot.createdAt).toLocaleDateString("en-US")}</td>
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

          {/* ── Footer — Agilent ChemStation style ──────────────────────── */}
          <div style={{ marginTop: 20, borderTop: "1px solid #bbb", paddingTop: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: 10, color: "#333" }}>
              <span>{sample.acqInstrument}{"   "}{sample.reportDate || now}{"   "}{sample.acqOperator}</span>
              <span>Page   1 of 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hidden file input for peak file attachment ───────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.csv,.asc,.dat,.d,.report"
        style={{ display: "none" }}
        onChange={handlePeakFileChange}
      />

      {/* ── ChemStation import dialog ────────────────────────────────────────── */}
      {showImportDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "20px 24px",
            width: "100%", maxWidth: 640, boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
            fontFamily: "Courier New, monospace",
          }}>
            <div style={{ fontSize: 14, fontWeight: "bold", color: "#1d4ed8", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardPaste style={{ width: 15, height: 15 }} /> Import ChemStation Text
            </div>
            <p style={{ fontSize: 10, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
              Paste below the text copied from a ChemStation report (Portuguese or English).
              Sample Information, Detector, and Peak fields will be filled in automatically.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"Data file C:\\CHEM32\\1\\DATA\\...\nSample Name: ...\nAcquisition Operator: ..."}
              style={{
                width: "100%", height: 240, fontFamily: "Courier New, monospace",
                fontSize: 10, padding: "8px", border: "1px solid #d1d5db", borderRadius: 4,
                resize: "vertical", outline: "none", lineHeight: 1.45, background: "#f9fafb",
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, marginBottom: 14 }}>
              <input
                type="checkbox"
                id="importReplaces"
                checked={importReplacesPeaks}
                onChange={e => setImportReplacesPeaks(e.target.checked)}
                style={{ accentColor: "#1d4ed8", width: 12, height: 12 }}
              />
              <label htmlFor="importReplaces" style={{ fontSize: 10, color: "#334155", cursor: "pointer" }}>
                Replace existing peaks with peaks from imported text
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowImportDialog(false)}
                style={{
                  padding: "5px 16px", fontSize: 11, border: "1px solid #d1d5db",
                  borderRadius: 4, background: "#fff", cursor: "pointer", color: "#334155",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importText.trim()}
                onClick={() => {
                  const { sample: s, detector: d, newPeaks } = parseChemStationBlock(importText);
                  if (Object.keys(s).length > 0) setSample(prev => ({ ...prev, ...s }));
                  if (Object.keys(d).length > 0) setDetector(prev => ({ ...prev, ...d }));
                  if (newPeaks.length > 0) {
                    if (importReplacesPeaks) setPeaks(newPeaks);
                    else setPeaks(prev => [...prev, ...newPeaks]);
                  }
                  markDirty();
                  setShowImportDialog(false);
                }}
                style={{
                  padding: "5px 16px", fontSize: 11, border: "none",
                  borderRadius: 4, background: importText.trim() ? "#1d4ed8" : "#93c5fd",
                  cursor: importText.trim() ? "pointer" : "not-allowed", color: "#fff", fontWeight: "bold",
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STANDARD — Comparison with Reference Standard (External Standard Method)
          ══════════════════════════════════════════════════════════════════════ */}
      {page === "padrao" && (() => {
        const peakList = peaks.filter(p => p.retentionTime > 0.5);
        const getArea = (p: Peak) => p.manualArea > 0 ? p.manualArea : computeArea(p);

        const stdArea = padraoConfig.stdArea;
        const smpArea = padraoConfig.smpArea;
        const ratio   = stdArea > 0 ? smpArea / stdArea : 0;

        const foundAmountUg   = ratio * padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100);
        const foundAmountMg   = foundAmountUg / 1000;

        // purityCalc: what the external-standard method derives from the area ratio
        const purityCalc      = ratio * padraoConfig.stdPurity;

        // hasSmpPurity: user explicitly entered a non-default purity (anything ≠ 100 is intentional, including overage >100)
        const hasSmpPurity    = padraoConfig.smpPurity > 0 && Math.abs(padraoConfig.smpPurity - 100) > 0.01;

        // displaySmpPurity: show the entered value when the user set it; else the calculated one
        const displaySmpPurity = hasSmpPurity ? padraoConfig.smpPurity : purityCalc;

        // When both smpPurity and declared amount are known, derive found amount directly from purity
        const foundAmountFromPurityUg: number | null =
          hasSmpPurity && padraoConfig.smpDeclaredAmountUg > 0
            ? padraoConfig.smpDeclaredAmountUg * (padraoConfig.smpPurity / 100)
            : null;
        const foundAmountFromPurityMg: number | null =
          foundAmountFromPurityUg !== null ? foundAmountFromPurityUg / 1000 : null;

        const purityVsDecl    = padraoConfig.smpDeclaredAmountUg > 0
          ? (foundAmountUg / padraoConfig.smpDeclaredAmountUg) * 100
          : null;
        const hasData = stdArea > 0 && smpArea > 0 && padraoConfig.stdAmountUg > 0;
        // relativeTeor removido — comparar found com std amount não tem sentido farmacêutico
        // O % correto é purityVsDecl (found vs. declared), exibido somente quando declared > 0

        // All lots matching the selected compound
        const relevantLots = lots.filter(lot =>
          padraoConfig.compoundName
            ? lot.results.some(r =>
                r.compoundName.toLowerCase().includes(padraoConfig.compoundName.toLowerCase()) ||
                padraoConfig.compoundName.toLowerCase().includes(r.compoundName.toLowerCase()))
            : lot.results.length > 0
        );

        // Operator-filtered lots (selectedLotIds empty = show all)
        const displayLots = padraoConfig.selectedLotIds.length > 0
          ? relevantLots.filter(l => padraoConfig.selectedLotIds.includes(l.id))
          : relevantLots;

        const toggleLotSelection = (id: string) => {
          const cur = padraoConfig.selectedLotIds;
          updatePadrao({ selectedLotIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
        };

        // Auto-fill Padrão fields from a single chosen peak
        const doFillFromPeak = (peak: Peak) => {
          const smpA = parseFloat(getArea(peak).toFixed(5));
          // Find the best matching compound: name match takes priority over RT match
          const pn = (peak.name ?? "").toLowerCase().trim();
          const byName = pn
            ? activeCompounds.find(c => {
                const cn = c.name.toLowerCase().trim();
                return pn.includes(cn) || cn.includes(pn);
              }) ?? null
            : null;
          const byRT = activeCompounds.find(c =>
            Math.abs(peak.retentionTime - c.expectedRT) < c.rtTol
          ) ?? null;
          const compound = byName ?? byRT;
          if (compound) {
            const cc = getCC(compound.id);
            const sortedStds = [...cc.standards].sort((a, b) => a.amount - b.amount);
            const midStd = sortedStds[Math.floor(sortedStds.length / 2)] ?? sortedStds[0] ?? null;
            updatePadrao({
              compoundName: compound.name,
              stdPeakName: compound.name,
              stdArea: midStd ? parseFloat(midStd.area.toFixed(5)) : smpA,
              stdAmountUg: midStd
                ? parseFloat(midStd.amount.toFixed(4))
                : parseFloat((compound.amtPerArea * smpA).toFixed(4)),
              stdPurity: compound.certifiedPurity > 0 ? compound.certifiedPurity : 99.5,
              smpPeakName: peak.name || `TR ${peak.retentionTime.toFixed(3)} min`,
              smpArea: smpA,
              smpDeclaredAmountUg: 0,
            });
          } else {
            // No compound match — fill only sample area
            updatePadrao({
              smpPeakName: peak.name || `TR ${peak.retentionTime.toFixed(3)} min`,
              smpArea: smpA,
            });
          }
          toast({
            title: "Auto-fill aplicado",
            description: compound
              ? `Pico "${peak.name || `TR ${peak.retentionTime.toFixed(3)}`}" vinculado ao composto "${compound.name}".`
              : `Área do pico "${peak.name || `TR ${peak.retentionTime.toFixed(3)}`}" copiada (sem composto correspondente).`,
          });
        };

        // Auto-fill Padrão: 1 pico → direto; >1 pico → picker
        const autoFillPadrao = () => {
          if (peakList.length === 0) return;
          if (peakList.length === 1) {
            doFillFromPeak(peakList[0]);
            return;
          }
          // Multiple peaks — open picker dialog
          peakPickerCbRef.current = doFillFromPeak;
          setPeakPickerOpen(true);
        };

        // Print/PDF export for the Resultado section
        const buildPadraoHtml = (): string => {

          // ── Lots table rows ─────────────────────────────────────────────
          const lotsRows = displayLots.map(lot => {
            const r = lot.results.find(res =>
              padraoConfig.compoundName
                ? res.compoundName.toLowerCase().includes(padraoConfig.compoundName.toLowerCase())
                : true
            );
            const statusTxt = r ? (r.inSpec === null ? 'N/A' : r.inSpec ? 'Conforme' : 'Não Conforme') : '—';
            return `<tr><td>${lot.lotNumber}</td><td>${new Date(lot.createdAt).toLocaleDateString('pt-BR')}</td><td>${lot.sample.sampleName || '—'}</td><td style="text-align:right">${r ? r.area.toFixed(3) : '—'}</td><td style="text-align:right">${r ? r.concentration.toFixed(3) : '—'}</td><td style="text-align:center">${statusTxt}</td></tr>`;
          }).join('');

          // ── Mini-chromatogram SVG (two Gaussian peaks) ─────────────────
          const chromSvg = (() => {
            if (stdArea <= 0 && smpArea <= 0) return '';
            const W = 600, H = 150;
            const PAD = { top: 28, right: 20, bottom: 30, left: 48 };
            const plotW = W - PAD.left - PAD.right;
            const plotH = H - PAD.top - PAD.bottom;
            const sigma = 0.09;
            const stdMu = 0.27, smpMu = 0.73;
            const maxA = Math.max(stdArea, smpArea, 1);
            const stdHn = stdArea / maxA;
            const smpHn = smpArea / maxA;
            const gauss = (x: number, mu: number, hn: number) => hn * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
            const N = 250;
            const xs = Array.from({ length: N + 1 }, (_, i) => i / N);
            const toX = (t: number) => PAD.left + t * plotW;
            const toY = (v: number) => PAD.top + plotH - v * plotH * 0.92;
            const baseY = toY(0);
            const buildLine = (mu: number, hn: number) =>
              xs.filter(x => Math.abs(x - mu) < sigma * 4)
                .map(x => `${toX(x).toFixed(1)},${toY(gauss(x, mu, hn)).toFixed(1)}`).join(' ');
            const buildFill = (mu: number, hn: number) => {
              const pts = xs.filter(x => Math.abs(x - mu) < sigma * 3.5);
              if (!pts.length) return '';
              return [`${toX(pts[0]).toFixed(1)},${baseY}`,
                ...pts.map(x => `${toX(x).toFixed(1)},${toY(gauss(x, mu, hn)).toFixed(1)}`),
                `${toX(pts[pts.length - 1]).toFixed(1)},${baseY}`].join(' ');
            };
            const stdLine = buildLine(stdMu, stdHn);
            const smpLine = buildLine(smpMu, smpHn);
            const stdFill = buildFill(stdMu, stdHn);
            const smpFill = buildFill(smpMu, smpHn);
            const stdApexX = toX(stdMu).toFixed(1);
            const stdApexY = (toY(stdHn) - 7).toFixed(1);
            const smpApexX = toX(smpMu).toFixed(1);
            const smpApexY = (toY(smpHn) - 7).toFixed(1);
            const yTicks = [0.25, 0.5, 0.75, 1.0].map(v => {
              const yp = toY(v).toFixed(1);
              const lbl = (v * maxA).toFixed(0);
              return `<line x1="${(PAD.left - 3).toFixed(1)}" y1="${yp}" x2="${(PAD.left + plotW).toFixed(1)}" y2="${yp}" stroke="#1e293b" stroke-width="0.6" stroke-dasharray="4 3"/>
                      <text x="${(PAD.left - 5).toFixed(1)}" y="${(parseFloat(yp) + 3).toFixed(1)}" font-size="7.5" text-anchor="end" fill="#64748b">${lbl}</text>`;
            }).join('');
            return `<div style="margin:14px 0;border:1.5px solid #334155;border-radius:6px;overflow:hidden">
<div style="background:#1e293b;padding:6px 14px;font-family:'Courier New',monospace;font-size:9.5px;color:#94a3b8;letter-spacing:0.06em;display:flex;align-items:center">
  <span>CROMATOGRAMA — visualização proporcional às áreas (Padrão × Amostra)</span>
  <span style="margin-left:auto;font-size:8px;color:#475569">mAU·s</span>
</div>
<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;background:#0f172a" xmlns="http://www.w3.org/2000/svg">
  ${yTicks}
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${baseY.toFixed(1)}" stroke="#334155" stroke-width="1"/>
  <line x1="${PAD.left}" y1="${baseY.toFixed(1)}" x2="${(PAD.left + plotW).toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="#475569" stroke-width="1.2"/>
  ${stdFill ? `<polygon points="${stdFill}" fill="#1560bd" fill-opacity="0.20"/>` : ''}
  ${stdLine ? `<polyline points="${stdLine}" fill="none" stroke="#3b82f6" stroke-width="2"/>` : ''}
  ${smpFill ? `<polygon points="${smpFill}" fill="#f97316" fill-opacity="0.25"/>` : ''}
  ${smpLine ? `<polyline points="${smpLine}" fill="none" stroke="#f97316" stroke-width="2.2"/>` : ''}
  ${stdArea > 0 ? `<text x="${stdApexX}" y="${(parseFloat(stdApexY) - 9).toFixed(1)}" text-anchor="middle" font-size="8" fill="#60a5fa">● Padrão</text>
    <text x="${stdApexX}" y="${stdApexY}" text-anchor="middle" font-size="9" font-weight="bold" fill="#93c5fd">${stdArea.toFixed(3)} mAU·s</text>` : ''}
  ${smpArea > 0 ? `<text x="${smpApexX}" y="${(parseFloat(smpApexY) - 9).toFixed(1)}" text-anchor="middle" font-size="8" fill="#fb923c">● Amostra</text>
    <text x="${smpApexX}" y="${smpApexY}" text-anchor="middle" font-size="9" font-weight="bold" fill="#fdba74">${smpArea.toFixed(3)} mAU·s</text>` : ''}
</svg>
<div style="background:#1e293b;padding:5px 14px;font-family:'Courier New',monospace;font-size:9px;color:#64748b;display:flex;gap:28px">
  <span><span style="color:#3b82f6">●</span> Padrão: ${stdArea.toFixed(5)} mAU·s · ${padraoConfig.stdAmountUg.toFixed(4)} µg · pureza ${padraoConfig.stdPurity.toFixed(2)}%</span>
  <span><span style="color:#f97316">●</span> Amostra: ${smpArea.toFixed(5)} mAU·s · Ratio: ${ratio.toFixed(4)} · encontrado: ${foundAmountUg.toFixed(4)} µg</span>
</div>
</div>`;
          })();

          // ── ChemStation peak table ───────────────────────────────────────
          const peakTableRows = peakStats
            .filter(p => p.printSelected !== false)
            .map(p => {
              const isSmp = isPadraoSamplePeak(p);
              const area = isSmp && padraoConfig.smpArea > 0 ? padraoConfig.smpArea : p.displayArea;
              const matchedPk = peakStats.find(pk => isPadraoSamplePeak(pk));
              const rtVal = isSmp
                ? (padraoSmpRT > 0 ? padraoSmpRT : (matchedPk ? matchedPk.retentionTime : p.retentionTime))
                : p.retentionTime;
              const amt = isSmp ? padraoFoundUg : p.calcAmount;
              const mg = amt / 1000;
              const rowStyle = isSmp ? 'font-weight:bold;color:#c2410c;background:#fff7ed' : '';
              return `<tr style="${rowStyle}">
                <td>${rtVal.toFixed(3)}</td>
                <td>${p.peakType}</td>
                <td style="text-align:right">${area.toFixed(5)}</td>
                <td style="text-align:right">${amt > 0 ? amt.toFixed(4) : '—'}</td>
                <td style="text-align:right">${mg > 0 ? mg.toFixed(6) : '—'}</td>
                <td>${p.name || '—'}${isSmp ? ' <em>[sample]</em>' : ''}</td>
              </tr>`;
            }).join('');

          // ── ANVISA Conformidade ─────────────────────────────────────────
          const anvisaLabelMg = padraoConfig.anvisaLabelAmountMg;
          const anvisaMinMg   = padraoConfig.anvisaMinMg;
          const anvisaMaxMg   = padraoConfig.anvisaMaxMg;
          const anvisaNorm    = padraoConfig.anvisaNorm || 'IN 28/2018';
          const foundMgAnv    = padraoConfig.anvisaFoundMgOverride > 0 ? padraoConfig.anvisaFoundMgOverride : foundAmountMg;
          const pctLabelAnv   = anvisaLabelMg > 0 && foundMgAnv > 0 ? (foundMgAnv / anvisaLabelMg) * 100 : null;
          const inMin         = anvisaMinMg > 0 ? foundMgAnv >= anvisaMinMg : null;
          const inMax         = anvisaMaxMg > 0 ? foundMgAnv <= anvisaMaxMg : null;
          const inRange       = (inMin !== null || inMax !== null) ? (inMin !== false && inMax !== false) : null;
          const hasAnvisa     = foundMgAnv > 0 || anvisaLabelMg > 0 || anvisaMinMg > 0 || anvisaMaxMg > 0;
          const anvisaSection = hasAnvisa ? `
<h2>🇧🇷 Conformidade ANVISA — ${anvisaNorm}</h2>
<table>
  <thead><tr><th>Parâmetro</th><th>Valor</th><th>Status</th></tr></thead>
  <tbody>
    ${anvisaLabelMg > 0 ? `<tr><td>Qtd. declarada no rótulo</td><td>${anvisaLabelMg.toFixed(4)} mg</td><td>—</td></tr>` : ''}
    ${foundMgAnv > 0 ? `<tr><td>Encontrado na análise</td><td><strong>${foundMgAnv.toFixed(4)} mg</strong> (= ${(foundMgAnv * 1000).toFixed(2)} µg)</td><td>—</td></tr>` : ''}
    ${pctLabelAnv !== null ? `<tr><td>% Encontrado na Amostra Analisada</td><td><strong style="color:${pctLabelAnv >= 80 && pctLabelAnv <= 120 ? '#16a34a' : '#dc2626'}">${pctLabelAnv.toFixed(2)}%</strong></td><td style="color:${pctLabelAnv >= 80 && pctLabelAnv <= 120 ? '#16a34a' : '#dc2626'}">${pctLabelAnv >= 80 && pctLabelAnv <= 120 ? '✓ dentro da faixa' : '✗ fora da faixa'}</td></tr>` : ''}
    ${anvisaMinMg > 0 ? `<tr><td>Faixa mín ANVISA</td><td>${anvisaMinMg.toFixed(4)} mg (= ${(anvisaMinMg * 1000).toFixed(2)} µg)</td><td style="color:${inMin ? '#16a34a' : '#dc2626'}">${inMin === null ? '—' : inMin ? '✓ acima do mínimo' : '✗ abaixo do mínimo'}</td></tr>` : ''}
    ${anvisaMaxMg > 0 ? `<tr><td>Faixa máx ANVISA</td><td>${anvisaMaxMg.toFixed(4)} mg (= ${(anvisaMaxMg * 1000).toFixed(2)} µg)</td><td style="color:${inMax ? '#16a34a' : '#dc2626'}">${inMax === null ? '—' : inMax ? '✓ abaixo do máximo' : '✗ acima do máximo'}</td></tr>` : ''}
    ${inRange !== null ? `<tr style="background:${inRange ? '#dcfce7' : '#fef2f2'}"><td colspan="2"><strong>Resultado ANVISA</strong></td><td><strong style="color:${inRange ? '#16a34a' : '#dc2626'}">${inRange ? '✓ CONFORME' : '✗ NÃO CONFORME'}</strong></td></tr>` : ''}
  </tbody>
</table>` : '';

          // ── Visual comparison bar table ──────────────────────────────────
          const visComp = (() => {
            if (stdArea <= 0 || smpArea <= 0) return '';
            const maxA   = Math.max(stdArea, smpArea);
            const sBar   = ((stdArea / maxA) * 100).toFixed(1);
            const mBar   = ((smpArea / maxA) * 100).toFixed(1);
            const rat    = smpArea / stdArea;
            const rC     = rat >= 0.95 ? '#16a34a' : rat >= 0.80 ? '#d97706' : '#dc2626';
            const sym    = rat >= 0.95 ? '✓' : rat >= 0.80 ? '~' : '!';
            const pctF   = displaySmpPurity.toFixed(2);
            const declRow = padraoConfig.smpDeclaredAmountUg > 0
              ? `<span style="margin-left:12px;color:#6366f1">vs. Declarado ${padraoConfig.smpDeclaredAmountUg.toFixed(2)} µg → <strong>${((foundAmountUg / padraoConfig.smpDeclaredAmountUg) * 100).toFixed(1)}%</strong></span>` : '';
            return `<div style="margin:14px 0 10px;border:1.5px solid #334155;border-radius:6px;overflow:hidden;font-family:'Courier New',monospace">
<div style="background:#1e293b;padding:7px 14px;display:flex;align-items:center;gap:8px">
  <span style="font-size:11px;font-weight:bold;color:#e2e8f0;letter-spacing:0.04em">📊 COMPARAÇÃO — Padrão × Amostra</span>
  <span style="margin-left:auto;font-size:10px;font-weight:bold;color:${rC};background:#0f172a;border:1px solid ${rC};border-radius:10px;padding:1px 10px">Ratio ${rat.toFixed(4)}</span>
</div>
<table style="width:100%;border-collapse:collapse;font-size:10px">
<tr>
<td style="width:42%;padding:10px 12px;border-right:1px solid #e2e8f0;border-bottom:none;vertical-align:top;background:#f8fafc">
  <div style="font-size:9px;font-weight:bold;color:#1560bd;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px">● Reference Standard</div>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Peak: </span><strong>${padraoConfig.stdPeakName || '—'}</strong></p>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Área: </span><strong style="color:#1560bd">${stdArea.toFixed(5)} mAU·s</strong></p>
  <div style="height:7px;background:#e2e8f0;border-radius:4px;margin:5px 0;overflow:hidden"><div style="height:100%;width:${sBar}%;background:#1560bd;border-radius:4px"></div></div>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Qtd. injetada: </span><strong>${padraoConfig.stdAmountUg.toFixed(4)} µg</strong></p>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Pureza: </span><strong>${padraoConfig.stdPurity.toFixed(2)} %</strong></p>
</td>
<td style="width:16%;padding:10px 4px;border-right:1px solid #e2e8f0;border-bottom:none;text-align:center;vertical-align:middle;background:#fff">
  <div style="font-size:16px;font-weight:900;color:${rC}">${pctF}%</div>
  <div style="font-size:8px;color:#94a3b8;margin-top:2px;line-height:1.3">Pureza<br>calc. (%)</div>
  <div style="width:26px;height:26px;border-radius:50%;border:3px solid ${rC};margin:6px auto;text-align:center;line-height:20px">
    <span style="font-size:13px;color:${rC}">${sym}</span>
  </div>
</td>
<td style="width:42%;padding:10px 12px;border-bottom:none;vertical-align:top;background:#f8fafc">
  <div style="font-size:9px;font-weight:bold;color:#ea580c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px">● Amostra Analisada</div>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Peak: </span><strong>${padraoConfig.smpPeakName || '—'}</strong></p>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Área: </span><strong style="color:#ea580c">${smpArea.toFixed(5)} mAU·s</strong></p>
  <div style="height:7px;background:#e2e8f0;border-radius:4px;margin:5px 0;overflow:hidden"><div style="height:100%;width:${mBar}%;background:#f97316;border-radius:4px"></div></div>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Encontrado: </span><strong style="color:#ea580c">${foundAmountUg.toFixed(4)} µg (${foundAmountMg.toFixed(6)} mg)</strong></p>
  <p style="margin:2px 0;font-size:10px"><span style="color:#94a3b8">Pureza: </span><strong style="color:${rC}">${pctF} %</strong></p>
</td>
</tr>
</table>
<div style="padding:5px 14px;background:#f1f5f9;font-size:9px;color:#64748b;border-top:1px solid #e2e8f0">
  Amount = (${smpArea.toFixed(5)} ÷ ${stdArea.toFixed(5)}) × ${padraoConfig.stdAmountUg.toFixed(4)} µg × (${padraoConfig.stdPurity.toFixed(2)} ÷ 100) = <strong style="color:#ea580c">${foundAmountUg.toFixed(4)} µg</strong>${declRow}
</div>
</div>`;
          })();

          const certTitleStr  = padraoConfig.certTitle || 'Certificado de Análise';
          const productNameStr = padraoConfig.productName || '—';
          const productLotStr  = padraoConfig.productLot  || '—';

          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${certTitleStr} — ${productNameStr}</title><style>
body{font-family:'Courier New',monospace;font-size:11px;padding:24px;color:#111}
h1{font-size:15px;border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px;color:#1e3a5f}
h2{font-size:12px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:6px}
p{margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:6px}
th,td{padding:5px 9px;border:1px solid #d1d5db;font-size:10px}
th{background:#f1f5f9;font-weight:700}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.card{border:1.5px solid #e2e8f0;border-radius:6px;padding:8px 12px;min-width:110px}
.big{font-size:19px;font-weight:bold}.lbl{font-size:9px;color:#64748b;margin-top:1px}
.ok{color:#16a34a}.warn{color:#d97706}.bad{color:#dc2626}
footer{font-size:9px;color:#999;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:6px}
.id-block{border:2px solid #1e3a5f;border-radius:8px;padding:14px 20px;margin-bottom:16px;background:#f8fafc}
.id-block table{margin-top:0}
.id-block th{background:#1e3a5f;color:#fff;font-size:11px;text-align:left;padding:6px 12px}
.id-block td{font-size:11px;padding:6px 12px;border-color:#cbd5e1}
.id-block .section-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px}
.id-block .section-value{font-size:13px;font-weight:bold;color:#1e293b}
@media print{@page{margin:8mm 10mm}}</style></head>
<body>
<div style="text-align:center;margin-bottom:4px">
  <div style="font-size:9px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase">Alphafitus — Controle de Qualidade</div>
</div>

<div class="id-block">
  <table>
    <thead><tr><th colspan="2">${certTitleStr}</th></tr></thead>
    <tbody>
      <tr>
        <td style="width:35%;font-weight:600;color:#475569" class="section-label">1. Identificação do Produto</td>
        <td><span class="section-value">${productNameStr}</span></td>
      </tr>
      <tr>
        <td style="font-weight:600;color:#475569" class="section-label">2. Lote</td>
        <td><span class="section-value">${productLotStr}</span></td>
      </tr>
      <tr>
        <td style="font-weight:600;color:#475569" class="section-label">3. Certificado de Análise</td>
        <td><span class="section-value">${certTitleStr}</span></td>
      </tr>
      <tr>
        <td style="font-weight:600;color:#475569" class="section-label">4. Nome do Produto (Composto Ativo)</td>
        <td><span class="section-value">${padraoConfig.compoundName || '—'}</span></td>
      </tr>
      <tr>
        <td style="font-weight:600;color:#1560bd" class="section-label">5. Data da Análise (Injection Date)</td>
        <td><span class="section-value" style="color:#1560bd">${sample.injectionDate || '—'}</span></td>
      </tr>
    </tbody>
  </table>
</div>

<p><strong>Método:</strong> External Standard (single point) &nbsp;&nbsp; <strong>Amostra:</strong> ${sample.sampleName || '—'}</p>
<p><strong>Operador:</strong> ${sample.acqOperator || '—'} &nbsp;&nbsp; <strong>Data:</strong> ${sample.injectionDate || new Date().toLocaleDateString('pt-BR')} &nbsp;&nbsp; <strong>Vol. injeção:</strong> ${sample.injVolume || '—'}</p>

${chromSvg}

${hasData ? `
<h2>Resultados</h2>
<div class="cards">
  <div class="card"><div class="big ${displaySmpPurity >= 98 ? 'ok' : displaySmpPurity >= 90 ? 'warn' : 'bad'}">${displaySmpPurity.toFixed(2)}%</div><div class="lbl">${hasSmpPurity ? 'Pureza (digitada)' : 'Pureza vs. Padrão (área)'}</div></div>
  ${pctLabelAnv !== null ? `<div class="card"><div class="big ${pctLabelAnv >= 80 && pctLabelAnv <= 120 ? 'ok' : 'bad'}">${pctLabelAnv.toFixed(2)}%</div><div class="lbl">% Encontrado na Amostra Analisada</div></div>` : ''}
  <div class="card"><div class="big">${foundAmountUg.toFixed(4)} µg</div><div class="lbl">Encontrado (método std)</div></div>
  <div class="card"><div class="big">${foundAmountMg.toFixed(6)} mg</div><div class="lbl">Encontrado (mg)</div></div>
  ${foundAmountFromPurityUg !== null ? `<div class="card"><div class="big">${foundAmountFromPurityUg.toFixed(4)} µg</div><div class="lbl">Encontrado — base pureza</div></div>` : ''}
</div>

${visComp}

<h2>Tabela de Picos — Integration Report</h2>
<p style="font-size:9px;color:#64748b;margin-bottom:4px">RetTime [min] | Tipo | Área [mAU·s] | Encontrado [µg] | Encontrado [mg] | Nome</p>
<table>
  <thead><tr><th>RetTime</th><th>Tipo</th><th>Área (mAU·s)</th><th>Encontrado (µg)</th><th>Encontrado (mg)</th><th>Nome</th></tr></thead>
  <tbody>
    <tr style="color:#1560bd;background:#eff6ff">
      <td>${padraoConfig.stdPeakName.match(/\d+\.\d+/)?.[0] ?? '—'}</td>
      <td>STD</td>
      <td style="text-align:right">${padraoConfig.stdArea.toFixed(5)}</td>
      <td style="text-align:right">${padraoConfig.stdAmountUg.toFixed(4)}</td>
      <td style="text-align:right">${(padraoConfig.stdAmountUg / 1000).toFixed(6)}</td>
      <td>${padraoConfig.compoundName || '—'} <em>[standard]</em></td>
    </tr>
    ${peakTableRows}
  </tbody>
</table>

<h2>Parâmetros Calculados</h2>
<table>
  <thead><tr><th>Parâmetro</th><th>Padrão</th><th>Amostra</th><th>Ratio</th></tr></thead>
  <tbody>
    <tr><td>Composto</td><td>${padraoConfig.compoundName || '—'}</td><td>${padraoConfig.smpPeakName || '—'}</td><td></td></tr>
    <tr><td>Área (mAU·s)</td><td>${stdArea.toFixed(5)}</td><td>${smpArea.toFixed(5)}</td><td>${ratio.toFixed(6)}</td></tr>
    <tr><td>Quantidade injetada (µg)</td><td>${padraoConfig.stdAmountUg.toFixed(4)}</td><td>${foundAmountUg.toFixed(4)}</td><td></td></tr>
    <tr><td>Pureza certificada padrão (%)</td><td>${padraoConfig.stdPurity.toFixed(2)}</td><td>—</td><td></td></tr>
    <tr><td>Pureza calculada amostra (%)</td><td>—</td><td>${displaySmpPurity.toFixed(2)}</td><td></td></tr>
    ${purityVsDecl !== null && padraoConfig.smpDeclaredAmountUg < foundAmountUg * 100 ? `<tr><td>% vs. declarado (µg)</td><td>100.00</td><td>${purityVsDecl.toFixed(2)}</td><td></td></tr>` : ''}
    <tr><td>Encontrado (µg)</td><td>${(padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100)).toFixed(4)}</td><td>${foundAmountUg.toFixed(4)}</td><td></td></tr>
    <tr><td>Encontrado (mg)</td><td>${(padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100) / 1000).toFixed(6)}</td><td>${foundAmountMg.toFixed(6)}</td><td></td></tr>
    ${foundAmountFromPurityUg !== null ? `<tr><td>Encontrado — pureza (µg)</td><td>${(padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100)).toFixed(4)}</td><td>${foundAmountFromPurityUg.toFixed(4)}</td><td></td></tr><tr><td>Encontrado — pureza (mg)</td><td>${(padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100) / 1000).toFixed(6)}</td><td>${foundAmountFromPurityMg!.toFixed(6)}</td><td></td></tr>` : ''}
  </tbody>
</table>
<p style="font-size:9px;color:#64748b;margin-top:6px">Fórmula: Quantidade (µg) = (Área Amostra ÷ Área Padrão) × Quantidade Padrão (µg) × (Pureza Padrão ÷ 100)${hasSmpPurity ? ' | ★ Pureza digitada pelo operador' : ''}${foundAmountFromPurityUg !== null ? ' | Encontrado (pureza) = Declarado × (Pureza/100)' : ''}</p>
` : '<p style="color:#999;margin-top:10px">Dados insuficientes para calcular o resultado.</p>'}

${anvisaSection}

${relevantLots.length > 0 ? `<h2>Lotes Analisados</h2>
<table><thead><tr><th>Lote</th><th>Data</th><th>Amostra</th><th>Área (mAU·s)</th><th>Conc. (µg/ml)</th><th>Conformidade</th></tr></thead><tbody>${lotsRows}</tbody></table>` : ''}

<footer>📅 Data da Análise: <strong>${sample.injectionDate || '—'}</strong> &nbsp;|&nbsp; Amostra: ${sample.sampleName || '—'} &nbsp;|&nbsp; Operador: ${sample.acqOperator || '—'}</footer>
</body></html>`;
          return html;
        };
        const handlePrintPadrao = () => {
          const w = window.open('', '_blank', 'width=960,height=900');
          if (!w) return;
          w.document.write(buildPadraoHtml());
          w.document.close();
          setTimeout(() => w.print(), 500);
        };

        const ROW: React.CSSProperties = { display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 12px", alignItems: "center", marginBottom: 6 };
        const LBL: React.CSSProperties = { fontFamily: "Courier New, monospace", fontSize: 11, color: "#64748b", textAlign: "right" };
        const VAL: React.CSSProperties = { fontFamily: "Courier New, monospace", fontSize: 11, color: "#0f172a" };
        const INP: React.CSSProperties = {
          fontFamily: "Courier New, monospace", fontSize: 11, padding: "3px 7px",
          border: "1px solid #cbd5e1", borderRadius: 4, width: "100%", boxSizing: "border-box", background: "#fff",
        };
        const CARD: React.CSSProperties = {
          background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: "14px 18px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        };

        const numInput = (
          value: number,
          onChange: (v: number) => void,
          opts?: { step?: string; placeholder?: string; min?: number; disabled?: boolean }
        ) => (
          <input
            type="number"
            step={opts?.step ?? "any"}
            min={opts?.min ?? 0}
            placeholder={opts?.placeholder}
            value={value === 0 ? "" : value}
            disabled={opts?.disabled}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            style={{ ...INP, ...(opts?.disabled ? { opacity: 0.6, cursor: "not-allowed", background: "#f1f5f9" } : {}) }}
          />
        );

        const PeakCapture = ({ label, onCapture }: { label: string; onCapture: (p: Peak) => void }) => (
          peakList.length === 0 ? null : (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
                Capture area from chromatogram:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {peakList.map(p => {
                  const _effArea = isPadraoSamplePeak(p) && padraoConfig.smpArea > 0
                    ? padraoConfig.smpArea
                    : getArea(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onCapture(p)}
                      style={{
                        fontFamily: "Courier New, monospace", fontSize: 10, padding: "2px 8px",
                        border: "1px solid #93c5fd", borderRadius: 3, background: "#eff6ff",
                        cursor: "pointer", color: "#1d4ed8",
                      }}
                    >
                      {p.name || `RT ${p.retentionTime.toFixed(3)}`} — {_effArea.toFixed(2)} mAU·s
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, fontFamily: "Courier New, monospace" }}>
                {label}
              </div>
            </div>
          )
        );

        const scrollToField = (id: string) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("padrao-field-flash");
          void el.offsetWidth;
          el.classList.add("padrao-field-flash");
          el.addEventListener("animationend", () => el.classList.remove("padrao-field-flash"), { once: true });
        };

        const ResultCell = ({ value, label, color, big, trace, fieldId }: { value: string; label: string; color?: string; big?: boolean; trace?: CalcTrace; fieldId?: string }) => (
          <div
            style={{
              background: "#fff", borderRadius: 6, padding: "10px 14px",
              border: `2px solid ${color ?? "#e2e8f0"}`, minWidth: 140,
              cursor: fieldId ? "pointer" : trace ? "context-menu" : "default",
              transition: "box-shadow 0.15s",
            }}
            onClick={fieldId ? () => scrollToField(fieldId) : undefined}
            onContextMenu={trace ? (e) => { e.preventDefault(); setCalcTraceDialog(trace); } : undefined}
            title={fieldId ? "Clique para ir ao campo de entrada" : trace ? "Right-click: Ver origem do cálculo" : undefined}
          >
            <div style={{ fontFamily: "Courier New, monospace", fontSize: big ? 22 : 18, fontWeight: "bold", color: color ?? "#1e293b" }}>
              {value}{trace && <span style={{ fontSize: 9, color: "#94a3b8", marginLeft: 5, fontWeight: "normal" }}>⎇</span>}
              {fieldId && <span style={{ fontSize: 9, color: "#94a3b8", marginLeft: 5, fontWeight: "normal" }}>↑</span>}
            </div>
            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginTop: 2 }}>
              {label}
            </div>
          </div>
        );

        return (
          <div className="max-w-[1160px] mx-auto" style={{ padding: "0 4px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Scale style={{ width: 18, height: 18, color: "#1560bd" }} />
              <span style={{ fontFamily: "Courier New, monospace", fontSize: 14, fontWeight: "bold", color: "#1e293b" }}>
                Comparison with Reference Standard
              </span>
              <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>
                External Standard Method (single-point)
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handlePrintPadrao}
                disabled={validatePadrao(padraoConfig).some(a => a.severity === "error")}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, padding: "3px 10px", border: "1px solid #3b82f6", borderRadius: 4, background: "#eff6ff", cursor: validatePadrao(padraoConfig).some(a => a.severity === "error") ? "not-allowed" : "pointer", color: "#1d4ed8", fontWeight: "bold", opacity: validatePadrao(padraoConfig).some(a => a.severity === "error") ? 0.5 : 1 }}
                title={validatePadrao(padraoConfig).some(a => a.severity === "error") ? "Fix errors before exporting" : "Export PDF"}
              >
                📄 Exportar PDF
              </button>
              {padraoChangelog.length > 0 && (
                <button
                  onClick={() => setPadraoHistoryOpen(v => !v)}
                  style={{ fontFamily: "Courier New, monospace", fontSize: 10, padding: "3px 10px", border: "1px solid #f59e0b", borderRadius: 4, background: padraoHistoryOpen ? "#fef3c7" : "#fffbeb", cursor: "pointer", color: "#92400e", fontWeight: "bold" }}
                  title="Ver histórico de alterações do Padrão"
                >
                  📋 Histórico ({padraoChangelog.length})
                </button>
              )}
              <button
                onClick={() => updatePadrao({ ...DEFAULT_PADRAO_CONFIG })}
                style={{ fontFamily: "Courier New, monospace", fontSize: 10, padding: "3px 10px", border: "1px solid #e2e8f0", borderRadius: 4, background: "#f8fafc", cursor: "pointer", color: "#64748b" }}
              >
                Clear
              </button>
            </div>

            {/* ── Identificação do Documento ── */}
            <div style={{ ...CARD, marginBottom: 14, borderLeft: "4px solid #1e3a5f" }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#1e3a5f", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                📋 Identificação do Documento
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", marginLeft: 4 }}>
                  — aparece no PDF
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px 14px" }}>
                {/* 1 — Identificação do Produto */}
                <div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
                    <strong style={{ color: "#1e3a5f" }}>1.</strong> Nome do Produto
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: Suplemento Vitamina D3 1000UI"
                    value={padraoConfig.productName}
                    onChange={e => updatePadrao({ productName: e.target.value })}
                    style={INP}
                  />
                </div>
                {/* 2 — Lote */}
                <div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
                    <strong style={{ color: "#1e3a5f" }}>2.</strong> Lote do Produto
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: LOT-2025-001"
                    value={padraoConfig.productLot}
                    onChange={e => updatePadrao({ productLot: e.target.value })}
                    style={INP}
                  />
                </div>
                {/* 3 — Número do Certificado */}
                <div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
                    <strong style={{ color: "#1e3a5f" }}>3.</strong> Nº do Certificado
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: CA-2025-001"
                    value={padraoConfig.certNumber ?? ""}
                    onChange={e => updatePadrao({ certNumber: e.target.value })}
                    style={INP}
                  />
                </div>
                {/* 4 — Título do Certificado */}
                <div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
                    <strong style={{ color: "#1e3a5f" }}>4.</strong> Título do Certificado
                  </div>
                  <input
                    type="text"
                    placeholder="Certificado de Análise"
                    value={padraoConfig.certTitle}
                    onChange={e => updatePadrao({ certTitle: e.target.value })}
                    style={INP}
                  />
                </div>
              </div>
              {/* 4 — Nome do produto (composto ativo) — leitura do campo compoundName */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f8fafc", borderRadius: 5, border: "1px solid #e2e8f0" }}>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b" }}>
                  <strong style={{ color: "#1e3a5f" }}>4.</strong> Nome do Produto (Composto Ativo):
                </span>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: padraoConfig.compoundName ? "#1e293b" : "#94a3b8" }}>
                  {padraoConfig.compoundName || "— preencha o campo Compound abaixo —"}
                </span>
              </div>
              {/* 5 — Data da Análise — lida automaticamente do Injection Date */}
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#eff6ff", borderRadius: 5, border: "1px solid #bfdbfe" }}>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1d4ed8" }}>
                  <strong style={{ color: "#1e3a5f" }}>5.</strong> Data da Análise (Injection Date):
                </span>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: sample.injectionDate ? "#1560bd" : "#94a3b8" }}>
                  {sample.injectionDate || "— preencha o Injection Date na aba do cromatograma —"}
                </span>
              </div>
              {/* Botão Salvar */}
              <div style={{ marginTop: 12 }}>
                {/* Helper: executa o save e retorna o record */}
                {(() => {
                  // lotChanged is computed at IIFE scope so both doSave() and the UI can use it
                  const lotChanged =
                    editingSavedId !== null &&
                    editingOriginalLotRef.current !== null &&
                    padraoConfig.productLot.trim() !== editingOriginalLotRef.current.trim();

                  const doSave = () => {
                    const svgEl = document.getElementById("padrao-chrom-svg-live");
                    const chromSvgData = svgEl ? new XMLSerializer().serializeToString(svgEl) : "";
                    const _foundMgAnv = padraoConfig.anvisaFoundMgOverride > 0 ? padraoConfig.anvisaFoundMgOverride : foundAmountMg;
                    const _inMin = padraoConfig.anvisaMinMg > 0 ? _foundMgAnv >= padraoConfig.anvisaMinMg : null;
                    const _inMax = padraoConfig.anvisaMaxMg > 0 ? _foundMgAnv <= padraoConfig.anvisaMaxMg : null;
                    const _inSpec: boolean | null = (_inMin !== null || _inMax !== null) ? (_inMin !== false && _inMax !== false) : null;
                    let _htmlContent = "";
                    try { _htmlContent = buildPadraoHtml(); } catch { /* salva sem HTML */ }
                    // "Save as new" OR lot changed → create a new record
                    const effectiveEditId = (lotChanged || preSaveSaveMode === "new") ? null : editingSavedId;
                    const baseId = effectiveEditId ?? (Date.now().toString(36) + Math.random().toString(36).slice(2));
                    const originalRecord = effectiveEditId ? savedAnalyses.find(x => x.id === effectiveEditId) : undefined;
                    const record: SavedAnalysis = {
                      id: baseId,
                      savedAt: new Date().toISOString(),
                      // preserve original createdAt if updating
                      ...(originalRecord ? { createdAt: (originalRecord as SavedAnalysis & { createdAt?: string }).createdAt } : {}),
                      certTitle: padraoConfig.certTitle || "Certificado de Análise",
                      certNumber: padraoConfig.certNumber || "",
                      productName: padraoConfig.productName || "",
                      productLot: padraoConfig.productLot || "",
                      compoundName: padraoConfig.compoundName || "",
                      foundAmountMg,
                      purity: displaySmpPurity,
                      inSpec: _inSpec,
                      sampleName: sample.sampleName || "",
                      operator: sample.acqOperator || "",
                      injDate: sample.injectionDate || "",
                      chromSvgData,
                      config: { ...padraoConfig },
                      htmlContent: _htmlContent,
                      peaks: [...peaks],
                      sample: { ...sample },
                      detector: { ...detector },
                      standards: [...standards],
                      calib: { ...calib },
                      activeCompounds: [...activeCompounds],
                    };
                    let updated: SavedAnalysis[];
                    if (effectiveEditId) {
                      // Update in place — replace the existing record, keep its position
                      updated = savedAnalyses.map(x => x.id === effectiveEditId ? record : x);
                    } else {
                      // New document (or lot changed) — prepend
                      updated = [record, ...savedAnalyses];
                    }
                    // If lot changed, the new record becomes the "editing" context
                    if (lotChanged) {
                      setEditingSavedId(record.id);
                      editingOriginalLotRef.current = padraoConfig.productLot.trim();
                    }
                    setSavedAnalyses(updated);
                    persistSavedAnalyses(updated);
                    return record;
                  };

                  if (showPreSaveDialog) {
                    const statusOpts: { val: "em_andamento" | "aprovado" | "reprovado"; label: string; color: string; bg: string }[] = [
                      { val: "em_andamento", label: "Em Andamento", color: "#1d4ed8", bg: "#dbeafe" },
                      { val: "aprovado",     label: "Aprovado",     color: "#16a34a", bg: "#dcfce7" },
                      { val: "reprovado",    label: "Reprovado",    color: "#dc2626", bg: "#fee2e2" },
                    ];
                    return (
                      <div style={{ border: "1.5px solid #1e3a5f", borderRadius: 8, padding: "14px 16px", background: "#f0f4ff" }}>
                        {/* Título e doc info */}
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#1e3a5f", marginBottom: 4 }}>
                          💾 Deseja salvar o documento?
                        </div>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#475569", marginBottom: 12 }}>
                          {padraoConfig.productName && <span><b>{padraoConfig.productName}</b></span>}
                          {padraoConfig.productLot && <span> · Lote: <b>{padraoConfig.productLot}</b></span>}
                          {padraoConfig.certNumber && <span> · Nº: <b>{padraoConfig.certNumber}</b></span>}
                        </div>

                        {/* Seletor de Analysis Session (opcional) */}
                        {analysisSessions.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 4, fontWeight: "bold" }}>
                              Vincular a uma Analysis Session <span style={{ fontWeight: "normal", color: "#94a3b8" }}>(opcional)</span>
                            </div>
                            <select
                              value={preSaveSessionId}
                              onChange={e => setPreSaveSessionId(e.target.value)}
                              style={{
                                width: "100%", fontFamily: "Courier New, monospace", fontSize: 10,
                                padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 5,
                                background: "#fff", color: "#1e293b", boxSizing: "border-box",
                              }}
                            >
                              <option value="">— Nenhuma (salvar apenas o documento) —</option>
                              {analysisSessions.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name}{s.status === "aprovado" ? " ✓" : s.status === "reprovado" ? " ✗" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Status da sessão — só aparece se uma sessão foi selecionada */}
                        {preSaveSessionId && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: "bold" }}>
                              Atualizar status da sessão para:
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {statusOpts.map(({ val, label, color, bg }) => (
                                <button
                                  key={val}
                                  onClick={() => setPreSaveSessionStatus(val)}
                                  style={{
                                    fontFamily: "Courier New, monospace", fontSize: 10, padding: "4px 12px",
                                    border: `2px solid ${preSaveSessionStatus === val ? color : color + "44"}`,
                                    borderRadius: 5, background: preSaveSessionStatus === val ? bg : "#fff",
                                    color: preSaveSessionStatus === val ? color : "#64748b",
                                    cursor: "pointer", fontWeight: preSaveSessionStatus === val ? "bold" : "normal",
                                    transition: "all 0.1s",
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Seletor de modo quando documento foi restaurado do Analysis ── */}
                        {editingSavedId && !lotChanged && (
                          <div style={{ background: "#f0f4ff", border: "1.5px solid #1e3a5f", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1e3a5f", fontWeight: "bold", marginBottom: 6 }}>
                              📋 Documento restaurado do Analysis — como deseja salvar?
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => { setPreSaveSaveMode("update"); setPreSaveDupWarning(null); }}
                                style={{
                                  fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 12px",
                                  border: `2px solid ${preSaveSaveMode === "update" ? "#1560bd" : "#1560bd44"}`,
                                  borderRadius: 5,
                                  background: preSaveSaveMode === "update" ? "#dbeafe" : "#fff",
                                  color: preSaveSaveMode === "update" ? "#1e3a5f" : "#64748b",
                                  cursor: "pointer", fontWeight: preSaveSaveMode === "update" ? "bold" : "normal",
                                }}
                              >
                                ✏ Salvar alteração no documento existente
                              </button>
                              <button
                                onClick={() => { setPreSaveSaveMode("new"); setPreSaveDupWarning(null); }}
                                style={{
                                  fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 12px",
                                  border: `2px solid ${preSaveSaveMode === "new" ? "#7c3aed" : "#7c3aed44"}`,
                                  borderRadius: 5,
                                  background: preSaveSaveMode === "new" ? "#ede9fe" : "#fff",
                                  color: preSaveSaveMode === "new" ? "#4c1d95" : "#64748b",
                                  cursor: "pointer", fontWeight: preSaveSaveMode === "new" ? "bold" : "normal",
                                }}
                              >
                                📄 Salvar como novo documento
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Aviso de Nº Certificado duplicado */}
                        {preSaveDupWarning && (
                          <div style={{ background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#92400e", fontWeight: "bold", marginBottom: 4 }}>
                              ⚠ Nº do Certificado já existe
                            </div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#78350f", marginBottom: 8, lineHeight: 1.5 }}>
                              O Nº <b>{padraoConfig.certNumber}</b> já está em uso por:<br />
                              <b>{preSaveDupWarning}</b><br />
                              {preSaveSaveMode === "new"
                                ? "Para salvar como novo, altere o Nº do Certificado ou confirme abaixo."
                                : "Deseja salvar mesmo assim? O registro ficará duplicado."}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => {
                                  doSave();
                                  if (preSaveSessionId) handleConcludeSession(preSaveSessionId, preSaveSessionStatus);
                                  setShowPreSaveDialog(false);
                                  setSaveConfirmId(null);
                                  setPreSaveSessionId("");
                                  setEditingSavedId(null);
                                  setPreSaveDupWarning(null);
                                  setPreSaveSaveMode(null);
                                  setAnaliseSubTab("pdfs");
                                  setPage("analise");
                                }}
                                style={{ fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px", border: "1.5px solid #f59e0b", borderRadius: 5, background: "#f59e0b", color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                              >
                                Salvar mesmo assim
                              </button>
                              <button
                                onClick={() => setPreSaveDupWarning(null)}
                                style={{ fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 12px", border: "1.5px solid #94a3b8", borderRadius: 5, background: "#fff", color: "#475569", cursor: "pointer" }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Ações */}
                        {!preSaveDupWarning && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            disabled={!!(editingSavedId && !lotChanged && preSaveSaveMode === null)}
                            onClick={() => {
                              // Dup check: when saving as NEW, don't skip the current record
                              // (so it detects certNumber conflict with the original doc too)
                              const num = padraoConfig.certNumber?.trim();
                              if (num) {
                                const skipId = preSaveSaveMode === "new" ? null : editingSavedId;
                                const dup = savedAnalyses.find(x =>
                                  x.id !== skipId &&
                                  x.certNumber?.trim() === num
                                );
                                if (dup) {
                                  setPreSaveDupWarning(dup.certTitle || dup.productName || `Registro ${dup.id}`);
                                  return;
                                }
                              }
                              doSave();
                              if (preSaveSessionId) {
                                handleConcludeSession(preSaveSessionId, preSaveSessionStatus);
                              }
                              setShowPreSaveDialog(false);
                              setSaveConfirmId(null);
                              setPreSaveSessionId("");
                              setEditingSavedId(null);
                              setPreSaveDupWarning(null);
                              setPreSaveSaveMode(null);
                              setAnaliseSubTab("pdfs");
                              setPage("analise");
                            }}
                            style={{
                              fontFamily: "Courier New, monospace", fontSize: 11, padding: "6px 20px",
                              border: "2px solid #16a34a", borderRadius: 5,
                              background: (editingSavedId && !lotChanged && preSaveSaveMode === null) ? "#d1fae5" : "#16a34a",
                              cursor: (editingSavedId && !lotChanged && preSaveSaveMode === null) ? "not-allowed" : "pointer",
                              color: (editingSavedId && !lotChanged && preSaveSaveMode === null) ? "#6ee7b7" : "#fff",
                              fontWeight: "bold",
                            }}
                          >
                            💾 Salvar
                          </button>
                          {editingSavedId && !lotChanged && preSaveSaveMode === null && (
                            <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8" }}>
                              ← escolha como salvar acima
                            </span>
                          )}
                          <button
                            onClick={() => { setShowPreSaveDialog(false); setPreSaveSessionId(""); setEditingSavedId(null); setPreSaveDupWarning(null); setPreSaveSaveMode(null); }}
                            style={{
                              fontFamily: "Courier New, monospace", fontSize: 11, padding: "6px 16px",
                              border: "1.5px solid #94a3b8", borderRadius: 5, background: "#fff",
                              cursor: "pointer", color: "#475569",
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                        )}
                      </div>
                    );
                  }

                  if (saveConfirmId) {
                    /* Ações pós-salvar (fallback — não deve aparecer normalmente) */
                    return (
                  <div style={{ border: "1.5px solid #16a34a", borderRadius: 8, padding: "10px 14px", background: "#f0fdf4" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#16a34a", marginBottom: 8 }}>
                      ✓ Análise salva com sucesso!
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setSaveConfirmId(null)}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                          border: "1.5px solid #1e3a5f", borderRadius: 5, background: "#fff",
                          cursor: "pointer", color: "#1e3a5f", fontWeight: "bold",
                        }}
                      >
                        ✏️ Continuar Editando
                      </button>
                      <button
                        onClick={() => {
                          const rec = savedAnalyses.find(a => a.id === saveConfirmId);
                          if (rec) openSavedPdf(rec);
                        }}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                          border: "1.5px solid #3b82f6", borderRadius: 5, background: "#3b82f6",
                          cursor: "pointer", color: "#fff", fontWeight: "bold",
                        }}
                      >
                        📄 Baixar PDF
                      </button>
                      <button
                        onClick={() => {
                          updatePadrao({ ...DEFAULT_PADRAO_CONFIG }, { changedBy: "operator" });
                          setSaveConfirmId(null);
                        }}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                          border: "1.5px solid #f97316", borderRadius: 5, background: "#f97316",
                          cursor: "pointer", color: "#fff", fontWeight: "bold",
                        }}
                        title="Apaga todos os dados do Standard para começar uma nova análise"
                      >
                        🆕 Iniciar Novo
                      </button>
                      <button
                        onClick={() => { setAnaliseSubTab("pdfs"); setPage("analise"); }}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 10, padding: "5px 14px",
                          border: "1.5px solid #64748b", borderRadius: 5, background: "#fff",
                          cursor: "pointer", color: "#64748b",
                        }}
                      >
                        📂 Ver na Análise
                      </button>
                    </div>
                  </div>
                    );
                  }

                  /* Default: botão Salvar */
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => setShowPreSaveDialog(true)}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 11, padding: "6px 20px",
                          border: "2px solid #1e3a5f", borderRadius: 5, background: "#1e3a5f",
                          cursor: "pointer", color: "#fff", fontWeight: "bold",
                        }}
                      >
                        💾 Salvar
                      </button>
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8" }}>
                        Salva na aba Análise sem baixar nada
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Quick Setup Guide — aparece quando há campos obrigatórios faltando ── */}
            {validatePadrao(padraoConfig).some(a => a.severity === "error") && (
              <div style={{ background: "#f0f9ff", border: "1px solid #7dd3fc", borderRadius: 8, padding: "14px 18px", marginBottom: 16 }}>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#0369a1", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  📋 Como preencher — Guia rápido
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, background: "#fef2f2", color: "#991b1b", padding: "1px 7px", borderRadius: 10, border: "1px solid #fca5a5", marginLeft: 8 }}>
                    {validatePadrao(padraoConfig).filter(a => a.severity === "error").length} campo(s) obrigatório(s) faltando
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  {/* Campo 1 — Standard Area */}
                  <div style={{ background: padraoConfig.stdArea > 0 ? "#f0fdf4" : "#fff7ed", border: `1px solid ${padraoConfig.stdArea > 0 ? "#86efac" : "#fdba74"}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: padraoConfig.stdArea > 0 ? "#166534" : "#c2410c", marginBottom: 4 }}>
                      {padraoConfig.stdArea > 0 ? "✅" : "❌"} Standard Area
                    </div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#475569", lineHeight: 1.5 }}>
                      {padraoConfig.stdArea > 0
                        ? `✓ Preenchida: ${padraoConfig.stdArea.toFixed(3)} mAU·s`
                        : <>
                            <strong>1.</strong> Injetar o padrão no cromatógrafo<br />
                            <strong>2.</strong> Na aba Analysis, abrir o cromatograma do padrão<br />
                            <strong>3.</strong> Clicar em <strong>"Capture as standard area"</strong><br />
                            <strong>ou:</strong> digitar a área manualmente no campo azul →
                          </>
                      }
                    </div>
                  </div>
                  {/* Campo 2 — Standard Amount */}
                  <div style={{ background: padraoConfig.stdAmountUg > 0 ? "#f0fdf4" : "#fff7ed", border: `1px solid ${padraoConfig.stdAmountUg > 0 ? "#86efac" : "#fdba74"}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: padraoConfig.stdAmountUg > 0 ? "#166534" : "#c2410c", marginBottom: 4 }}>
                      {padraoConfig.stdAmountUg > 0 ? "✅" : "❌"} Injected amount (µg)
                    </div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#475569", lineHeight: 1.5 }}>
                      {padraoConfig.stdAmountUg > 0
                        ? `✓ Preenchida: ${padraoConfig.stdAmountUg.toFixed(4)} µg`
                        : <>
                            Retirar do <strong>Certificado de Análise</strong> do padrão de referência:<br />
                            • Concentração (mg/mL) × Volume injetado (µL) = µg<br />
                            <strong>Ex:</strong> 1 mg/mL × 50 µL = <strong>50 µg</strong><br />
                            Digitar no campo azul "Injected amount (µg)" →
                          </>
                      }
                    </div>
                  </div>
                  {/* Campo 3 — Sample Area */}
                  <div style={{ background: padraoConfig.smpArea > 0 ? "#f0fdf4" : "#fff7ed", border: `1px solid ${padraoConfig.smpArea > 0 ? "#86efac" : "#fdba74"}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: padraoConfig.smpArea > 0 ? "#166534" : "#c2410c", marginBottom: 4 }}>
                      {padraoConfig.smpArea > 0 ? "✅" : "❌"} Sample Area
                    </div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#475569", lineHeight: 1.5 }}>
                      {padraoConfig.smpArea > 0
                        ? `✓ Preenchida: ${padraoConfig.smpArea.toFixed(3)} mAU·s`
                        : <>
                            <strong>1.</strong> Injetar a amostra no cromatógrafo<br />
                            <strong>2.</strong> Na aba Analysis, abrir o cromatograma da amostra<br />
                            <strong>3.</strong> Clicar em <strong>"Capture as sample area"</strong><br />
                            <strong>ou:</strong> digitar a área manualmente no campo laranja →
                          </>
                      }
                    </div>
                  </div>
                </div>
                {peakList.length > 0 && (
                  <div style={{ background: "#eef2ff", border: "1px solid #a5b4fc", borderRadius: 5, padding: "8px 12px", fontFamily: "Courier New, monospace", fontSize: 10, color: "#3730a3" }}>
                    ⚡ <strong>Atalho:</strong> há {peakList.length} pico(s) no cromatograma atual. Clique em{" "}
                    <strong onClick={autoFillPadrao} style={{ cursor: "pointer", textDecoration: "underline", color: "#4f46e5" }}>
                      "Auto-fill from chromatogram"
                    </strong>{" "}
                    no card azul para preencher Standard Area, Compound e Pureza automaticamente.
                  </div>
                )}
              </div>
            )}

            {/* Changelog panel */}
            {padraoHistoryOpen && padraoChangelog.length > 0 && (
              <div style={{ ...CARD, marginBottom: 16, background: "#fffbeb", border: "1px solid #fde68a" }}>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#92400e", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  📋 Change History — Reference Standard
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setPadraoChangelog([]); savePadraoChangelog([]); }} style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 8px", border: "1px solid #fde68a", borderRadius: 3, background: "#fef3c7", cursor: "pointer", color: "#92400e" }}>Clear history</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                    <thead><tr style={{ background: "#fef3c7", borderBottom: "1px solid #fde68a" }}>
                      <th style={{ padding: "4px 8px", textAlign: "left", color: "#92400e" }}>Field</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", color: "#92400e" }}>Previous</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", color: "#92400e" }}>New</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", color: "#92400e" }}>By</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", color: "#92400e" }}>When</th>
                    </tr></thead>
                    <tbody>{padraoChangelog.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: "1px solid #fef3c7", background: i % 2 === 0 ? "#fffbeb" : "#fefce8" }}>
                        <td style={{ padding: "3px 8px", fontWeight: "bold", color: "#78350f" }}>{e.field}</td>
                        <td style={{ padding: "3px 8px", color: "#dc2626", textDecoration: "line-through" }}>{e.oldValue}</td>
                        <td style={{ padding: "3px 8px", color: "#166534", fontWeight: "bold" }}>{e.newValue}</td>
                        <td style={{ padding: "3px 8px", color: "#64748b" }}>{e.changedBy}</td>
                        <td style={{ padding: "3px 8px", color: "#64748b" }}>{new Date(e.changedAt).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Two-column input cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>

              {/* ─ Standard card ─ */}
              <div style={{ ...CARD, border: padraoLocked ? "2px solid #f59e0b" : "1px solid #d1d5db" }}>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#1560bd", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: "#1560bd", borderRadius: 2 }} />
                  Reference Standard
                  {padraoLocked && (
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, background: "#fef3c7", color: "#92400e", padding: "1px 7px", borderRadius: 10, border: "1px solid #f59e0b", marginLeft: 4, fontWeight: "bold" }}>
                      🔒 LOCKED
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={padraoLocked ? unlockPadrao : lockPadrao}
                    title={padraoLocked ? "Unlock standard (manager password required)" : "Lock standard to prevent unauthorized changes"}
                    style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px", border: `1px solid ${padraoLocked ? "#f59e0b" : "#cbd5e1"}`, borderRadius: 4, background: padraoLocked ? "#fef3c7" : "#f8fafc", cursor: "pointer", color: padraoLocked ? "#92400e" : "#64748b", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {padraoLocked ? <><LockOpen style={{ width: 10, height: 10 }} /> Unlock</> : <><Lock style={{ width: 10, height: 10 }} /> Lock</>}
                  </button>
                </div>

                <div id="padrao-row-compound" style={ROW}>
                  <span style={LBL}>Compound</span>
                  <input
                    type="text"
                    placeholder="Ex: Vitamin B6, Caffeine…"
                    value={padraoConfig.compoundName}
                    onChange={e => updatePadrao({ compoundName: e.target.value })}
                    style={INP}
                  />
                </div>
                <div id="padrao-row-stdArea" style={ROW}>
                  <span style={LBL}>Standard Area (mAU·s)</span>
                  {numInput(padraoConfig.stdArea, v => updatePadraoProtected({ stdArea: v }), { step: "0.001", placeholder: "0.000" })}
                  {padraoConfig.stdArea <= 0 && <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#dc2626", marginTop: 2 }}>⚠ Required — enter a value &gt; 0</div>}
                </div>
                <div id="padrao-row-stdAmountUg" style={ROW}>
                  <span style={LBL}>Injected amount (µg)</span>
                  {numInput(padraoConfig.stdAmountUg, v => {
                    // ── Auto-lookup Standard Area from Compound Calibration curve ────
                    const cname = padraoConfig.compoundName?.trim().toLowerCase() ?? "";
                    const matchedCpd = cname
                      ? activeCompounds.find(c => c.name.trim().toLowerCase() === cname)
                      : null;
                    const calib = matchedCpd ? compoundCalibrations[matchedCpd.id] : null;
                    let autoArea: number | null = null;
                    if (calib && v > 0) {
                      const validPts = calib.standards.filter(s => s.amount > 0 && s.area > 0);
                      // 1) Exact/near match (within 0.1%)
                      const exact = validPts.find(s => Math.abs(s.amount - v) / Math.max(v, 0.0001) < 0.001);
                      if (exact) {
                        autoArea = exact.area;
                      } else if (validPts.length >= 2) {
                        // 2) Regression prediction
                        const reg = linearRegression(validPts.map(s => ({ x: s.amount, y: s.area })));
                        if (reg.slope > 0) {
                          const pred = reg.slope * v + reg.intercept;
                          if (pred > 0) autoArea = parseFloat(pred.toFixed(4));
                        }
                      }
                    }
                    updatePadraoProtected({
                      stdAmountUg: v,
                      ...(autoArea !== null ? { stdArea: autoArea } : {}),
                    });
                  }, { step: "0.001", placeholder: "µg" })}
                  {padraoConfig.stdAmountUg <= 0 && <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#dc2626", marginTop: 2 }}>⚠ Required — enter a value &gt; 0</div>}
                  {/* Auto-fill hint — shows when there is a calibration curve to lookup from */}
                  {(() => {
                    const cname = padraoConfig.compoundName?.trim().toLowerCase() ?? "";
                    const matchedCpd = cname ? activeCompounds.find(c => c.name.trim().toLowerCase() === cname) : null;
                    const calib = matchedCpd ? compoundCalibrations[matchedCpd.id] : null;
                    const pts = calib ? calib.standards.filter(s => s.amount > 0 && s.area > 0) : [];
                    if (pts.length === 0) return null;
                    const exact = pts.find(s => Math.abs(s.amount - padraoConfig.stdAmountUg) / Math.max(padraoConfig.stdAmountUg, 0.0001) < 0.001);
                    if (exact) {
                      return <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#065f46", marginTop: 2 }}>✓ Área da curva: {exact.area.toFixed(4)} mAU·s (nível exato)</div>;
                    }
                    if (pts.length >= 2 && padraoConfig.stdAmountUg > 0) {
                      const reg = linearRegression(pts.map(s => ({ x: s.amount, y: s.area })));
                      if (reg.slope > 0) {
                        const pred = reg.slope * padraoConfig.stdAmountUg + reg.intercept;
                        return pred > 0
                          ? <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#0369a1", marginTop: 2 }}>⟳ Área predita: {pred.toFixed(4)} mAU·s (regressão R²={(reg.r * reg.r).toFixed(4)})</div>
                          : null;
                      }
                    }
                    return null;
                  })()}
                </div>
                <div id="padrao-row-stdPurity" style={ROW}>
                  <span style={LBL}>Certified purity (%)</span>
                  {(() => {
                    const matchedCpd = activeCompounds.find(c => {
                      const n = padraoConfig.compoundName?.trim().toLowerCase();
                      if (!n) return false;
                      const cn = c.name.trim().toLowerCase();
                      return cn === n || cn.includes(n) || n.includes(cn);
                    });
                    const cpPurity = matchedCpd && matchedCpd.certifiedPurity > 0 ? matchedCpd.certifiedPurity : null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {numInput(padraoConfig.stdPurity, v => updatePadraoProtected({ stdPurity: v }), { step: "0.01", placeholder: "100.00" })}
                        {cpPurity !== null && (
                          <button
                            type="button"
                            title={`Sincronizar com o composto "${matchedCpd!.name}" (${cpPurity.toFixed(2)}%)`}
                            onClick={() => updatePadraoProtected({ stdPurity: cpPurity })}
                            style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 6px", border: "1px solid #6ee7b7", borderRadius: 3, background: "#ecfdf5", color: "#065f46", cursor: "pointer", whiteSpace: "nowrap" }}
                          >↓ {cpPurity.toFixed(2)}%</button>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#059669", marginTop: 2, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 3, padding: "2px 5px" }}>
                    ✓ Altera Found Amount, Purity vs Standard e todos os cálculos abaixo automaticamente
                  </div>
                </div>

                <PeakCapture
                  label="Capture as standard area"
                  onCapture={p => {
                    const capturedArea = parseFloat(getArea(p).toFixed(5));
                    // Auto back-calc stdAmountUg via calibration regression
                    // so the diamond ◆ falls exactly on the regression line
                    const extra: Partial<typeof padraoConfig> = {};
                    const matchComp = activeCompounds.find(c =>
                      padraoConfig.compoundName &&
                      (c.name.toLowerCase() === padraoConfig.compoundName.toLowerCase() ||
                       padraoConfig.compoundName.toLowerCase().includes(c.name.toLowerCase()) ||
                       c.name.toLowerCase().includes(padraoConfig.compoundName.toLowerCase()))
                    );
                    if (matchComp && capturedArea > 0) {
                      const ccc = getCC(matchComp.id);
                      const reg = linearRegression(ccc.standards.map(s => ({ x: s.amount, y: s.area })));
                      if (reg.slope > 0) {
                        const purityFrac = (padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity : 100) / 100;
                        const backCalcUg = (capturedArea - reg.intercept) / reg.slope / purityFrac;
                        if (backCalcUg > 0) extra.stdAmountUg = parseFloat(backCalcUg.toFixed(5));
                        // Warn if correlation below threshold
                        if (reg.r < 0.99020) {
                          window.alert(
                            `⚠ Correlação da curva de calibração (r = ${reg.r.toFixed(5)}) está abaixo de 0.99020.\n` +
                            `Verifique os níveis de calibração antes de usar esses resultados.`
                          );
                        }
                      }
                    }
                    updatePadrao({ stdArea: capturedArea, stdPeakName: p.name || `RT ${p.retentionTime.toFixed(3)}`, ...extra });
                  }}
                />
                {padraoConfig.stdPeakName && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#1560bd" }}>
                      ✓ Peak captured: {padraoConfig.stdPeakName}
                    </div>
                    <button
                      onClick={() => setPage("chromatogram")}
                      title="Ir ao cromatograma onde esta área foi capturada"
                      style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 7px", border: "1px solid #1560bd", borderRadius: 4, background: "#eff6ff", cursor: "pointer", color: "#1560bd", whiteSpace: "nowrap" }}
                    >
                      📊 ver no cromatograma
                    </button>
                  </div>
                )}
                {peakList.length > 0 && (
                  <button
                    onClick={autoFillPadrao}
                    style={{
                      marginTop: 10, width: "100%", padding: "7px 10px",
                      border: "1px solid #6366f1", borderRadius: 5, background: "#eef2ff",
                      cursor: "pointer", fontFamily: "Courier New, monospace", fontSize: 10,
                      color: "#4338ca", fontWeight: "bold",
                    }}
                  >
                    ⚡ Auto-fill from chromatogram
                  </button>
                )}
              </div>

              {/* ─ Sample card ─ */}
              <div style={CARD}>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#f97316", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: "#f97316", borderRadius: 2 }} />
                  Analyzed Sample
                </div>

                {/* ── Sub-tab nav ── */}
                <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "2px solid #e2e8f0" }}>
                  {(["padrao", "conc_inicial"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSmpSubTab(tab)}
                      style={{
                        fontFamily: "Courier New, monospace", fontSize: 10, padding: "4px 14px",
                        border: "none", borderBottom: smpSubTab === tab ? "2px solid #f97316" : "2px solid transparent",
                        background: "transparent", cursor: "pointer",
                        color: smpSubTab === tab ? "#ea580c" : "#64748b",
                        fontWeight: smpSubTab === tab ? 700 : 400,
                        marginBottom: -2,
                      }}
                    >
                      {tab === "padrao" ? "Padrão" : "Concentração Inicial"}
                    </button>
                  ))}
                </div>

                {smpSubTab === "conc_inicial" && (() => {
                  // ── Fields ──────────────────────────────────────────────────────────
                  // M_declarada: editable field; falls back to anvisaLabelAmountMg if not set
                  const mDeclaradaMg  = padraoConfig.smpMassDeclaradaMg > 0
                    ? padraoConfig.smpMassDeclaradaMg
                    : padraoConfig.anvisaLabelAmountMg;
                  // V_i = initial dissolution volume (mL)
                  const vi            = padraoConfig.smpVolInicialMl;
                  // C_f = final concentration measured by HPLC (µg/mL) — user-entered
                  const cf            = padraoConfig.smpConcFinalUgMl;
                  // Optional: injection volume (µL) → auto-derive C_f suggestion from found amount
                  const injVolUl      = padraoConfig.smpInjVolUl;

                  // ── Step 1: Convert declared mass to µg — apply certified purity ─────
                  // M_i (µg) = M_declarada (mg) × (stdPurity / 100) × 1000
                  // Certified purity > 100% (overage) is handled naturally by this factor.
                  const stdPurityFactor = (padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity : 100) / 100;
                  const miUg          = mDeclaradaMg * stdPurityFactor * 1000;

                  // ── Step 2: Theoretical initial concentration C_i ────────────────────
                  const ci            = (miUg > 0 && vi > 0) ? miUg / vi : 0;

                  // ── Step 3: Dilution factor FD = C_i / C_f ──────────────────────────
                  const fd            = (ci > 0 && cf > 0) ? ci / cf : 0;

                  // % found vs label — computed first so it can drive M_original below
                  // Quando "Pureza da amostra" está disponível (digitada/travada), ela é o
                  // resultado analítico autoritativo — usar diretamente em vez do back-calc.
                  const hasSmpPurity  = padraoConfig.smpPurity > 0 && Math.abs(padraoConfig.smpPurity - 100) > 0.01;

                  // ── Step 4: Back-calculation ─────────────────────────────────────────
                  // 4a. Recover C_original = C_f × FD  (= C_i)
                  const cOriginal        = cf * fd;
                  // 4b. Recover mass: M_original (µg) = C_original × V_i
                  const mOriginalUg_fromCf = cOriginal * vi;
                  // 4c. Convert back to mg (route via C_f × FD)
                  const mOriginalMg_fromCf = mOriginalUg_fromCf / 1000;

                  // Authoritative M_original:
                  // When smpPurity is set (from area ratio), use M_decl × purity% — that IS the real
                  // recovered mass and is consistent with the displayed purity.
                  // The C_f × FD × Vi route is circular (FD is derived from M_decl) so it always
                  // returns M_decl × stdPurity%, NOT the true recovered amount.
                  const mOriginalMg   = (hasSmpPurity && mDeclaradaMg > 0)
                    ? mDeclaradaMg * (padraoConfig.smpPurity / 100)
                    : mOriginalMg_fromCf;
                  const mOriginalUg   = mOriginalMg * 1000;

                  const pctFound      = hasSmpPurity
                    ? padraoConfig.smpPurity
                    : (mDeclaradaMg > 0 && mOriginalMg > 0 ? (mOriginalMg / mDeclaradaMg) * 100 : null);

                  // Suggestion: C_f from Reference Standard found amount
                  const cfFromStd     = injVolUl > 0 && padraoFoundUg > 0
                    ? padraoFoundUg / (injVolUl / 1000)   // µg ÷ mL = µg/mL
                    : null;

                  // Apply to ANVISA (back-calc smpArea from mOriginalMg)
                  const canApply = mOriginalMg > 0 && padraoConfig.stdArea > 0
                    && padraoConfig.stdAmountUg > 0 && padraoConfig.stdPurity > 0;

                  const applyToAnvisa = () => {
                    const stdA   = padraoConfig.stdArea;
                    const stdAmt = padraoConfig.stdAmountUg;
                    const stdPur = padraoConfig.stdPurity;
                    const newSmpArea = parseFloat(
                      ((mOriginalMg * 1000 * stdA) / (stdAmt * (stdPur / 100))).toFixed(5)
                    );
                    updatePadrao({ smpArea: newSmpArea, smpRawArea: 0 });
                    syncSmpPeakManualArea(newSmpArea);
                    setSmpSubTab("padrao");
                  };

                  const STEP: React.CSSProperties = {
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
                    padding: "8px 14px", marginBottom: 8, fontFamily: "Courier New, monospace",
                  };
                  const STEP_NUM: React.CSSProperties = {
                    display: "inline-block", width: 18, height: 18, lineHeight: "18px",
                    textAlign: "center", borderRadius: "50%",
                    background: "#0369a1", color: "#fff", fontSize: 9, fontWeight: 700,
                    marginRight: 7, flexShrink: 0,
                  };
                  const STEP_TITLE: React.CSSProperties = {
                    fontSize: 9.5, fontWeight: 700, color: "#1e293b",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  };
                  const FORMULA: React.CSSProperties = {
                    fontFamily: "Courier New, monospace", fontSize: 10, color: "#475569",
                    margin: "4px 0 2px 25px",
                  };
                  const RESULT: React.CSSProperties = {
                    fontFamily: "Courier New, monospace", fontSize: 13, fontWeight: 700,
                    color: "#0c4a6e", marginLeft: 25,
                  };

                  const missingMdecl = mDeclaradaMg <= 0;
                  const missingVi    = vi <= 0;
                  const missingCf    = cf <= 0;

                  return (
                    <div>
                      {/* ─ Prerequisite warnings ─ */}
                      {missingMdecl && (
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "5px 9px", marginBottom: 8 }}>
                          ⚠ Preencha <strong>Qtd. declarada no rótulo (mg)</strong> na seção ANVISA abaixo
                        </div>
                      )}

                      {/* ─ Reference Standard link ─ */}
                      {padraoFoundUg > 0 && (
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#1560bd", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 5, padding: "5px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, background: "#1560bd", borderRadius: 2, flexShrink: 0 }} />
                          <div>
                            <span style={{ fontWeight: 700 }}>Reference Standard → </span>
                            Amount found: <strong>{padraoFoundUg.toFixed(4)} µg</strong>
                            {injVolUl > 0 && (
                              <span style={{ marginLeft: 8 }}>
                                → C_f sugerida: <strong style={{ color: "#0369a1" }}>{cfFromStd!.toFixed(4)} µg/mL</strong>
                                <button
                                  onClick={() => updatePadrao({ smpConcFinalUgMl: parseFloat(cfFromStd!.toFixed(4)) })}
                                  style={{ fontFamily: "Courier New, monospace", fontSize: 8, marginLeft: 5, padding: "1px 5px", border: "1px solid #1560bd", borderRadius: 3, background: "#dbeafe", cursor: "pointer", color: "#1e40af" }}
                                >usar</button>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ─ Inputs: 3-column grid ─ */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", marginBottom: 12 }}>
                        {(() => {
                          const ciUseUg = padraoConfig.concInicialUseUg;
                          const ciUnitLabel = ciUseUg ? "µg" : "mg";
                          const ciRawMg = padraoConfig.smpMassDeclaradaMg > 0
                            ? padraoConfig.smpMassDeclaradaMg
                            : padraoConfig.anvisaLabelAmountMg;
                          const ciDisp = ciUseUg ? ciRawMg * 1000 : ciRawMg;
                          const parseL = (s: string) => parseFloat(s.trim().replace(/,/g, ".")) || 0;
                          return (
                            <div>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#64748b", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, display: "flex", alignItems: "center" }}>
                                M_declarada ({ciUnitLabel})
                                <button
                                  onClick={() => updatePadrao({ concInicialUseUg: !ciUseUg })}
                                  title={ciUseUg ? "Trocar para mg" : "Trocar para µg"}
                                  style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "1px 6px", border: "1px solid #94a3b8", borderRadius: 3, background: ciUseUg ? "#0369a1" : "#f1f5f9", color: ciUseUg ? "#fff" : "#475569", cursor: "pointer", marginLeft: 5, fontWeight: 600 }}
                                >{ciUseUg ? "µg ↔ mg" : "mg ↔ µg"}</button>
                              </div>
                              <input
                                key={`ci-mass-${ciUseUg}-${ciDisp}`}
                                type="text" inputMode="decimal"
                                placeholder={ciUseUg ? "ex: 40 ou 0,040 mg→µg" : "ex: 0,040 ou 40,00"}
                                defaultValue={ciDisp > 0 ? String(ciDisp) : ""}
                                onBlur={e => {
                                  const v = parseL(e.target.value);
                                  updatePadrao({ smpMassDeclaradaMg: ciUseUg ? v / 1000 : v });
                                }}
                                style={{ ...INP, width: "100%" }}
                              />
                              {ciRawMg > 0 && (
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 7.5, color: "#0369a1", marginTop: 2 }}>
                                  {ciUseUg ? `= ${ciRawMg.toFixed(4)} mg` : `= ${(ciRawMg * 1000).toFixed(2)} µg`}
                                  {padraoConfig.anvisaLabelAmountMg > 0 && padraoConfig.smpMassDeclaradaMg <= 0 && " · da seção ANVISA"}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div>
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#64748b", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                            V_i — Vol. Dissolução (mL)
                          </div>
                          {numInput(padraoConfig.smpVolInicialMl, v => updatePadrao({ smpVolInicialMl: v }), { step: "1", placeholder: "ex: 350" })}
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 7.5, color: "#94a3b8", marginTop: 2 }}>
                            volume de preparo da amostra
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#64748b", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                            C_f — Conc. HPLC (µg/mL)
                          </div>
                          {numInput(padraoConfig.smpConcFinalUgMl, v => updatePadrao({ smpConcFinalUgMl: v }), { step: "0.0001", placeholder: "ex: 25.00" })}
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 7.5, color: "#94a3b8", marginTop: 2 }}>
                            medida pelo HPLC na injeção
                          </div>
                        </div>
                      </div>

                      {/* Optional injection volume */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#94a3b8" }}>
                          Vol. injeção (µL) — opcional, para sugerir C_f do padrão:
                        </div>
                        <div style={{ width: 90 }}>
                          {numInput(padraoConfig.smpInjVolUl, v => updatePadrao({ smpInjVolUl: v }), { step: "1", placeholder: "ex: 20" })}
                        </div>
                      </div>

                      {/* ─ 4-step calculation ─ */}
                      {!missingMdecl && !missingVi && !missingCf && (<>

                        {/* Step 1 */}
                        <div style={STEP}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={STEP_NUM}>1</span>
                            <span style={STEP_TITLE}>Converter massa declarada para µg (aplicar pureza certificada)</span>
                          </div>
                          <div style={FORMULA}>
                            M_i = {mDeclaradaMg.toFixed(2)} mg × {stdPurityFactor.toFixed(5)} ({padraoConfig.stdPurity > 0 ? padraoConfig.stdPurity : 100}%) × 1000 = <strong>{miUg.toFixed(4)} µg</strong>
                          </div>
                          <div style={RESULT}>{miUg.toFixed(4)} µg</div>
                        </div>

                        {/* Step 2 */}
                        <div style={STEP}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={STEP_NUM}>2</span>
                            <span style={STEP_TITLE}>Calcular concentração inicial teórica (C_i)</span>
                          </div>
                          <div style={FORMULA}>C_i = {miUg.toLocaleString("pt-BR")} µg ÷ {vi} mL = <strong>{ci.toFixed(4)} µg/mL</strong></div>
                          <div style={RESULT}>{ci.toFixed(4)} µg/mL</div>
                        </div>

                        {/* Step 3 */}
                        <div style={STEP}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={STEP_NUM}>3</span>
                            <span style={STEP_TITLE}>Determinar Fator de Diluição (FD)</span>
                          </div>
                          <div style={FORMULA}>FD = C_i ÷ C_f = {ci.toFixed(4)} ÷ {cf} = <strong>{fd.toFixed(4)}</strong></div>
                          <div style={RESULT}>{fd.toFixed(4)}</div>
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#64748b", marginLeft: 25, marginTop: 2 }}>
                            a amostra foi diluída {fd.toFixed(2)}× antes da injeção
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div style={{ ...STEP, border: "1.5px solid #0ea5e9", background: "#f0f9ff" }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ ...STEP_NUM, background: "#0369a1" }}>4</span>
                            <span style={{ ...STEP_TITLE, color: "#0369a1" }}>Cálculo reverso — recuperar massa original</span>
                          </div>
                          <div style={{ ...FORMULA, color: "#0c4a6e" }}>
                            4a. C_original = C_f × FD = {cf} × {fd.toFixed(4)} = {cOriginal.toFixed(4)} µg/mL
                          </div>
                          <div style={{ ...FORMULA, color: "#0c4a6e" }}>
                            4b. M_original (µg) = C_original × V_i = {cOriginal.toFixed(4)} × {vi} = {mOriginalUg_fromCf.toFixed(4)} µg
                          </div>
                          {hasSmpPurity && mDeclaradaMg > 0 ? (
                            <div style={{ ...FORMULA, color: "#0c4a6e" }}>
                              4c. M_original (mg) = M_decl × pureza% = {mDeclaradaMg.toFixed(4)} × {padraoConfig.smpPurity.toFixed(4)}% =
                            </div>
                          ) : (
                            <div style={{ ...FORMULA, color: "#0c4a6e" }}>
                              4c. M_original (mg) = {mOriginalUg_fromCf.toFixed(4)} ÷ 1000 =
                            </div>
                          )}
                          <div style={{ marginLeft: 25, marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontFamily: "Courier New, monospace", fontSize: 22, fontWeight: 900, color: "#0c4a6e" }}>
                              {mOriginalMg.toFixed(4)} mg
                            </span>
                            <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#475569" }}>
                              = {mOriginalUg.toFixed(4)} µg
                            </span>
                          </div>
                          {pctFound !== null && (
                            <div style={{ marginLeft: 25, marginTop: 8, paddingTop: 6, borderTop: "1px solid #bae6fd" }}>
                              <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#0369a1" }}>
                                {hasSmpPurity
                                  ? `Pureza da amostra (%): `
                                  : `vs. declarado (${mDeclaradaMg.toFixed(4)} mg): `}
                              </span>
                              <span style={{
                                fontFamily: "Courier New, monospace", fontSize: 15, fontWeight: 700, marginLeft: 8,
                                color: pctFound >= 90 && pctFound <= 110 ? "#16a34a" : pctFound >= 80 && pctFound <= 120 ? "#d97706" : "#dc2626",
                              }}>
                                {pctFound.toFixed(2)}%
                              </span>
                              <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#64748b", marginLeft: 6 }}>
                                {pctFound >= 90 && pctFound <= 110 ? "✓ dentro do intervalo" : pctFound >= 80 && pctFound <= 120 ? "⚠ fora de ±10%" : "✗ fora de ±20%"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Step 5 — Proportional result using Reference Standard */}
                        {(() => {
                          const foundUg  = padraoFoundUg;          // from area comparison with standard
                          const declUgSmp = padraoConfig.smpDeclaredAmountUg; // declared in µg (same as std amount injected)
                          const hasPropData = foundUg > 0 && declUgSmp > 0 && mDeclaradaMg > 0 && fd > 0;
                          if (!hasPropData) return null;

                          // Proportional: M_found = M_declarada × (foundUg / declaredUg)
                          // Equivalent to: M_declarada × (smpPurity / 100)
                          const ratio       = foundUg / declUgSmp;
                          const mPropMg     = mDeclaradaMg * ratio;
                          const mPropUg     = mPropMg * 1000;
                          const pctProp     = ratio * 100;
                          const propColor   = pctProp >= 90 && pctProp <= 110 ? "#16a34a" : pctProp >= 80 && pctProp <= 120 ? "#d97706" : "#dc2626";
                          const propLabel   = pctProp >= 90 && pctProp <= 110 ? "✓ dentro de ±10%" : pctProp >= 80 && pctProp <= 120 ? "⚠ fora de ±10%" : "✗ fora de ±20%";

                          return (
                            <div style={{ ...STEP, border: "2px solid #16a34a", background: "#f0fdf4", marginTop: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                                <span style={{ ...STEP_NUM, background: "#16a34a" }}>5</span>
                                <span style={{ ...STEP_TITLE, color: "#15803d" }}>Massa encontrada — proporção com Reference Standard</span>
                              </div>
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#166534", marginLeft: 25, marginBottom: 6 }}>
                                Usa found amount do padrão externo + FD para estimar a massa na cápsula original
                              </div>

                              <div style={{ ...FORMULA, color: "#166534" }}>
                                Razão = found (µg) ÷ declared (µg) = {foundUg.toFixed(4)} ÷ {declUgSmp.toFixed(4)} = {ratio.toFixed(6)}
                              </div>
                              <div style={{ ...FORMULA, color: "#166534" }}>
                                M_encontrada = M_declarada × Razão = {mDeclaradaMg.toFixed(2)} mg × {ratio.toFixed(6)}
                              </div>

                              <div style={{ marginLeft: 25, marginTop: 8, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "Courier New, monospace", fontSize: 24, fontWeight: 900, color: "#15803d" }}>
                                  {mPropMg.toFixed(4)} mg
                                </span>
                                <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: "#166534", fontWeight: 600 }}>
                                  = {mPropUg.toFixed(2)} µg
                                </span>
                              </div>

                              <div style={{ marginLeft: 25, marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "Courier New, monospace", fontSize: 14, fontWeight: 700, color: propColor }}>
                                  {pctProp.toFixed(2)}%
                                </span>
                                <span style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: propColor, fontWeight: 600 }}>
                                  {propLabel} do declarado ({mDeclaradaMg.toFixed(2)} mg)
                                </span>
                              </div>

                              {/* Comparison: dilution route vs proportional */}
                              {mOriginalMg > 0 && (
                                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #bbf7d0", fontFamily: "Courier New, monospace", fontSize: 8, color: "#64748b" }}>
                                  Comparação: Via diluição = {mOriginalMg.toFixed(4)} mg &nbsp;|&nbsp; Via proporção = <strong>{mPropMg.toFixed(4)} mg</strong>
                                  {Math.abs(mOriginalMg - mPropMg) < 0.01 * mDeclaradaMg
                                    ? " ✓ resultados consistentes (&lt;1% diff)"
                                    : ` ⚠ diferença ${Math.abs(mOriginalMg - mPropMg).toFixed(2)} mg`}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Apply button */}
                        {(() => {
                          const foundUg   = padraoFoundUg;
                          const declUgSmp = padraoConfig.smpDeclaredAmountUg;
                          const hasProp   = foundUg > 0 && declUgSmp > 0 && mDeclaradaMg > 0;
                          const mApplyMg  = hasProp ? mDeclaradaMg * (foundUg / declUgSmp) : mOriginalMg;
                          const label     = hasProp
                            ? `→ Aplicar ${mApplyMg.toFixed(4)} mg (proporcional) como "Encontrado na análise"`
                            : `→ Aplicar ${mOriginalMg.toFixed(4)} mg como "Encontrado na análise"`;
                          const canApplyFinal = mApplyMg > 0;
                          return (
                            <button
                              disabled={!canApplyFinal}
                              onClick={() => {
                                // Write directly — smpArea is NOT changed
                                updatePadrao({ anvisaFoundMgOverride: parseFloat(mApplyMg.toFixed(4)) });
                                setSmpSubTab("padrao");
                              }}
                              title={canApplyFinal ? "Envia o valor proporcional direto para Conformidade ANVISA (sem alterar Sample Area)" : "Calcule a massa primeiro"}
                              style={{
                                width: "100%", fontFamily: "Courier New, monospace", fontSize: 10,
                                padding: "7px 12px", border: `1px solid ${canApplyFinal ? "#0ea5e9" : "#cbd5e1"}`,
                                borderRadius: 5, background: canApplyFinal ? "#0369a1" : "#f8fafc",
                                cursor: canApplyFinal ? "pointer" : "not-allowed",
                                color: canApplyFinal ? "#fff" : "#94a3b8", fontWeight: 700, marginTop: 6,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })()}
                      </>)}

                      {(missingMdecl || missingVi || missingCf) && (
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
                          Preencha os 3 campos acima para ver o cálculo passo a passo
                        </div>
                      )}
                    </div>
                  );
                })()}

                {smpSubTab === "padrao" && <>
                {/* ── Pureza da amostra ── */}
                <div id="padrao-row-smpPurity" style={ROW}>
                  <span style={{ ...LBL, color: "#c2410c" }}>Pureza da amostra (%)</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {numInput(padraoConfig.smpPurity, updateSmpPurity, {
                        step: "0.01", min: 0.01, placeholder: "100.00",
                        disabled: smpPurityLocked,
                      })}
                      <button
                        onClick={smpPurityLocked ? unlockSmpPurity : lockSmpPurity}
                        title={smpPurityLocked
                          ? `Purity locked at ${padraoConfig.smpPurity.toFixed(2)}% — click to unlock (password required)`
                          : "Save & lock this purity value (prevents chromatogram baseline changes from overwriting it)"}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 9, padding: "2px 8px",
                          border: `1px solid ${smpPurityLocked ? "#f59e0b" : "#cbd5e1"}`,
                          borderRadius: 4,
                          background: smpPurityLocked ? "#fef3c7" : "#f8fafc",
                          cursor: "pointer",
                          color: smpPurityLocked ? "#92400e" : "#64748b",
                          display: "flex", alignItems: "center", gap: 4,
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        {smpPurityLocked
                          ? <><Lock style={{ width: 10, height: 10 }} /> {padraoConfig.smpPurity.toFixed(2)}% locked</>
                          : <><Lock style={{ width: 10, height: 10 }} /> Save & Lock</>}
                      </button>
                    </div>
                    {smpPurityLocked && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 8.5, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 3, padding: "2px 7px", marginTop: 3 }}>
                        🔒 Bloqueado — baseline e peak capture não alteram este %. Senha necessária para editar.
                      </div>
                    )}
                    {padraoConfig.stdArea > 0 && padraoConfig.stdPurity > 0 && Math.abs(padraoConfig.smpPurity - 100) > 0.01 && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", marginTop: 2 }}>
                        {padraoConfig.stdArea.toFixed(3)} mAU·s × ({padraoConfig.smpPurity.toFixed(2)} ÷ {padraoConfig.stdPurity.toFixed(2)}) = {(padraoConfig.stdArea * padraoConfig.smpPurity / padraoConfig.stdPurity).toFixed(5)} mAU·s
                      </div>
                    )}
                  </div>
                </div>

                <div id="padrao-row-smpArea" style={ROW}>
                  <span style={LBL}>Sample Area (mAU·s)</span>
                  <div>
                    {numInput(padraoConfig.smpArea, v => {
                      updatePadrao({ smpArea: v, smpRawArea: 0 });
                      syncSmpPeakManualArea(v);
                    }, { step: "0.001", placeholder: "0.000" })}
                    {padraoConfig.smpArea <= 0 && <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#dc2626", marginTop: 2 }}>⚠ Required — enter a value &gt; 0</div>}
                    {padraoConfig.stdArea > 0 && padraoConfig.smpArea > 0 && padraoConfig.smpArea / padraoConfig.stdArea > 2 && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#d97706", marginTop: 2 }}>⚠ Sample area &gt;2× standard — verify concentrations</div>
                    )}
                    {Math.abs(padraoConfig.smpPurity - 100) > 0.01 && padraoConfig.smpArea > 0 && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: padraoConfig.smpPurity > 100 ? "#7c3aed" : "#f97316", marginTop: 2 }}>
                        {padraoConfig.smpPurity > 100 ? `⚗ Overage: ${padraoConfig.smpPurity.toFixed(2)}% (área ampliada)` : `✓ Corrigida para ${padraoConfig.smpPurity.toFixed(2)}% de pureza`}
                      </div>
                    )}
                  </div>
                </div>
                <div id="padrao-row-smpDeclared" style={ROW}>
                  <span style={{ ...LBL, fontSize: 10 }}>Declared/theoretical amount (µg)</span>
                  {numInput(padraoConfig.smpDeclaredAmountUg, v => updatePadrao({ smpDeclaredAmountUg: v }), { step: "0.001", placeholder: "optional — for % vs declared" })}
                </div>
                {padraoConfig.smpDeclaredAmountUg > 0 && padraoFoundUg > 0 && padraoConfig.smpDeclaredAmountUg > padraoFoundUg * 100 && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, padding: "6px 10px", fontSize: 10, color: "#dc2626", fontFamily: "Courier New, monospace", marginTop: 4 }}>
                    ⚠ Declared amount ({padraoConfig.smpDeclaredAmountUg.toFixed(2)} µg) parece muito alto em relação ao encontrado ({padraoFoundUg.toFixed(2)} µg). Verifique se o valor está correto — pode ser dado residual de uma entrada anterior.
                  </div>
                )}

                <PeakCapture
                  label="Capture as sample area"
                  onCapture={p => {
                    const rawArea = parseFloat(getArea(p).toFixed(5));
                    // Use locked purity if set; otherwise peak's purity or current value
                    const peakPurity = smpPurityLocked
                      ? padraoConfig.smpPurity
                      : (p.purityPct && p.purityPct > 0 ? p.purityPct : (padraoConfig.smpPurity || 100));
                    const correctedArea = parseFloat((rawArea * peakPurity / 100).toFixed(5));
                    updatePadrao({
                      smpRawArea: rawArea,
                      smpArea: correctedArea,
                      smpPeakName: p.name || `RT ${p.retentionTime.toFixed(3)}`,
                      // Never overwrite smpPurity when locked
                      ...(!smpPurityLocked && p.purityPct && p.purityPct > 0 ? { smpPurity: p.purityPct } : {}),
                    });
                  }}
                />
                {padraoConfig.smpPeakName && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#f97316" }}>
                      ✓ Peak captured: {padraoConfig.smpPeakName}
                    </div>
                    <button
                      onClick={() => setPage("chromatogram")}
                      title="Ir ao cromatograma onde esta área foi capturada"
                      style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 7px", border: "1px solid #f97316", borderRadius: 4, background: "#fff7ed", cursor: "pointer", color: "#ea580c", whiteSpace: "nowrap" }}
                    >
                      📊 ver no cromatograma
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <div style={{ ...LBL, textAlign: "left", marginBottom: 4 }}>Notes</div>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={padraoConfig.notes}
                    onChange={e => updatePadrao({ notes: e.target.value })}
                    style={INP}
                  />
                </div>
                </>}
              </div>
            </div>

            {/* ─ Visual Comparison — Standard vs Sample ─ */}
            {(padraoConfig.stdArea > 0 || padraoConfig.smpArea > 0) && (() => {
              const sA = padraoConfig.stdArea;
              const mA = padraoConfig.smpArea;
              const maxA = Math.max(sA, mA, 1);
              const stdBar = sA > 0 ? (sA / maxA) * 100 : 0;
              const smpBar = mA > 0 ? (mA / maxA) * 100 : 0;
              const ratioOk  = sA > 0 && mA > 0;
              const rat = ratioOk ? mA / sA : null;
              const ratColor = rat === null ? "#94a3b8" : rat >= 0.95 ? "#16a34a" : rat >= 0.80 ? "#d97706" : "#dc2626";
              const pctFound = ratioOk ? rat! * padraoConfig.stdPurity : null;
              return (
                <div style={{ marginBottom: 18, border: "1.5px solid #e2e8f0", borderRadius: 8, overflow: "hidden", fontFamily: "Courier New, monospace" }}>
                  {/* Header */}
                  <div style={{ background: "#1e293b", padding: "7px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: "bold", color: "#e2e8f0", letterSpacing: "0.04em" }}>📊 COMPARAÇÃO VISUAL — Padrão × Amostra</span>
                    {rat !== null && (
                      <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: "bold", color: ratColor, background: "#0f172a", border: `1px solid ${ratColor}`, borderRadius: 10, padding: "1px 10px" }}>
                        Ratio {rat.toFixed(4)}
                      </span>
                    )}
                  </div>
                  {/* Body */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 1fr", background: "#f8fafc" }}>
                    {/* LEFT — Standard */}
                    <div style={{ padding: "12px 14px", borderRight: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 9, fontWeight: "bold", color: "#1560bd", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                        ● Reference Standard
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Peak: </span>
                        <span style={{ fontWeight: 600 }}>{padraoConfig.stdPeakName || <span style={{ color: "#fca5a5" }}>— não capturado —</span>}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Area: </span>
                        <span style={{ fontWeight: 600, color: "#1560bd" }}>
                          {sA > 0 ? `${sA.toFixed(3)} mAU·s` : <span style={{ color: "#fca5a5" }}>—</span>}
                        </span>
                      </div>
                      {/* Area bar */}
                      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${stdBar}%`, background: "#1560bd", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 1 }}>
                        <span style={{ color: "#94a3b8" }}>Inj. amt: </span>
                        <span style={{ fontWeight: 600 }}>{padraoConfig.stdAmountUg > 0 ? `${padraoConfig.stdAmountUg.toFixed(4)} µg` : <span style={{ color: "#fca5a5" }}>—</span>}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#334155" }}>
                        <span style={{ color: "#94a3b8" }}>Purity: </span>
                        <span style={{ fontWeight: 600 }}>{padraoConfig.stdPurity.toFixed(2)} %</span>
                      </div>
                    </div>
                    {/* CENTER — Purity */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0", borderRight: "1px solid #e2e8f0", background: "#fff" }}>
                      {rat !== null ? (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 900, color: ratColor, lineHeight: 1 }}>{pctFound!.toFixed(2)}%</div>
                          <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 2, textAlign: "center", lineHeight: 1.3 }}>Pureza<br/>calc. (%)</div>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${ratColor}`, marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 12, color: ratColor }}>{rat >= 0.95 ? "✓" : rat >= 0.80 ? "~" : "!"}</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 9, color: "#cbd5e1", textAlign: "center", lineHeight: 1.4 }}>aguard.<br/>dados</div>
                      )}
                    </div>
                    {/* RIGHT — Sample */}
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 9, fontWeight: "bold", color: "#ea580c", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                        ● Analyzed Sample
                        {(padraoConfig.smpArea > 0 || padraoConfig.smpPeakName) && (
                          <button
                            title="Limpar sample capturado"
                            onClick={() => updatePadrao({ smpArea: 0, smpRawArea: 0, smpPeakName: "" }, { changedBy: "operator" })}
                            style={{ fontSize: 9, padding: "1px 6px", border: "1px solid #fca5a5", borderRadius: 3, background: "#fff", color: "#dc2626", cursor: "pointer", fontWeight: "normal" }}
                          >✕ Limpar</button>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Peak: </span>
                        <span style={{ fontWeight: 600 }}>{padraoConfig.smpPeakName || <span style={{ color: "#fca5a5" }}>— não capturado —</span>}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Area: </span>
                        <span style={{ fontWeight: 600, color: "#ea580c" }}>
                          {mA > 0 ? `${mA.toFixed(3)} mAU·s` : <span style={{ color: "#fca5a5" }}>—</span>}
                        </span>
                      </div>
                      {/* Area bar */}
                      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${smpBar}%`, background: "#f97316", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", marginBottom: 1 }}>
                        <span style={{ color: "#94a3b8" }}>Found: </span>
                        <span style={{ fontWeight: 600, color: ratioOk ? "#ea580c" : "#94a3b8" }}>
                          {ratioOk ? `${foundAmountUg.toFixed(4)} µg` : <span style={{ color: "#fca5a5" }}>—</span>}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: "#334155" }}>
                        <span style={{ color: "#94a3b8" }}>Purity: </span>
                        <span style={{ fontWeight: 600, color: pctFound !== null ? ratColor : "#94a3b8" }}>
                          {pctFound !== null ? `${displaySmpPurity.toFixed(2)} %` : <span style={{ color: "#fca5a5" }}>—</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Mini chromatogram — Gaussian peaks proportional to area */}
                  {(() => {
                    const W = 400, H = 130;
                    const PAD = { top: 22, right: 16, bottom: 24, left: 36 };
                    const plotW = W - PAD.left - PAD.right;
                    const plotH = H - PAD.top - PAD.bottom;
                    const sigma = 0.09; // normalized half-width (0-1 scale)
                    const stdMu = 0.27; // std peak center (normalized x)
                    const smpMu = 0.73; // smp peak center (normalized x)
                    const maxA  = Math.max(sA, mA, 1);
                    const stdHn = sA / maxA; // normalized height 0-1
                    const smpHn = mA / maxA;

                    const gauss = (x: number, mu: number, hn: number) =>
                      hn * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

                    const N = 300;
                    const xs = Array.from({ length: N + 1 }, (_, i) => i / N);

                    // Polyline points for each peak and fill polygon
                    const toSvgX = (t: number) => PAD.left + t * plotW;
                    const toSvgY = (v: number) => PAD.top + plotH - v * plotH * 0.92;
                    const baseY  = toSvgY(0);

                    // Build fill polygon: top = gaussian curve; bottom = baseline
                    const buildFill = (mu: number, hn: number) => {
                      const pts: string[] = [];
                      const intPts = xs.filter(x => Math.abs(x - mu) < sigma * 3.5);
                      if (intPts.length === 0) return "";
                      // left baseline
                      pts.push(`${toSvgX(intPts[0])},${baseY}`);
                      // curve
                      intPts.forEach(x => pts.push(`${toSvgX(x).toFixed(1)},${toSvgY(gauss(x, mu, hn)).toFixed(1)}`));
                      // right baseline
                      pts.push(`${toSvgX(intPts[intPts.length - 1])},${baseY}`);
                      return pts.join(" ");
                    };

                    const buildLine = (mu: number, hn: number) =>
                      xs.filter(x => Math.abs(x - mu) < sigma * 4)
                        .map(x => `${toSvgX(x).toFixed(1)},${toSvgY(gauss(x, mu, hn)).toFixed(1)}`)
                        .join(" ");

                    const stdFill = buildFill(stdMu, stdHn);
                    const smpFill = buildFill(smpMu, smpHn);
                    const stdLine = buildLine(stdMu, stdHn);
                    const smpLine = buildLine(smpMu, smpHn);

                    // Label positions (apex)
                    const stdApexY = toSvgY(stdHn) - 5;
                    const smpApexY = toSvgY(smpHn) - 5;

                    // Integration lines (at ±2σ from mu)
                    const intBound = (mu: number, side: -1 | 1) => toSvgX(mu + side * sigma * 2);
                    const intY  = (mu: number, hn: number, side: -1 | 1) => toSvgY(gauss(mu + side * sigma * 2, mu, hn));

                    return (
                      <div style={{ borderTop: "1px solid #e2e8f0", background: "#0f172a", padding: "8px 0 4px" }}>
                        <div style={{ fontSize: 8.5, fontFamily: "Courier New, monospace", color: "#94a3b8", textAlign: "center", marginBottom: 2, letterSpacing: "0.06em" }}>
                          CROMATOGRAMA — visualização proporcional às áreas
                        </div>
                        <svg
                          id="padrao-chrom-svg-live"
                          viewBox={`0 0 ${W} ${H}`}
                          style={{ width: "100%", height: H, display: "block" }}
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Grid lines */}
                          {[0.25, 0.5, 0.75, 1].map(v => (
                            <line key={v}
                              x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + plotW} y2={toSvgY(v)}
                              stroke="#1e293b" strokeWidth={0.5} strokeDasharray="4 3" />
                          ))}

                          {/* Baseline */}
                          <line x1={PAD.left} y1={baseY} x2={PAD.left + plotW} y2={baseY} stroke="#334155" strokeWidth={1} />

                          {/* Standard fill + stroke (blue) */}
                          {stdFill && <polygon points={stdFill} fill="#1560bd" fillOpacity={0.18} stroke="none" />}
                          {stdLine && <polyline points={stdLine} fill="none" stroke="#1560bd" strokeWidth={1.5} />}

                          {/* Sample fill + stroke (orange) */}
                          {smpFill && <polygon points={smpFill} fill="#f97316" fillOpacity={0.22} stroke="none" />}
                          {smpLine && <polyline points={smpLine} fill="none" stroke="#f97316" strokeWidth={2} />}

                          {/* Standard integration lines */}
                          {sA > 0 && (<>
                            <line x1={intBound(stdMu,-1)} y1={intY(stdMu,stdHn,-1)} x2={intBound(stdMu,-1)} y2={baseY}
                              stroke="#1560bd" strokeWidth={1} strokeDasharray="3 2" opacity={0.7}/>
                            <line x1={intBound(stdMu, 1)} y1={intY(stdMu,stdHn, 1)} x2={intBound(stdMu, 1)} y2={baseY}
                              stroke="#1560bd" strokeWidth={1} strokeDasharray="3 2" opacity={0.7}/>
                          </>)}

                          {/* Sample integration lines */}
                          {mA > 0 && (<>
                            <line x1={intBound(smpMu,-1)} y1={intY(smpMu,smpHn,-1)} x2={intBound(smpMu,-1)} y2={baseY}
                              stroke="#f97316" strokeWidth={1} strokeDasharray="3 2" opacity={0.7}/>
                            <line x1={intBound(smpMu, 1)} y1={intY(smpMu,smpHn, 1)} x2={intBound(smpMu, 1)} y2={baseY}
                              stroke="#f97316" strokeWidth={1} strokeDasharray="3 2" opacity={0.7}/>
                          </>)}

                          {/* Standard label */}
                          {sA > 0 && (
                            <g style={{ cursor: "default" }}>
                              <title>Reference Standard — Area: {sA.toFixed(5)} mAU·s</title>
                              <text x={toSvgX(stdMu)} y={stdApexY}
                                textAnchor="middle" fontSize={8} fill="#60a5fa" fontFamily="Courier New, monospace" fontWeight="bold">
                                {sA.toFixed(3)} mAU·s
                              </text>
                              <text x={toSvgX(stdMu)} y={stdApexY + 9}
                                textAnchor="middle" fontSize={7} fill="#93c5fd" fontFamily="Courier New, monospace">
                                PADRÃO
                              </text>
                            </g>
                          )}

                          {/* Sample label — hover-sensitive group */}
                          {mA > 0 && (() => {
                            const px = toSvgX(smpMu);
                            const py = smpApexY;
                            return (
                              <g style={{ cursor: "crosshair" }}>
                                <title>Amostra Analisada — Area: {mA.toFixed(5)} mAU·s{sA > 0 ? ` | Ratio: ${(mA/sA).toFixed(5)}` : ""}</title>
                                {/* Invisible hit area */}
                                <rect x={px - 40} y={py - 8} width={80} height={plotH + 10} fill="transparent" />
                                <text x={px} y={py}
                                  textAnchor="middle" fontSize={9} fill="#fb923c" fontFamily="Courier New, monospace" fontWeight="bold">
                                  {mA.toFixed(3)} mAU·s
                                </text>
                                <text x={px} y={py + 10}
                                  textAnchor="middle" fontSize={7} fill="#fdba74" fontFamily="Courier New, monospace">
                                  AMOSTRA
                                </text>
                                {/* Vertical dotted line at apex */}
                                <line x1={px} y1={toSvgY(smpHn) + 2} x2={px} y2={baseY}
                                  stroke="#f97316" strokeWidth={0.8} strokeDasharray="2 3" opacity={0.45} />
                              </g>
                            );
                          })()}

                          {/* Y-axis ticks */}
                          {[0, 0.5, 1].map(v => (
                            <g key={v}>
                              <line x1={PAD.left - 4} y1={toSvgY(v)} x2={PAD.left} y2={toSvgY(v)} stroke="#475569" strokeWidth={0.8}/>
                              <text x={PAD.left - 6} y={toSvgY(v) + 3} textAnchor="end" fontSize={7} fill="#64748b" fontFamily="Courier New, monospace">
                                {v === 0 ? "0" : v === 0.5 ? "50%" : "100%"}
                              </text>
                            </g>
                          ))}

                          {/* X-axis labels */}
                          <text x={toSvgX(stdMu)} y={H - 6} textAnchor="middle" fontSize={7.5} fill="#1560bd" fontFamily="Courier New, monospace">Std</text>
                          <text x={toSvgX(smpMu)} y={H - 6} textAnchor="middle" fontSize={7.5} fill="#f97316" fontFamily="Courier New, monospace">Smp</text>
                        </svg>

                        {/* Live match indicator */}
                        {sA > 0 && mA > 0 && (() => {
                          const sessPeakArea = (() => {
                            const mp = peaks.find(p => padraoConfig.smpPeakName &&
                              (p.name === padraoConfig.smpPeakName || p.name === padraoConfig.compoundName));
                            if (!mp) return null;
                            return mp.manualArea > 0 ? mp.manualArea : computeArea(mp);
                          })();
                          if (!sessPeakArea) return null;
                          const diff = Math.abs(sessPeakArea - mA);
                          const pct  = (diff / sessPeakArea) * 100;
                          const ok   = pct < 0.1;
                          return (
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, padding: "3px 14px 5px", color: ok ? "#86efac" : "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
                              {ok
                                ? <span>✓ Sample Area coincide com o pico "{padraoConfig.smpPeakName}" no cromatograma ({sessPeakArea.toFixed(3)} mAU·s)</span>
                                : <span>⚠ Pico "{padraoConfig.smpPeakName}" no cromatograma = {sessPeakArea.toFixed(3)} mAU·s | digitado = {mA.toFixed(3)} mAU·s (Δ {pct.toFixed(1)}%)</span>}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Footer — formula hint */}
                  {ratioOk && (
                    <div style={{ padding: "5px 14px", background: "#f1f5f9", fontSize: 9, color: "#64748b", borderTop: "1px solid #e2e8f0" }}>
                      Amount = ({mA.toFixed(3)} ÷ {sA.toFixed(3)}) × {padraoConfig.stdAmountUg.toFixed(4)} µg × ({padraoConfig.stdPurity.toFixed(2)} ÷ 100) = <strong style={{ color: "#ea580c" }}>{foundAmountUg.toFixed(4)} µg</strong>
                      {padraoConfig.smpDeclaredAmountUg > 0 && (
                        <span style={{ marginLeft: 12, color: "#6366f1" }}>
                          vs. Declared {padraoConfig.smpDeclaredAmountUg.toFixed(2)} µg → <strong>{((foundAmountUg / padraoConfig.smpDeclaredAmountUg) * 100).toFixed(1)}%</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ─ Análise de Overage — apenas visual, não imprime ─ */}
            {padraoFoundUg > 0 && (() => {
              const declaredUg = padraoConfig.smpDeclaredAmountUg;
              const foundMg    = padraoFoundMg;
              const foundUg    = padraoFoundUg;
              const recovery   = declaredUg > 0 ? (foundUg / declaredUg) * 100 : padraoFoundPurity;
              // Look up specMin/specMax from active compound bank (values are in mg for this panel)
              const matchedComp  = activeCompounds.find(c =>
                padraoConfig.compoundName && c.name.toLowerCase().includes(padraoConfig.compoundName.toLowerCase())
              );
              const specMinMg = matchedComp && matchedComp.specMin > 0 ? matchedComp.specMin : 0;
              const specMaxMg = matchedComp && matchedComp.specMax > 0 ? matchedComp.specMax : 0;
              const hasSpec   = specMinMg > 0 || specMaxMg > 0;
              const inSpecMin = specMinMg > 0 ? foundMg >= specMinMg : true;
              const inSpecMax = specMaxMg > 0 ? foundMg <= specMaxMg : true;
              const inSpec    = hasSpec ? inSpecMin && inSpecMax : null;
              const overagePct = declaredUg > 0 ? recovery - 100 : 0;
              const recovColor = recovery >= 98 ? "#16a34a" : recovery >= 80 ? "#d97706" : "#dc2626";
              return (
                <div className="no-print" style={{ marginBottom: 18, border: "2px solid #6366f1", borderRadius: 8, overflow: "hidden", fontFamily: "Courier New, monospace" }}>
                  {/* Header */}
                  <div style={{ background: "#4f46e5", padding: "7px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: "bold", color: "#fff", letterSpacing: "0.04em" }}>
                      ⚗ ANÁLISE DE OVERAGE — apenas para cálculo (não imprime)
                    </span>
                    {padraoConfig.compoundName && (
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#c7d2fe", fontWeight: 600 }}>
                        {padraoConfig.compoundName}
                      </span>
                    )}
                  </div>
                  <div style={{ background: "#f5f3ff", padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px" }}>
                    {/* Quantidade encontrada */}
                    <div>
                      <div style={{ fontSize: 8.5, color: "#6366f1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Encontrado</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#1e1b4b" }}>{foundMg >= 1 ? `${foundMg.toFixed(3)} mg` : `${foundUg.toFixed(3)} µg`}</div>
                      {declaredUg > 0 && (
                        <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                          declarado: {declaredUg >= 1000 ? `${(declaredUg/1000).toFixed(3)} mg` : `${declaredUg.toFixed(3)} µg`}
                        </div>
                      )}
                    </div>
                    {/* Recovery / Teor */}
                    <div>
                      <div style={{ fontSize: 8.5, color: "#6366f1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Teor (recovery)</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: recovColor }}>{recovery.toFixed(2)}%</div>
                      {declaredUg > 0 && (
                        <div style={{ fontSize: 9, marginTop: 2, color: overagePct >= 0 ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                          {overagePct >= 0
                            ? `+${overagePct.toFixed(2)}% overage`
                            : `${overagePct.toFixed(2)}% déficit`}
                        </div>
                      )}
                    </div>
                    {/* Faixa de especificação */}
                    <div>
                      <div style={{ fontSize: 8.5, color: "#6366f1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Faixa (especificação)</div>
                      {hasSpec ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e1b4b" }}>
                            {specMinMg > 0 ? `${specMinMg} mg` : "—"} – {specMaxMg > 0 ? `${specMaxMg} mg` : "—"}
                          </div>
                          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 9, color: inSpecMin ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                              {inSpecMin ? "✓" : "✗"} {inSpecMin ? "acima do mínimo" : "abaixo do mínimo"}
                            </span>
                            {specMaxMg > 0 && (
                              <span style={{ fontSize: 9, color: inSpecMax ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                                {inSpecMax ? "✓" : "✗"} {inSpecMax ? "abaixo do máximo" : "acima do máximo"}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>
                          Configure specMin/specMax no banco de compostos
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Status final */}
                  <div style={{ background: inSpec === null ? "#f1f5f9" : inSpec ? "#dcfce7" : "#fef2f2", padding: "6px 16px", borderTop: "1px solid #e0e7ff", display: "flex", alignItems: "center", gap: 10, fontSize: 10 }}>
                    {inSpec === null ? (
                      <span style={{ color: "#64748b" }}>ℹ Defina specMin/specMax no composto para avaliação de conformidade</span>
                    ) : inSpec ? (
                      <>
                        <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓ dentro da faixa</span>
                        <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓ dentro do padrão</span>
                        {declaredUg > 0 && overagePct >= 0
                          ? <span style={{ color: "#16a34a" }}>sem overage adicional necessário</span>
                          : declaredUg > 0
                          ? <span style={{ color: "#d97706", fontWeight: "bold" }}>⚠ overage necessário: +{Math.abs(overagePct).toFixed(2)}%</span>
                          : null}
                      </>
                    ) : (
                      <>
                        {!inSpecMin && <span style={{ color: "#dc2626", fontWeight: "bold" }}>✗ abaixo do mínimo ({specMinMg} mg)</span>}
                        {!inSpecMax && <span style={{ color: "#dc2626", fontWeight: "bold" }}>✗ acima do máximo ({specMaxMg} mg)</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ─ Conformidade ANVISA ─ */}
            {(() => {
              const labelMg    = padraoConfig.anvisaLabelAmountMg;
              const minMg      = padraoConfig.anvisaMinMg;
              const maxMg      = padraoConfig.anvisaMaxMg;
              const norm       = padraoConfig.anvisaNorm || "IN 28/2018";
              // Use direct override if set (from "Aplicar" in Concentração Inicial), else area-based
              const foundMgAnv = padraoConfig.anvisaFoundMgOverride > 0
                ? padraoConfig.anvisaFoundMgOverride
                : foundAmountMg;
              const hasFound   = foundMgAnv > 0;
              // pctLabel = sempre igual a "Teor (recovery)" — mesma fórmula exata, sem exceção.
              const _declUg = padraoConfig.smpDeclaredAmountUg;
              const pctLabel: number | null = padraoExtHasData
                ? (_declUg > 0
                  ? (padraoFoundUg / _declUg) * 100
                  : padraoFoundPurity > 0 ? padraoFoundPurity : null)
                : null;
              const inMin      = minMg > 0 ? foundMgAnv >= minMg : null;
              const inMax      = maxMg > 0 ? foundMgAnv <= maxMg : null;
              const inRange    = (inMin !== null || inMax !== null)
                ? (inMin !== false && inMax !== false)
                : null;
              const rangeColor = inRange === null ? "#64748b" : inRange ? "#16a34a" : "#dc2626";
              return (
                <div style={{ marginBottom: 18, border: "2px solid #0ea5e9", borderRadius: 8, overflow: "hidden", fontFamily: "Courier New, monospace" }}>
                  {/* Header */}
                  <div style={{ background: "#0369a1", padding: "7px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: "bold", color: "#fff", letterSpacing: "0.04em" }}>
                      🇧🇷 CONFORMIDADE ANVISA
                    </span>
                    <span style={{ fontSize: 9, color: "#bae6fd", marginLeft: 4 }}>{norm}</span>
                    {inRange !== null && (
                      <span style={{
                        marginLeft: "auto", fontSize: 10, fontWeight: "bold",
                        color: inRange ? "#16a34a" : "#dc2626",
                        background: inRange ? "#dcfce7" : "#fef2f2",
                        border: `1px solid ${inRange ? "#86efac" : "#fca5a5"}`,
                        borderRadius: 10, padding: "1px 10px",
                      }}>
                        {inRange ? "✓ dentro da faixa" : "✗ fora da faixa"}
                      </span>
                    )}
                  </div>

                  {/* ── Compound selector ── */}
                  <div style={{ background: "#e0f2fe", padding: "6px 14px", borderBottom: "1px solid #bae6fd", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, fontWeight: "bold", color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Compound:</span>
                    <select
                      value={padraoConfig.compoundName}
                      onChange={e => {
                        const name = e.target.value;
                        const comp = activeCompounds.find(c => c.name === name);
                        updatePadrao({ compoundName: name });
                        if (comp) {
                          const hasCustom = (comp.anvisaMinMg ?? 0) > 0 || (comp.anvisaMaxMg ?? 0) > 0;
                          const dbEntry = ANVISA_IN28_DB.find(d => d.compoundId === comp.id);
                          if (hasCustom) {
                            updatePadrao({
                              anvisaMinMg: comp.anvisaMinMg ?? 0,
                              anvisaMaxMg: comp.anvisaMaxMg ?? 0,
                              anvisaNorm:  comp.anvisaNorm ?? "IN 28/2018",
                            });
                          } else if (dbEntry) {
                            updatePadrao({
                              anvisaMinMg: dbEntry.minMg,
                              anvisaMaxMg: dbEntry.maxMg,
                              anvisaNorm:  dbEntry.norm,
                            });
                          }
                        }
                      }}
                      style={{
                        fontFamily: "Courier New, monospace", fontSize: 10,
                        padding: "2px 6px", border: "1px solid #7dd3fc",
                        borderRadius: 4, background: "#fff", color: "#0c4a6e",
                        flex: 1, minWidth: 140, maxWidth: 280,
                      }}
                    >
                      <option value="">— selecionar compound —</option>
                      {activeCompounds.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    {(() => {
                      const comp = activeCompounds.find(c => c.name === padraoConfig.compoundName);
                      const dbEntry = comp ? ANVISA_IN28_DB.find(d => d.compoundId === comp.id) : null;
                      if (!dbEntry) return null;
                      return (
                        <button
                          onClick={() => updatePadrao({ anvisaMinMg: dbEntry.minMg, anvisaMaxMg: dbEntry.maxMg, anvisaNorm: dbEntry.norm })}
                          title={`Preencher faixas de ${dbEntry.name}: mín ${dbEntry.minMg} mg / máx ${dbEntry.maxMg} mg`}
                          style={{
                            fontFamily: "Courier New, monospace", fontSize: 8.5,
                            padding: "2px 8px",
                            border: "1px solid #0369a1", borderRadius: 3,
                            background: "#0369a1", color: "#fff",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          ↓ IN 28/2018: {dbEntry.minMg}–{dbEntry.maxMg} mg
                        </button>
                      );
                    })()}
                  </div>

                  {/* Input row */}
                  {(() => {
                    const useUg     = padraoConfig.anvisaUseUg;
                    const unitLabel = useUg ? "µg" : "mg";
                    const dispMin   = useUg ? minMg * 1000 : minMg;
                    const dispMax   = useUg ? maxMg * 1000 : maxMg;
                    const UnitToggle = () => (
                      <button
                        onClick={() => updatePadrao({ anvisaUseUg: !useUg })}
                        title={useUg ? "Trocar para mg" : "Trocar para µg"}
                        style={{
                          fontFamily: "Courier New, monospace", fontSize: 8, padding: "1px 6px",
                          border: "1px solid #7dd3fc", borderRadius: 3,
                          background: useUg ? "#0369a1" : "#e0f2fe",
                          color: useUg ? "#fff" : "#0369a1",
                          cursor: "pointer", marginLeft: 5, fontWeight: 600,
                        }}
                      >{useUg ? "µg ↔ mg" : "mg ↔ µg"}</button>
                    );
                    return (
                      <div style={{ background: "#f0f9ff", padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.4fr", gap: "8px 16px", borderBottom: "1px solid #bae6fd" }}>
                        {/* helper: parse accepting both . and , as decimal separator */}
                        {(() => {
                          const parseL = (s: string) => parseFloat(s.trim().replace(/,/g, ".")) || 0;
                          const fmtDisp = (v: number) => v > 0 ? String(v) : "";
                          const INP_S = { width: "100%", fontFamily: "Courier New, monospace", fontSize: 11, padding: "3px 6px", border: "1px solid #bae6fd", borderRadius: 4, background: "#fff" } as const;
                          return (
                            <>
                              <div>
                                <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, display: "flex", alignItems: "center" }}>
                                  Qtd. declarada no rótulo ({unitLabel})<UnitToggle />
                                </div>
                                <input
                                  key={`anvisa-label-${useUg}-${useUg ? labelMg * 1000 : labelMg}`}
                                  type="text" inputMode="decimal"
                                  placeholder={useUg ? "ex: 40 ou 0,040 mg→µg" : "ex: 0,040 ou 40,00"}
                                  defaultValue={fmtDisp(useUg ? labelMg * 1000 : labelMg)}
                                  onBlur={e => {
                                    const v = parseL(e.target.value);
                                    updatePadrao({ anvisaLabelAmountMg: useUg ? v / 1000 : v });
                                  }}
                                  style={INP_S}
                                />
                                {labelMg > 0 && (
                                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#64748b", marginTop: 1 }}>
                                    {useUg ? `= ${labelMg.toFixed(4)} mg` : `= ${(labelMg * 1000).toFixed(2)} µg`}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, display: "flex", alignItems: "center" }}>
                                  Faixa mín ANVISA ({unitLabel})<UnitToggle />
                                </div>
                                <input
                                  key={`anvisa-min-${useUg}-${dispMin}`}
                                  type="text" inputMode="decimal"
                                  placeholder={useUg ? "ex: 18 ou 0,018 mg→µg" : "ex: 0,018 ou 18,00"}
                                  defaultValue={fmtDisp(dispMin)}
                                  onBlur={e => {
                                    const v = parseL(e.target.value);
                                    const newMin = useUg ? v / 1000 : v;
                                    updatePadrao({ anvisaMinMg: newMin });
                                    syncAnvisaToCompound(padraoConfig.compoundName, newMin, padraoConfig.anvisaMaxMg, padraoConfig.anvisaNorm);
                                  }}
                                  style={INP_S}
                                />
                                {minMg > 0 && (
                                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#64748b", marginTop: 1 }}>
                                    {useUg ? `= ${minMg.toFixed(4)} mg` : `= ${(minMg * 1000).toFixed(2)} µg`}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, display: "flex", alignItems: "center" }}>
                                  Faixa máx ANVISA ({unitLabel})<UnitToggle />
                                </div>
                                <input
                                  key={`anvisa-max-${useUg}-${dispMax}`}
                                  type="text" inputMode="decimal"
                                  placeholder={useUg ? "ex: 22 ou 0,022 mg→µg" : "ex: 0,022 ou 22,00"}
                                  defaultValue={fmtDisp(dispMax)}
                                  onBlur={e => {
                                    const v = parseL(e.target.value);
                                    const newMax = useUg ? v / 1000 : v;
                                    updatePadrao({ anvisaMaxMg: newMax });
                                    syncAnvisaToCompound(padraoConfig.compoundName, padraoConfig.anvisaMinMg, newMax, padraoConfig.anvisaNorm);
                                  }}
                                  style={INP_S}
                                />
                                {maxMg > 0 && (
                                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 8, color: "#64748b", marginTop: 1 }}>
                                    {useUg ? `= ${maxMg.toFixed(4)} mg` : `= ${(maxMg * 1000).toFixed(2)} µg`}
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                        <div>
                          <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Norma de referência</div>
                          <input
                            type="text"
                            placeholder="ex: IN 28/2018"
                            value={norm}
                            onChange={e => {
                              updatePadrao({ anvisaNorm: e.target.value });
                              syncAnvisaToCompound(padraoConfig.compoundName, padraoConfig.anvisaMinMg, padraoConfig.anvisaMaxMg, e.target.value);
                            }}
                            style={{ width: "100%", fontFamily: "Courier New, monospace", fontSize: 11, padding: "3px 6px", border: "1px solid #bae6fd", borderRadius: 4, background: "#fff" }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Result display */}
                  <div style={{ background: "#fff", padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px" }}>
                    {/* Encontrado — editável → back-calcula smpArea */}
                    {(() => {
                      const useUgR = padraoConfig.anvisaUseUg;
                      const dispFound = useUgR ? foundMgAnv * 1000 : foundMgAnv;
                      const unitR = useUgR ? "µg" : "mg";
                      const altUnit = useUgR ? "mg" : "µg";
                      const altFound = useUgR ? foundMgAnv.toFixed(5) : (foundMgAnv * 1000).toFixed(5);
                      const parseL = (s: string) => parseFloat(s.trim().replace(/,/g, ".")) || 0;
                      const fmtFound = dispFound > 0 ? dispFound.toFixed(5) : "";
                      return (
                      <div>
                        <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          Encontrado na análise
                          <span style={{ fontWeight: "normal", color: "#64748b", fontSize: 8, textTransform: "none" }}>✏ editável</span>
                          <button
                            onClick={() => updatePadrao({ anvisaUseUg: !useUgR })}
                            title={useUgR ? "Trocar para mg" : "Trocar para µg"}
                            style={{ fontFamily: "Courier New, monospace", fontSize: 7.5, padding: "1px 5px", border: "1px solid #7dd3fc", borderRadius: 3, background: useUgR ? "#0369a1" : "#e0f2fe", color: useUgR ? "#fff" : "#0369a1", cursor: "pointer", fontWeight: 600 }}
                          >{useUgR ? "µg ↔ mg" : "mg ↔ µg"}</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <input
                            key={`found-${useUgR}-${fmtFound}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={fmtFound}
                            placeholder="0,00000"
                            onBlur={e => {
                              const entered = parseL(e.target.value);
                              updatePadrao({ anvisaFoundMgOverride: useUgR ? entered / 1000 : entered });
                            }}
                            style={{
                              width: "100%", fontFamily: "Courier New, monospace",
                              fontSize: 16, fontWeight: 900, color: "#0c4a6e",
                              border: "none", borderBottom: "2px dashed #bae6fd",
                              background: "transparent", outline: "none", padding: "0 2px",
                            }}
                          />
                          <span style={{ fontSize: 12, fontWeight: "bold", color: "#0c4a6e", whiteSpace: "nowrap" }}>{unitR}</span>
                        </div>
                        <div style={{ fontSize: 8.5, color: "#0369a1", marginTop: 3 }}>
                          = {altFound} {altUnit}
                        </div>
                        {padraoConfig.anvisaFoundMgOverride > 0 ? (
                          <div style={{ fontSize: 8, color: "#16a34a", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                            <span>✓ valor aplicado da Conc. Inicial</span>
                            <button
                              onClick={() => updatePadrao({ anvisaFoundMgOverride: 0 })}
                              style={{ fontSize: 7.5, padding: "1px 5px", border: "1px solid #86efac", borderRadius: 3, background: "#f0fdf4", cursor: "pointer", color: "#15803d" }}
                            >limpar</button>
                          </div>
                        ) : hasFound && padraoConfig.smpArea > 0 ? (
                          <div style={{ fontSize: 8, color: "#64748b", marginTop: 1 }}>
                            via área: {padraoConfig.smpArea.toFixed(3)} mAU·s
                          </div>
                        ) : null}
                        {labelMg > 0 && hasFound && (
                          <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                            rótulo: {useUgR ? `${(labelMg * 1000).toFixed(5)} µg` : `${labelMg.toFixed(5)} mg`}
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    {/* % vs rótulo */}
                    <div>
                      <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                        % Encontrado na Amostra Analisada
                      </div>
                      {pctLabel !== null ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 900, color: pctLabel >= 80 && pctLabel <= 120 ? "#16a34a" : "#dc2626" }}>
                            {pctLabel.toFixed(2)}%
                          </div>
                          <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                            {pctLabel >= 100 ? `+${(pctLabel - 100).toFixed(2)}% overage` : `-${(100 - pctLabel).toFixed(2)}% déficit`}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                          {labelMg > 0 ? "aguardando análise" : "informe a qtd. do rótulo"}
                        </div>
                      )}
                    </div>

                    {/* Faixa ANVISA */}
                    {(() => {
                      const useUgF = padraoConfig.anvisaUseUg;
                      const unitF = useUgF ? "µg" : "mg";
                      const fmtMin = useUgF ? (minMg * 1000).toFixed(2) : minMg.toFixed(2);
                      const fmtMax = useUgF ? (maxMg * 1000).toFixed(2) : maxMg.toFixed(2);
                      return (
                      <div>
                        <div style={{ fontSize: 8.5, color: "#0369a1", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                          Faixa de aceitação ANVISA
                        </div>
                        {(minMg > 0 || maxMg > 0) ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>
                              {minMg > 0 ? `${fmtMin} ${unitF}` : "—"} – {maxMg > 0 ? `${fmtMax} ${unitF}` : "—"}
                            </div>
                            <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>{norm}</div>
                            {hasFound && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {inMin !== null && (
                                  <span style={{ fontSize: 9, fontWeight: "bold", color: inMin ? "#16a34a" : "#dc2626" }}>
                                    {inMin ? "✓" : "✗"} {inMin ? `acima do mín. (${fmtMin} ${unitF})` : `abaixo do mín. (${fmtMin} ${unitF})`}
                                  </span>
                                )}
                                {inMax !== null && (
                                  <span style={{ fontSize: 9, fontWeight: "bold", color: inMax ? "#16a34a" : "#dc2626" }}>
                                    {inMax ? "✓" : "✗"} {inMax ? `abaixo do máx. (${fmtMax} ${unitF})` : `acima do máx. (${fmtMax} ${unitF})`}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>
                            informe a faixa mín. e máx.
                          </div>
                        )}
                      </div>
                      );
                    })()}
                  </div>

                  {/* Status footer */}
                  {(() => {
                    const useUgS = padraoConfig.anvisaUseUg;
                    const unitS = useUgS ? "µg" : "mg";
                    const fmt4 = (n: number) => parseFloat(n.toFixed(4)).toString();
                    const fFound = useUgS ? fmt4(foundMgAnv * 1000) : fmt4(foundMgAnv);
                    const fMin   = useUgS ? fmt4(minMg * 1000) : fmt4(minMg);
                    const fMax   = useUgS ? fmt4(maxMg * 1000) : fmt4(maxMg);
                    return (
                  <div style={{
                    background: inRange === null ? "#f1f5f9" : inRange ? "#dcfce7" : "#fef2f2",
                    padding: "7px 16px", borderTop: "1px solid #bae6fd",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 10,
                    fontFamily: "Courier New, monospace",
                  }}>
                    {inRange === null ? (
                      <span style={{ color: "#64748b" }}>
                        ℹ Preencha os campos acima para avaliar a conformidade com a norma ANVISA
                      </span>
                    ) : inRange ? (
                      <>
                        <span style={{ fontWeight: "bold", color: "#16a34a", fontSize: 12 }}>✓ CONFORME — dentro da faixa {norm}</span>
                        {hasFound && minMg > 0 && maxMg > 0 && (
                          <span style={{ color: "#15803d", marginLeft: 8 }}>
                            {fFound} {unitS} está entre {fMin} e {fMax} {unitS}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: "bold", color: "#dc2626", fontSize: 12 }}>✗ NÃO CONFORME — fora da faixa {norm}</span>
                        {inMin === false && (
                          <span style={{ color: "#dc2626" }}>encontrado {fFound} {unitS} &lt; mín {fMin} {unitS}</span>
                        )}
                        {inMax === false && (
                          <span style={{ color: "#dc2626" }}>encontrado {fFound} {unitS} &gt; máx {fMax} {unitS}</span>
                        )}
                      </>
                    )}
                  </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ─ Results ─ */}
            <div style={{ ...CARD, marginBottom: 18 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: "bold", color: "#1e293b", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap style={{ width: 14, height: 14, color: "#f59e0b" }} />
                Result — External Standard Quantification
              </div>

              {(() => {
                const padraoAlerts = validatePadrao(padraoConfig);
                const padraoErrors = padraoAlerts.filter(a => a.severity === "error");
                const padraoWarnings = padraoAlerts.filter(a => a.severity === "warning");
                return (
                  <>
                    {padraoAlerts.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        {padraoErrors.map((a, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "Courier New, monospace", fontSize: 10, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 5, padding: "6px 10px", marginBottom: 4, color: "#991b1b" }}>
                            <XCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                            <span>{a.message}</span>
                          </div>
                        ))}
                        {padraoWarnings.map((a, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "Courier New, monospace", fontSize: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 5, padding: "6px 10px", marginBottom: 4, color: "#92400e" }}>
                            <Activity style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                            <span>{a.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              {!hasData ? (
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#94a3b8", padding: "24px 0", textAlign: "center" }}>
                  Fill in the Standard Area, Injected Amount and Sample Area to calculate.
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
                    <ResultCell
                      value={`${displaySmpPurity.toFixed(2)} %`}
                      label={hasSmpPurity ? "Pureza da amostra (digitada)" : "Purity vs. Standard (area)"}
                      color={displaySmpPurity >= 98 ? "#16a34a" : displaySmpPurity >= 90 ? "#d97706" : "#dc2626"}
                      big
                      fieldId={hasSmpPurity ? "padrao-row-smpPurity" : "padrao-row-smpArea"}
                      trace={buildCalcTrace(
                        hasSmpPurity ? "Pureza da amostra (digitada)" : "Purity vs. Standard (area)",
                        `${displaySmpPurity.toFixed(2)} %`, "external_standard",
                        hasSmpPurity
                          ? "Pureza digitada diretamente pelo operador"
                          : "Purity (%) = (SampleArea / StandardArea) × StandardPurity",
                        hasSmpPurity
                          ? [
                              { label: "Entered sample purity", value: `${padraoConfig.smpPurity.toFixed(2)} %`, source: "Standard tab" },
                              { label: "Calculated purity (area ratio)", value: `${purityCalc.toFixed(2)} %`, source: "Calculated" },
                            ]
                          : [
                              { label: "Sample Area", value: `${smpArea.toFixed(5)} mAU·s`, source: "Standard tab" },
                              { label: "Standard Area", value: `${stdArea.toFixed(5)} mAU·s`, source: "Standard tab" },
                              { label: "Standard Purity", value: `${padraoConfig.stdPurity.toFixed(2)} %`, source: "Standard tab" },
                              { label: "Ratio (Smp/Std)", value: ratio.toFixed(6), source: "Calculated" },
                            ],
                        "Standard",
                        { compoundName: padraoConfig.compoundName, standardRef: padraoConfig.stdPeakName,
                          warningText: displaySmpPurity < 90 ? "Result below 90% — verify standard and sample peaks" : undefined }
                      )}
                    />
                    {purityVsDecl !== null && (
                      <ResultCell
                        value={`${purityVsDecl.toFixed(2)} %`}
                        label="Purity vs. Declared"
                        color={purityVsDecl >= 98 ? "#16a34a" : purityVsDecl >= 90 ? "#d97706" : "#dc2626"}
                        fieldId="padrao-row-smpDeclared"
                      />
                    )}
                    <ResultCell value={`${foundAmountUg.toFixed(4)} µg`} label="Found amount (µg)"
                      fieldId="padrao-row-smpArea"
                      trace={buildCalcTrace(
                        "Found Amount", `${foundAmountUg.toFixed(4)} µg`, "external_standard",
                        "Amount (µg) = (SampleArea / StandardArea) × StandardAmount × (Purity / 100)",
                        [
                          { label: "Sample Area", value: `${smpArea.toFixed(5)} mAU·s`, source: "Standard tab" },
                          { label: "Standard Area", value: `${stdArea.toFixed(5)} mAU·s`, source: "Standard tab" },
                          { label: "Standard Amount", value: `${padraoConfig.stdAmountUg.toFixed(4)} µg`, source: "Standard tab" },
                          { label: "Standard Purity", value: `${padraoConfig.stdPurity.toFixed(2)} %`, source: "Standard tab" },
                        ],
                        "Standard",
                        { compoundName: padraoConfig.compoundName }
                      )}
                    />
                    <ResultCell value={`${foundAmountMg.toFixed(6)} mg`} label="Found amount (mg)"
                      fieldId="padrao-row-smpArea"
                      trace={buildCalcTrace(
                        "Found Amount (mg)", `${foundAmountMg.toFixed(6)} mg`, "external_standard",
                        "Amount (mg) = FoundAmount (µg) / 1000",
                        [{ label: "Found Amount (µg)", value: `${foundAmountUg.toFixed(4)} µg`, source: "Calculated" }],
                        "Standard"
                      )}
                    />
                  </div>

                  {/* Detailed table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#475569", fontWeight: 700 }}>Parameter</th>
                        <th style={{ textAlign: "right", padding: "6px 10px", color: "#475569", fontWeight: 700 }}>Standard</th>
                        <th style={{ textAlign: "right", padding: "6px 10px", color: "#475569", fontWeight: 700 }}>Sample</th>
                        <th style={{ textAlign: "right", padding: "6px 10px", color: "#475569", fontWeight: 700 }}>Ratio (S/A)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { label: "Compound", std: padraoConfig.compoundName || "—", smp: padraoConfig.smpPeakName || "—", ratio: "", stdFieldId: "padrao-row-compound", smpFieldId: "padrao-row-compound" },
                        { label: "Peak (reference)", std: padraoConfig.stdPeakName || "—", smp: padraoConfig.smpPeakName || "—", ratio: "", stdFieldId: "padrao-row-compound", smpFieldId: "padrao-row-compound" },
                        { label: "Area (mAU·s)", std: stdArea.toFixed(5), smp: smpArea.toFixed(5), ratio: ratio.toFixed(6), stdFieldId: "padrao-row-stdArea", smpFieldId: "padrao-row-smpArea" },
                        { label: "Injected amount (µg)", std: padraoConfig.stdAmountUg.toFixed(4), smp: foundAmountUg.toFixed(4), ratio: ratio.toFixed(6), stdFieldId: "padrao-row-stdAmountUg", smpFieldId: "padrao-row-smpArea" },
                        { label: "Purity (%)", std: padraoConfig.stdPurity.toFixed(2), smp: displaySmpPurity.toFixed(2), ratio: "", stdFieldId: "padrao-row-stdPurity", smpFieldId: "padrao-row-smpArea" },
                        { label: "Found amount (µg)", std: (padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100)).toFixed(4), smp: foundAmountUg.toFixed(4), ratio: "", stdFieldId: undefined, smpFieldId: "padrao-row-smpArea" },
                        { label: "Found amount (mg)", std: (padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100) / 1000).toFixed(6), smp: foundAmountMg.toFixed(6), ratio: "", stdFieldId: undefined, smpFieldId: "padrao-row-smpArea" },
                        ...(foundAmountFromPurityUg !== null ? [
                          { label: "Found amount — purity (µg)", std: (padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100)).toFixed(4), smp: foundAmountFromPurityUg.toFixed(4), ratio: "", stdFieldId: undefined, smpFieldId: "padrao-row-smpPurity" },
                          { label: "Found amount — purity (mg)", std: (padraoConfig.stdAmountUg * (padraoConfig.stdPurity / 100) / 1000).toFixed(6), smp: foundAmountFromPurityMg!.toFixed(6), ratio: "", stdFieldId: undefined, smpFieldId: "padrao-row-smpPurity" },
                        ] : []),
                      ] as { label: string; std: string; smp: string; ratio: string; stdFieldId?: string; smpFieldId?: string }[]).map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "5px 10px", color: "#334155" }}>{row.label}</td>
                          <td
                            onClick={row.stdFieldId ? () => scrollToField(row.stdFieldId!) : undefined}
                            title={row.stdFieldId ? "Clique para ir ao campo de entrada" : undefined}
                            style={{ padding: "5px 10px", textAlign: "right", color: "#1560bd", cursor: row.stdFieldId ? "pointer" : "default" }}
                          >{row.std}{row.stdFieldId && row.std !== "—" && <span style={{ fontSize: 8, color: "#94a3b8", marginLeft: 3 }}>↑</span>}</td>
                          <td
                            onClick={row.smpFieldId ? () => scrollToField(row.smpFieldId!) : undefined}
                            title={row.smpFieldId ? "Clique para ir ao campo de entrada" : undefined}
                            style={{ padding: "5px 10px", textAlign: "right", color: "#f97316", fontWeight: row.label.startsWith("Pureza") || row.label.startsWith("Teor") ? 700 : 400, cursor: row.smpFieldId ? "pointer" : "default" }}
                          >{row.smp}{row.smpFieldId && row.smp !== "—" && <span style={{ fontSize: 8, color: "#94a3b8", marginLeft: 3 }}>↑</span>}</td>
                          <td style={{ padding: "5px 10px", textAlign: "right", color: "#64748b" }}>{row.ratio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Formula reference */}
                  <div style={{ marginTop: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 4, border: "1px solid #e2e8f0", fontFamily: "Courier New, monospace", fontSize: 10, color: "#64748b" }}>
                    <strong>Applied formula:</strong>
                    {"  "}Amount (µg) = (Sample Area / Standard Area) × Standard Amount (µg) × (Standard Purity / 100)
                    {"  |  "}
                    {hasSmpPurity
                      ? <>Purity (%) = <strong style={{ color: "#f97316" }}>digitada pelo operador</strong>{" | "}Purity ratio = (Smp Area / Std Area) × Std Purity (%){foundAmountFromPurityUg !== null ? " | Found (purity) = Declared (µg) × (Purity / 100)" : ""}</>
                      : "Purity (%) = (Sample Area / Standard Area) × Standard Purity (%)"}
                  </div>
                </>
              )}
            </div>

            {/* ─ Analysis context (sample info from chromatogram tab) ─ */}
            <div style={{ ...CARD, marginBottom: 18 }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#475569", marginBottom: 8 }}>
                Analysis Context — Sample Information
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 12px", fontFamily: "Courier New, monospace", fontSize: 10 }}>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>Sample name:</span>
                <span style={{ color: "#0f172a" }}>{sample.sampleName || "—"}</span>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>Operator:</span>
                <span style={{ color: "#0f172a" }}>{sample.acqOperator || "—"}</span>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>Injection date:</span>
                <span style={{ color: "#0f172a" }}>{sample.injectionDate || "—"}</span>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>Method:</span>
                <span style={{ color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sample.acqMethod ? sample.acqMethod.split("\\").pop() || sample.acqMethod : "—"}
                </span>
                <span style={{ color: "#94a3b8", textAlign: "right" }}>Inj. volume:</span>
                <span style={{ color: "#0f172a" }}>{sample.injVolume || "—"}</span>
              </div>
            </div>

            {/* ─ ChemStation-style External Standard Integration Result ─ */}
            {padraoExtHasData && (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 6, padding: "12px 16px", marginBottom: 18, fontFamily: "Courier New, monospace" }}>
                <div style={{ fontSize: 11, fontWeight: "bold", color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>✓</span> External Standard — Integration Result
                  <span style={{ fontWeight: "normal", fontSize: 9, color: "#6b7280", marginLeft: 4 }}>
                    Ref: {padraoConfig.stdPeakName} · {padraoConfig.compoundName}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ whiteSpace: "pre", fontSize: 10, color: "#64748b" }}>{"  RetTime  Type     Area(mAU·s)    Found(µg)    Found(mg)    Purity(%)   Name"}</div>
                  <div style={{ whiteSpace: "pre", fontSize: 10, color: "#64748b" }}>{"  --------|------|--------------|------------|------------|-----------|--------------------"}</div>
                  <div style={{ whiteSpace: "pre", fontSize: 10, color: "#1560bd" }}>
                    {`  ${String(padraoConfig.stdPeakName.match(/\d+\.\d+/)?.[0] ?? "std").padStart(7)}  STD  ${padraoConfig.stdArea.toFixed(5).padStart(14)} ${padraoConfig.stdAmountUg.toFixed(4).padStart(12)} ${(padraoConfig.stdAmountUg / 1000).toFixed(6).padStart(12)} ${padraoConfig.stdPurity.toFixed(2).padStart(11)}   ${padraoConfig.compoundName} [standard]`}
                  </div>
                  <div style={{ whiteSpace: "pre", fontSize: 11, fontWeight: "bold", color: "#ea580c" }}>
                    {(() => {
                      const matchedPeak = peakStats.find(p => isPadraoSamplePeak(p));
                      const rtVal = padraoSmpRT > 0 ? padraoSmpRT : (matchedPeak ? matchedPeak.retentionTime : 0);
                      const rtStr = rtVal > 0 ? rtVal.toFixed(3) : "?.???";
                      return `  ${String(rtStr).padStart(7)}  MM   ${padraoConfig.smpArea.toFixed(5).padStart(14)} ${padraoFoundUg.toFixed(4).padStart(12)} ${padraoFoundMg.toFixed(6).padStart(12)} ${"".padStart(11)}   ${padraoConfig.compoundName} [sample]`;
                    })()}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 9, color: "#6b7280", borderTop: "1px solid #bbf7d0", paddingTop: 6 }}>
                  {"Formula: Amount(µg) = (SmpArea ÷ StdArea) × StdAmount × (StdPurity ÷ 100)" +
                    (padraoConfig.smpPurity > 0 && Math.abs(padraoConfig.smpPurity - 100) > 0.01 ? ` · Purity entered by operator (${padraoConfig.smpPurity.toFixed(2)}%)` : "") +
                    (padraoConfig.smpRawArea > 0 ? ` · Raw area: ${padraoConfig.smpRawArea.toFixed(5)} mAU·s → corrected: ${padraoConfig.smpArea.toFixed(5)}` : "")}
                </div>
              </div>
            )}

            {/* ─ Lot selector + analyzed lots table ─ */}
            {relevantLots.length > 0 && (
              <>
                {/* Lot selector — operator picks which lots go into the report */}
                <div style={{ ...CARD, marginBottom: 12 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#475569", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    Lot Selection for Report
                    <span style={{ fontWeight: "normal", fontSize: 9, color: "#94a3b8" }}>
                      {padraoConfig.selectedLotIds.length === 0
                        ? `All ${relevantLots.length} lot${relevantLots.length !== 1 ? "s" : ""} selected`
                        : `${padraoConfig.selectedLotIds.length} of ${relevantLots.length} selected`}
                    </span>
                    {padraoConfig.selectedLotIds.length > 0 && (
                      <button
                        onClick={() => updatePadrao({ selectedLotIds: [] })}
                        style={{ fontFamily: "Courier New, monospace", fontSize: 9, padding: "1px 7px", border: "1px solid #e2e8f0", borderRadius: 3, background: "#f8fafc", cursor: "pointer", color: "#94a3b8", marginLeft: "auto" }}
                      >
                        Clear selection (all)
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {relevantLots.map(lot => {
                      const selected = padraoConfig.selectedLotIds.length === 0 || padraoConfig.selectedLotIds.includes(lot.id);
                      const checked = padraoConfig.selectedLotIds.includes(lot.id);
                      return (
                        <label
                          key={lot.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                            fontFamily: "Courier New, monospace", fontSize: 10,
                            padding: "4px 10px", borderRadius: 4,
                            border: `1px solid ${selected ? "#93c5fd" : "#e2e8f0"}`,
                            background: selected ? "#eff6ff" : "#f8fafc",
                            color: selected ? "#1d4ed8" : "#94a3b8",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={padraoConfig.selectedLotIds.length === 0 || checked}
                            onChange={() => {
                              if (padraoConfig.selectedLotIds.length === 0) {
                                // Going from "all" to "specific" — select all except this one
                                updatePadrao({ selectedLotIds: relevantLots.filter(l => l.id !== lot.id).map(l => l.id) });
                              } else {
                                toggleLotSelection(lot.id);
                              }
                            }}
                            style={{ accentColor: "#1d4ed8" }}
                          />
                          <span style={{ fontWeight: "bold" }}>{lot.lotNumber}</span>
                          <span style={{ color: "#94a3b8", fontSize: 9 }}>{new Date(lot.createdAt).toLocaleDateString("en-US")}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#94a3b8", marginTop: 8 }}>
                    Uncheck lots to exclude them from the printed report. Select only one for individual analysis.
                  </div>
                </div>

                {/* Analyzed lots table — shows only displayLots */}
                <div style={{ ...CARD, marginBottom: 18 }}>
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#475569", marginBottom: 8 }}>
                    Analyzed Lots{padraoConfig.compoundName ? ` — ${padraoConfig.compoundName}` : ""}
                    <span style={{ fontWeight: "normal", fontSize: 9, color: "#94a3b8", marginLeft: 8 }}>
                      {displayLots.length} lot{displayLots.length !== 1 ? "s" : ""} in report
                    </span>
                  </div>
                  {displayLots.length === 0 ? (
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#94a3b8", padding: "10px 0" }}>
                      No lots selected. Check at least one lot above.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10.5 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                          {["Lot", "Date", "Sample", "Area (mAU·s)", "Conc. (µg/ml)", "Conformance"].map(h => (
                            <th key={h} style={{ padding: "5px 8px", textAlign: h === "Lot" || h === "Sample" ? "left" : "right", color: "#475569", fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayLots.map((lot, i) => {
                          const r = lot.results.find(res =>
                            padraoConfig.compoundName
                              ? res.compoundName.toLowerCase().includes(padraoConfig.compoundName.toLowerCase())
                              : true
                          );
                          const statusColor = r?.inSpec === null ? "#1d4ed8" : r?.inSpec ? "#166534" : "#b91c1c";
                          const statusBg = r?.inSpec === null ? "#eff6ff" : r?.inSpec ? "#dcfce7" : "#fee2e2";
                          return (
                            <tr key={lot.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "5px 8px", fontWeight: 700 }}>{lot.lotNumber}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right", color: "#64748b" }}>{new Date(lot.createdAt).toLocaleDateString("en-US")}</td>
                              <td style={{ padding: "5px 8px", color: "#475569" }}>{lot.sample.sampleName || "—"}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right" }}>{r ? r.area.toFixed(3) : "—"}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right" }}>{r ? r.concentration.toFixed(3) : "—"}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right" }}>
                                {r ? (
                                  <span style={{ padding: "2px 6px", borderRadius: 3, background: statusBg, color: statusColor, fontSize: 9, fontWeight: "bold" }}>
                                    {r.inSpec === null ? "N/A" : r.inSpec ? "✓ Conforme" : "✗ Não Conforme"}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* Multi-peak visual reference */}
            {peakList.length > 0 && (
              <div style={{ ...CARD }}>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", color: "#475569", marginBottom: 6 }}>
                  Peaks available in current chromatogram
                </div>
                {/* Legenda das colunas */}
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "6px 10px", marginBottom: 10, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: "bold", color: "#334155" }}>Peak</span> — nome do pico no cromatograma ·{" "}
                  <span style={{ fontWeight: "bold", color: "#334155" }}>RT (min)</span> — tempo de retenção ·{" "}
                  <span style={{ fontWeight: "bold", color: "#334155" }}>Height</span> — altura máxima do pico ·{" "}
                  <span style={{ fontWeight: "bold", color: "#334155" }}>Area (mAU·s)</span> — área integrada usada nos cálculos (para [Sample] = área corrigida por pureza) ·{" "}
                  <span style={{ fontWeight: "bold", color: "#7c3aed" }}>Manual Area</span> — área digitada manualmente pelo usuário (sobrepõe o modelo Gaussiano); <em>auto</em> = sincronizado com Sample Area ·{" "}
                  <span style={{ fontWeight: "bold", color: "#334155" }}>Found (µg)</span> — quantidade calculada via razão Sample/Standard ·{" "}
                  <span style={{ fontWeight: "bold", color: "#334155" }}>Purity (%)</span> — pureza da amostra ·{" "}
                  <span style={{ fontWeight: "bold", color: "#1560bd" }}>[Standard]</span> = pico usado como referência ·{" "}
                  <span style={{ fontWeight: "bold", color: "#f97316" }}>[Sample]</span> = pico da amostra analisada
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: 10.5 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                      {["Peak", "RT (min)", "Height (mAU)", "Area (mAU·s)", "Manual Area", "Found (µg)", "Purity (%)", "Capture as", ""].map(h => (
                        <th key={h} style={{ padding: "5px 8px", textAlign: h === "Peak" ? "left" : "right", color: "#475569", fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {peakList.map((p, i) => {
                      const area = getArea(p);
                      const isSmp = isPadraoSamplePeak(p);
                      const isStd = !isSmp && padraoConfig.stdArea > 0 && parseFloat(area.toFixed(5)) === parseFloat(padraoConfig.stdArea.toFixed(5));
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9", background: isStd ? "#eff6ff" : isSmp ? "#fff7ed" : i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "4px 8px", color: "#1e293b", fontWeight: 600 }}>
                            {p.name || `—`}
                            {isStd && <span style={{ color: "#1560bd", marginLeft: 4 }}>[Padrão{padraoConfig.compoundName ? `: ${padraoConfig.compoundName}` : ""}]</span>}
                            {isSmp && <span style={{ color: "#f97316", marginLeft: 4 }}>[Sample]</span>}
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>{p.retentionTime.toFixed(3)}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>{p.height.toFixed(1)}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right", color: isSmp ? "#ea580c" : isStd ? "#1560bd" : undefined, fontWeight: (isSmp || isStd) ? 700 : undefined }}>
                            {isSmp ? padraoConfig.smpArea.toFixed(5) : area.toFixed(5)}
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            {isSmp
                              ? <span style={{ color: "#f97316", fontSize: 9, fontStyle: "italic" }}>auto</span>
                              : p.manualArea > 0
                                ? <span style={{ color: "#7c3aed" }}>{p.manualArea.toFixed(5)}</span>
                                : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          {/* Found amount (µg) — shown when this peak is the [Sample] peak */}
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            {isSmp && padraoExtHasData
                              ? <span style={{ fontWeight: "bold", color: "#f97316" }}>{padraoFoundUg.toFixed(4)}</span>
                              : isStd && padraoExtHasData
                                ? <span style={{ color: "#1560bd" }}>{padraoConfig.stdAmountUg.toFixed(4)}</span>
                                : <span style={{ color: "#cbd5e1" }}>—</span>}
                          </td>
                          {/* Purity (%) */}
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            {isSmp && padraoExtHasData
                              ? <span style={{ fontWeight: "bold", color: padraoFoundPurity >= 98 ? "#16a34a" : padraoFoundPurity >= 90 ? "#d97706" : "#dc2626" }}>{padraoFoundPurity.toFixed(2)} %</span>
                              : isStd
                                ? <span style={{ color: "#1560bd" }}>{padraoConfig.stdPurity.toFixed(2)} %</span>
                                : <span style={{ color: "#cbd5e1" }}>—</span>}
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <button
                                onClick={() => {
                                  const stdArea = parseFloat(area.toFixed(5));
                                  updatePadrao({
                                    stdArea,
                                    stdPeakName: p.name || `RT ${p.retentionTime.toFixed(3)}`,
                                    ...(p.purityPct && p.purityPct > 0 && p.purityPct < 100 ? { stdPurity: p.purityPct } : {}),
                                  });
                                }}
                                style={{ fontSize: 9.5, padding: "2px 6px", border: "1px solid #93c5fd", borderRadius: 3, background: "#eff6ff", cursor: "pointer", color: "#1d4ed8" }}
                              >Standard</button>
                              <button
                                onClick={() => {
                                  const rawArea = parseFloat(area.toFixed(5));
                                  const purPct = smpPurityLocked
                                    ? padraoConfig.smpPurity
                                    : (p.purityPct && p.purityPct > 0 ? p.purityPct : (padraoConfig.smpPurity > 0 ? padraoConfig.smpPurity : 100));
                                  const corrected = parseFloat((rawArea * (purPct / 100)).toFixed(5));
                                  updatePadrao({
                                    smpRawArea: rawArea,
                                    smpArea: corrected,
                                    smpPeakName: p.name || `RT ${p.retentionTime.toFixed(3)}`,
                                    ...(!smpPurityLocked ? { smpPurity: purPct } : {}),
                                  });
                                  // Sincroniza manualArea do pico com smpArea para que
                                  // o Edit Peak dialog e o hover mostrem o mesmo valor
                                  setPeaks(ps => ps.map(pk => pk.id === p.id ? { ...pk, manualArea: corrected } : pk));
                                }}
                                style={{ fontSize: 9.5, padding: "2px 6px", border: "1px solid #fed7aa", borderRadius: 3, background: "#fff7ed", cursor: "pointer", color: "#c2410c" }}
                              >Sample</button>
                            </div>
                          </td>
                          {/* Coluna excluir pico */}
                          <td style={{ padding: "4px 6px", textAlign: "center" }}>
                            <button
                              title="Excluir este pico do cromatograma"
                              onClick={() => {
                                if (!confirm(`Excluir pico "${p.name || `RT ${p.retentionTime.toFixed(3)}`}"?`)) return;
                                // Limpa referência no padraoConfig se era Standard ou Sample
                                if (isStd) updatePadrao({ stdArea: 0, stdPeakName: "" }, { changedBy: "operator" });
                                if (isSmp) updatePadrao({ smpArea: 0, smpRawArea: 0, smpPeakName: "" }, { changedBy: "operator" });
                                removePeak(p.id);
                              }}
                              style={{
                                fontSize: 10, padding: "2px 6px",
                                border: "1px solid #fca5a5", borderRadius: 3,
                                background: "#fff", color: "#dc2626", cursor: "pointer",
                              }}
                            >🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Save PNG dialog (Salvar cromatograma + vincular ao certificado) ──── */}
      {savePngDialog && (() => {
        const session = analysisSessions.find(s => s.id === savePngDialog.sessionId);
        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9997,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: "#fff", borderRadius: 10, padding: "24px 28px", width: 400, maxWidth: "90vw",
              boxShadow: "0 8px 40px rgba(0,0,0,0.22)", fontFamily: "Courier New, monospace",
            }}>
              <div style={{ fontSize: 15, fontWeight: "bold", color: "#0284c7", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <ImageDown style={{ width: 16, height: 16 }} /> Save Chromatogram
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 18 }}>
                Session: <b style={{ color: "#334155" }}>{session?.name}</b>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 10, color: "#334155", fontWeight: "bold", display: "block", marginBottom: 4 }}>
                  Certificate Number (optional)
                </label>
                <p style={{ fontSize: 9, color: "#64748b", marginBottom: 6, lineHeight: 1.5 }}>
                  Enter the Stability Protocol certificate number to link the image. It will appear automatically in the HPLC tab of that protocol.
                </p>
                <input
                  type="text"
                  value={savePngCertNum}
                  onChange={e => setSavePngCertNum(e.target.value)}
                  placeholder="Ex: CA-2025-001"
                  autoFocus
                  style={{
                    width: "100%", fontFamily: "Courier New, monospace", fontSize: 12,
                    padding: "7px 10px", border: "1.5px solid #0284c7", borderRadius: 4,
                    boxSizing: "border-box", outline: "none", letterSpacing: "0.05em",
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleConfirmSavePng(); }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  style={{ fontSize: 11, padding: "7px 16px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#f8fafc", cursor: "pointer", color: "#475569" }}
                  onClick={() => setSavePngDialog(null)}>
                  Cancel
                </button>
                <button
                  style={{ fontSize: 11, padding: "7px 20px", border: "none", borderRadius: 5, background: "#0284c7", cursor: "pointer", color: "#fff", fontWeight: "bold" }}
                  onClick={handleConfirmSavePng}>
                  Save PNG
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Finalization dialog (Concluir análise) ───────────────────────────── */}
      {finalizeDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "24px 28px", width: 420, maxWidth: "90vw",
            boxShadow: "0 8px 40px rgba(0,0,0,0.22)", fontFamily: "Courier New, monospace",
          }}>
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#1d4ed8", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardCheck style={{ width: 16, height: 16 }} /> Conclude Analysis
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 18 }}>
              Session: <b style={{ color: "#334155" }}>{finalizeDialog.name}</b>
            </div>

            {/* Status selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: "bold", color: "#334155", marginBottom: 8 }}>Analysis result:</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  ["em_andamento", "In Progress", "#1d4ed8", "#dbeafe"],
                  ["aprovado",     "Approved",    "#16a34a", "#dcfce7"],
                  ["reprovado",    "Rejected",    "#dc2626", "#fee2e2"],
                ] as const).map(([val, label, color, bg]) => (
                  <button
                    key={val}
                    onClick={() => setFinalizeStatus(val)}
                    style={{
                      flex: 1, padding: "10px 4px", borderRadius: 6, cursor: "pointer",
                      border: finalizeStatus === val ? `2px solid ${color}` : "1px solid #d1d5db",
                      background: finalizeStatus === val ? bg : "#f9fafb",
                      color: finalizeStatus === val ? color : "#6b7280",
                      fontFamily: "Courier New, monospace", fontSize: 11,
                      fontWeight: finalizeStatus === val ? "bold" : "normal",
                      transition: "all 0.12s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>
                Notes / justification (optional):
              </label>
              <textarea
                value={finalizeNotes}
                onChange={e => setFinalizeNotes(e.target.value)}
                rows={3}
                placeholder="Describe analysis conditions, deviations found, justifications..."
                style={{
                  width: "100%", fontFamily: "Courier New, monospace", fontSize: 11,
                  padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                  resize: "vertical", boxSizing: "border-box", outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ fontSize: 11, padding: "7px 16px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#f8fafc", cursor: "pointer", color: "#475569" }}
                onClick={() => setFinalizeDialog(null)}>
                Cancel
              </button>
              <button
                style={{
                  fontSize: 11, padding: "7px 20px", border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", fontWeight: "bold",
                  background: finalizeStatus === "aprovado" ? "#16a34a" : finalizeStatus === "reprovado" ? "#dc2626" : "#1d4ed8",
                }}
                onClick={() => {
                  handleConcludeSession(finalizeDialog.id, finalizeStatus, finalizeNotes);
                  if (finalizeDialog.id === currentSnapshotSessionId && finalizeStatus !== "em_andamento") {
                    setCurrentSnapshotSessionId(null);
                  }
                  setFinalizeDialog(null);
                }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Master Password authentication dialog ─────────────────────────────── */}
      {masterAuthDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "28px 32px", width: 360, maxWidth: "90vw",
            boxShadow: "0 8px 40px rgba(0,0,0,0.3)", fontFamily: "Courier New, monospace",
          }}>
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#1d4ed8", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              🔑 Master Authentication
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>
              {masterAuthDialog.description ?? "This analysis is closed. Enter the Master password to unlock editing for this session."}
            </div>
            <input
              type="password"
              autoFocus
              value={masterAuthInput}
              onChange={e => { setMasterAuthInput(e.target.value); setMasterAuthError(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleMasterAuth(); }}
              placeholder="Master Password"
              style={{
                width: "100%", padding: "9px 12px", border: `1px solid ${masterAuthError ? "#dc2626" : "#cbd5e1"}`,
                borderRadius: 6, fontFamily: "Courier New, monospace", fontSize: 12, marginBottom: 8,
                boxSizing: "border-box", outline: "none",
              }}
            />
            {masterAuthError && (
              <div style={{ fontSize: 10, color: "#dc2626", marginBottom: 10 }}>⚠ {masterAuthError}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                style={{ fontSize: 11, padding: "7px 16px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#f8fafc", cursor: "pointer", color: "#475569" }}
                onClick={() => { setMasterAuthDialog(null); setMasterAuthInput(""); setMasterAuthError(null); }}>
                Cancel
              </button>
              <button
                disabled={masterAuthLoading || !masterAuthInput}
                style={{ fontSize: 11, padding: "7px 20px", border: "none", borderRadius: 5, background: masterAuthLoading ? "#93c5fd" : "#1d4ed8", cursor: masterAuthLoading ? "not-allowed" : "pointer", color: "#fff", fontWeight: "bold" }}
                onClick={handleMasterAuth}>
                {masterAuthLoading ? "Verifying..." : (masterAuthDialog?.buttonLabel ?? "Unlock")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nova Análise dialog ─────────────────────────────────── */}
      {newAnalysisDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9998,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "24px 28px", width: 520, maxWidth: "95vw",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 8px 40px rgba(0,0,0,0.25)", fontFamily: "Courier New, monospace",
          }}>
            {/* Header */}
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#1e293b", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <Plus style={{ width: 16, height: 16 }} /> New Analysis
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 16 }}>
              Fill in the new analysis details. The chromatogram will be reset to default values.
              {!currentSnapshotSessionId && (
                <span style={{ display: "block", color: "#f59e0b", marginTop: 4 }}>
                  ⚠ The current analysis has not been confirmed and is not in Sessions.
                </span>
              )}
            </div>

            {/* Form grid */}
            {(() => {
              const F = ({ label, field, placeholder }: { label: string; field: keyof SampleInfo; placeholder?: string }) => (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: "bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                  <input
                    value={String(newAnalysisForm[field] ?? "")}
                    onChange={e => setNewAnalysisForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: "100%", fontSize: 11, fontFamily: "Courier New, monospace",
                      border: "1px solid #cbd5e1", borderRadius: 4, padding: "5px 8px",
                      outline: "none", boxSizing: "border-box", color: "#1e293b",
                    }}
                  />
                </div>
              );
              return (
                <div>
                  <F label="Sample Name" field="sampleName" placeholder="Ex: Amostra atual A" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <F label="Acq. Operator" field="acqOperator" placeholder="Ex: EDSON" />
                    <F label="Seq. Line" field="seqLine" placeholder="Ex: 9" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <F label="Acq. Instrument" field="acqInstrument" placeholder="Ex: Instrument 1" />
                    <F label="Location" field="location" placeholder="Ex: Vial 9" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <F label="Injection Date" field="injectionDate" placeholder="Ex: 4/25/2025 12:25:09 PM" />
                    <F label="Inj" field="inj" placeholder="1" />
                    <F label="Inj Volume" field="injVolume" placeholder="10.0 µl" />
                  </div>
                  <F label="Acq. Method" field="acqMethod" placeholder="C:\CHEM32\1\DATA\..." />
                  <F label="Last Changed (Acq.)" field="lastChanged1" placeholder="Ex: 4/23/2025 8:27:30 AM by EDSON" />
                  <F label="Analysis Method" field="analysisMethod" placeholder="C:\CHEM32\1\METHODS\B6.M" />
                  <F label="Last Changed (Ana.)" field="lastChanged2" placeholder="Ex: 4/25/2025 9:51:12 AM by EDSON" />
                </div>
              );
            })()}

            {/* Footer buttons */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
              <button
                style={{ fontSize: 11, padding: "7px 18px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#f8fafc", cursor: "pointer", color: "#475569" }}
                onClick={() => setNewAnalysisDialog(false)}>
                Cancel
              </button>
              <button
                style={{ fontSize: 11, padding: "7px 22px", border: "none", borderRadius: 5, background: "#2d4a7a", cursor: "pointer", color: "#fff", fontWeight: "bold" }}
                onClick={() => {
                  const formSnap = { ...newAnalysisForm };
                  handleNewAnalysis();
                  setSample(s => ({ ...s, ...formSnap }));
                }}>
                Start New Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password-protected delete session dialog ─────────────────────────── */}
      {/* ── Peak context menu ─────────────────────────────────────────────── */}
      {peakContextMenu && (() => {
        const peak = peaks.find(p => p.id === peakContextMenu.peakId);
        if (!peak) return null;
        return (
          <>
            {/* Backdrop to close menu */}
            <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setPeakContextMenu(null)} onContextMenu={e => { e.preventDefault(); setPeakContextMenu(null); }} />
            <div style={{
              position: "fixed", zIndex: 9999,
              left: peakContextMenu.x, top: peakContextMenu.y,
              background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 7, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              minWidth: 190, fontFamily: "Courier New, monospace", fontSize: 11,
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                <div style={{ fontWeight: "bold", color: "#1e293b", fontSize: 11 }}>
                  {peak.name ? peak.name : peak.isGhost ? `👻 RT ${peak.retentionTime.toFixed(3)} min` : `RT ${peak.retentionTime.toFixed(3)} min`}
                </div>
                {peak.name && <div style={{ color: "#64748b", fontSize: 9.5 }}>RT: {peak.retentionTime.toFixed(3)} min</div>}
                {peak.isGhost && !peak.name && <div style={{ color: "#7c3aed", fontSize: 9, marginTop: 1 }}>Ghost peak</div>}
                {peak.locked && <div style={{ color: "#f59e0b", fontSize: 9, fontWeight: "bold", marginTop: 2 }}>🔒 LOCKED</div>}
              </div>
              {/* Menu items */}
              <div style={{ padding: "4px 0" }}>
                {(() => {
                  const _isSmpCtx = isPadraoSamplePeak(peak) && padraoConfig.smpArea > 0;
                  const peakArea = _isSmpCtx
                    ? padraoConfig.smpArea
                    : (peak.manualArea > 0 ? peak.manualArea : computeArea(peak));
                  const peakAreaSource = _isSmpCtx
                    ? "Standard – Sample Area (corrigida por pureza)"
                    : (peak.manualArea > 0 ? "Manual (overridden)" : "Computed (Gaussian model)");
                  const matchedCompound = activeCompounds.find(c => Math.abs(peak.retentionTime - c.expectedRT) <= c.rtTol);
                  const formulaStdEntry = formulaStandards.find(fs => fs.formulaId === selectedFormulaId);
                  if (matchedCompound) {
                    const stdEntry = formulaStdEntry?.entries.find(e => e.compoundId === matchedCompound.id) ?? null;
                    const traceInputs: { label: string; value: string; source: string }[] = [
                      { label: "Peak Area", value: `${peakArea.toFixed(5)} mAU·s`, source: peakAreaSource },
                      { label: "RT", value: `${peak.retentionTime.toFixed(3)} min`, source: "Chromatogram" },
                    ];
                    let peakMethod: CalcMethod = "response_factor";
                    let peakFormula = "Conc = Area × AmtPerArea";
                    if (stdEntry && stdEntry.stdArea > 0) {
                      peakMethod = "external_standard";
                      peakFormula = "Conc = (PeakArea / StdArea) × StdConc; Assay (%) = (Conc / Nominal) × 100";
                      traceInputs.push(
                        { label: "Std Area", value: `${stdEntry.stdArea.toFixed(5)} mAU·s`, source: "Formula standard" },
                        { label: "Std Conc", value: `${stdEntry.stdConc.toFixed(4)} ${matchedCompound.units}`, source: "Formula standard" },
                        { label: "Nominal", value: `${stdEntry.nominalConc.toFixed(4)} ${matchedCompound.units}`, source: "Formula standard" },
                      );
                    } else {
                      traceInputs.push({ label: "Amt/Area factor", value: String(matchedCompound.amtPerArea), source: "Compound config" });
                    }
                    const calcConc2 = stdEntry && stdEntry.stdArea > 0 ? (peakArea / stdEntry.stdArea) * stdEntry.stdConc : peakArea * matchedCompound.amtPerArea;
                    const teorPct2 = stdEntry && stdEntry.nominalConc > 0 ? (calcConc2 / stdEntry.nominalConc) * 100 : null;
                    const peakTrace = buildCalcTrace(
                      `Assay — ${matchedCompound.name}`,
                      teorPct2 !== null ? `${teorPct2.toFixed(2)} %` : `${calcConc2.toFixed(4)} ${matchedCompound.units}`,
                      peakMethod, peakFormula, traceInputs, "Chromatogram",
                      { peakName: peak.name || `RT ${peak.retentionTime.toFixed(3)}`, compoundName: matchedCompound.name,
                        warningText: (peak.manualArea > 0 && !isPadraoSamplePeak(peak)) ? "⚠ Area was manually overridden — not from Gaussian model" : undefined }
                    );
                    return (
                      <button
                        onClick={() => { setCalcTraceDialog(peakTrace); setPeakContextMenu(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "Courier New, monospace", color: "#7c3aed", textAlign: "left", borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f5f3ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                        <Activity style={{ width: 13, height: 13 }} /> Ver origem do cálculo
                      </button>
                    );
                  }
                  return null;
                })()}
                {!peak.locked && (
                  <button
                    onClick={() => { openEditorDialog(peak.id); setPeakContextMenu(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "Courier New, monospace", color: "#1d4ed8", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <Settings style={{ width: 13, height: 13, color: "#1d4ed8" }} /> Edit Peak
                  </button>
                )}
                <button
                  onClick={() => { toggleLockPeak(peak.id); setPeakContextMenu(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "Courier New, monospace", color: peak.locked ? "#d97706" : "#334155", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  {peak.locked
                    ? <><LockOpen style={{ width: 13, height: 13, color: "#d97706" }} /> Unlock Peak</>
                    : <><Lock style={{ width: 13, height: 13, color: "#64748b" }} /> Lock Peak</>}
                </button>
                {!peak.locked && (
                  <button
                    onClick={() => { removePeak(peak.id); setPeakContextMenu(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "Courier New, monospace", color: "#dc2626", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <Trash2 style={{ width: 13, height: 13 }} /> Delete Peak
                  </button>
                )}
                {peak.locked && (
                  <div style={{ padding: "6px 14px", color: "#94a3b8", fontSize: 9.5 }}>
                    Unlock to delete or edit.
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Peak editor dialog — opened via context menu or sidebar ⚙ button ── */}
      {/* Always mounted once a peak has been edited (dialogPeakRef guards it).
          NEVER conditionally unmounted — that is what causes the Radix portal
          "insertBefore" DOM crash. open/close is controlled via editorDialogOpen. */}
      {dialogPeakRef.current && (
        <PeakEditorDialog
          peak={dialogPeakRef.current}
          onSave={savePeak}
          onPreview={setPreviewPeak}
          controlledOpen={editorDialogOpen}
          onControlledClose={closeEditorDialog}
          calibData={(() => {
            const p = dialogPeakRef.current;
            if (!p) return undefined;
            const matched = activeCompounds.find(c =>
              Math.abs(p.retentionTime - c.expectedRT) <= c.rtTol * 2 ||
              (p.name && p.name.toLowerCase().includes(c.name.toLowerCase())) ||
              (p.name && c.name.toLowerCase().includes(p.name.toLowerCase()))
            );
            if (!matched) return undefined;
            const cc = getCC(matched.id);
            return {
              compoundName: matched.name,
              standards: cc.standards,
              onUpdate: (s: CalibStandard[]) => {
                pushUndo();
                setCompoundCalibrations(prev => {
                  const existing = prev[matched.id] ?? getCC(matched.id);
                  const updated = { ...prev, [matched.id]: { ...existing, standards: s } };
                  saveCompoundCalibrations(updated);
                  return updated;
                });
                markDirty();
              },
            };
          })()}
        />
      )}

      {/* ── CalcTraceDialog: Ver Origem do Cálculo ─────────────────────────────── */}
      {calcTraceDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setCalcTraceDialog(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "24px 28px", minWidth: 440, maxWidth: 600, boxShadow: "0 8px 40px rgba(0,0,0,0.22)", fontFamily: "Courier New, monospace", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Activity style={{ width: 18, height: 18, color: "#7c3aed" }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: "bold", color: "#1e293b" }}>Ver Origem do Cálculo</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{calcTraceDialog.sourceTab} tab{calcTraceDialog.compoundName && ` — ${calcTraceDialog.compoundName}`}</div>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setCalcTraceDialog(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 7, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#166534", marginBottom: 4 }}>Result</div>
              <div style={{ fontSize: 20, fontWeight: "bold", color: "#15803d" }}>{calcTraceDialog.resultValue}</div>
              <div style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>{calcTraceDialog.resultLabel}</div>
            </div>
            {calcTraceDialog.warningText && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 5, padding: "8px 12px", marginBottom: 14, fontSize: 10, color: "#92400e", display: "flex", alignItems: "flex-start", gap: 6 }}>
                <Activity style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />{calcTraceDialog.warningText}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>Method</div>
              <div style={{ fontSize: 10, background: "#f1f5f9", borderRadius: 4, padding: "6px 10px", color: "#334155" }}>
                {calcTraceDialog.method === "external_standard" ? "External Standard (single-point)" : calcTraceDialog.method === "calibration_curve" ? "Calibration Curve (linear regression)" : calcTraceDialog.method === "response_factor" ? "Response Factor (Amt/Area)" : "Unknown"}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>Applied Formula</div>
              <div style={{ fontSize: 11, background: "#0f172a", color: "#7dd3fc", borderRadius: 5, padding: "8px 12px", fontFamily: "Courier New, monospace", lineHeight: 1.6 }}>{calcTraceDialog.formulaText}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>Input Values</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#475569" }}>Parameter</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", color: "#475569" }}>Value</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#475569" }}>Source</th>
                </tr></thead>
                <tbody>{calcTraceDialog.inputs.map((inp, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "4px 8px", color: "#334155", fontWeight: "bold" }}>{inp.label}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", color: "#1d4ed8", fontFamily: "Courier New, monospace" }}>{inp.value}</td>
                    <td style={{ padding: "4px 8px", color: "#64748b", fontStyle: "italic", fontSize: 9 }}>
                      {inp.source.toLowerCase().includes("manual") ? <span style={{ color: "#d97706" }}>✏ {inp.source}</span> : inp.source.toLowerCase().includes("calculat") ? <span style={{ color: "#7c3aed" }}>⚙️ {inp.source}</span> : <span>📂 {inp.source}</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {(calcTraceDialog.peakName || calcTraceDialog.standardRef) && (
              <div style={{ fontSize: 9, color: "#94a3b8", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                {calcTraceDialog.peakName && <span>Peak: <strong>{calcTraceDialog.peakName}</strong> · </span>}
                {calcTraceDialog.standardRef && <span>Std ref: <strong>{calcTraceDialog.standardRef}</strong></span>}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setCalcTraceDialog(null)} style={{ fontSize: 11, padding: "7px 20px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", cursor: "pointer", color: "#475569", fontFamily: "Courier New, monospace" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

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
              <Trash2 style={{ width: 16, height: 16 }} /> Delete Analysis Session
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginBottom: 14, lineHeight: 1.5 }}>
              You are about to permanently delete:<br />
              <strong>"{deleteSessionDialog.name}"</strong><br />
              <span style={{ color: "#dc2626", fontSize: 10 }}>This action cannot be undone.</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>
                Enter Master password to confirm:
              </label>
              <input
                type="password"
                value={deleteSessionPwd}
                onChange={e => { setDeleteSessionPwd(e.target.value); setDeleteSessionError(null); }}
                onKeyDown={e => e.key === "Enter" && !deleteSessionLoading && confirmDeleteSession()}
                placeholder="Master Password"
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
                Cancel
              </button>
              <button
                disabled={deleteSessionLoading || !deleteSessionPwd}
                style={{ fontSize: 11, padding: "6px 16px", border: "1px solid #dc2626", borderRadius: 5, background: deleteSessionLoading || !deleteSessionPwd ? "#fca5a5" : "#dc2626", cursor: deleteSessionLoading || !deleteSessionPwd ? "not-allowed" : "pointer", color: "#fff", fontWeight: "bold" }}
                onClick={confirmDeleteSession}>
                {deleteSessionLoading ? "Verifying…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Peak picker — Auto-fill from chromatogram (múltiplos picos) ──────── */}
      {peakPickerOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setPeakPickerOpen(false)}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "20px 22px",
            minWidth: 360, maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            fontFamily: "Courier New, monospace",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>
              ⚡ Selecionar pico para Auto-fill
            </div>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 14 }}>
              Há {peaks.filter(p => p.retentionTime > 0.5).length} picos no cromatograma. Escolha qual comparar com o Padrão cadastrado:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {peaks
                .filter(p => p.retentionTime > 0.5)
                .sort((a, b) => a.retentionTime - b.retentionTime)
                .map(p => {
                  const area = p.manualArea > 0 ? p.manualArea : computeArea(p);
                  const matchedCompound = activeCompounds.find(c =>
                    (p.name && (
                      p.name.toLowerCase().includes(c.name.toLowerCase()) ||
                      c.name.toLowerCase().includes(p.name.toLowerCase())
                    )) || Math.abs(p.retentionTime - c.expectedRT) < c.rtTol
                  ) ?? null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        peakPickerCbRef.current?.(p);
                        setPeakPickerOpen(false);
                      }}
                      style={{
                        textAlign: "left", padding: "8px 12px",
                        border: matchedCompound ? "1.5px solid #6366f1" : "1px solid #d1d5db",
                        borderRadius: 6,
                        background: matchedCompound ? "#eef2ff" : "#f9fafb",
                        cursor: "pointer", fontFamily: "Courier New, monospace",
                        display: "flex", flexDirection: "column", gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: 11, color: matchedCompound ? "#4338ca" : "#111" }}>
                        {p.name || `Pico sem nome`}
                        {matchedCompound && (
                          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: "normal", color: "#6366f1" }}>
                            → composto: {matchedCompound.name}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 9.5, color: "#555" }}>
                        TR = {p.retentionTime.toFixed(3)} min &nbsp;|&nbsp; Área = {area.toFixed(2)} mAU·s &nbsp;|&nbsp; h = {p.height} mAU
                      </span>
                      {!matchedCompound && (
                        <span style={{ fontSize: 9, color: "#9ca3af" }}>
                          Sem composto correspondente — preenche apenas a área da amostra
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => setPeakPickerOpen(false)}
              style={{
                marginTop: 14, width: "100%", padding: "6px", fontSize: 11,
                border: "1px solid #d1d5db", borderRadius: 6, background: "#f3f4f6",
                cursor: "pointer", color: "#374151",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
