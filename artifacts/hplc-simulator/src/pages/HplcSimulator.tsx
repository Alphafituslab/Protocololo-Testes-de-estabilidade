import { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceLine,
  ScatterChart, Scatter, LineChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Printer, Plus, Trash2, Settings, FlaskConical, TrendingUp, BarChart3 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Peak {
  id: string;
  name: string;
  retentionTime: number;
  height: number;  // mV
  width: number;
  asymmetry: number;
  conc: number;
  unit: string;
  mark: string;
}

interface SampleInfo {
  sampleName: string;
  sampleId: string;
  dataFilename: string;
  methodFilename: string;
  batchFilename: string;
  vialNo: string;
  sampleType: string;
  injectionVolume: string;
  dateAcquired: string;
  acquiredBy: string;
  dateProcessed: string;
  processedBy: string;
}

interface DetectorInfo {
  detectorName: string;
  wavelength: string;
  runTime: number;
}

interface CalibStandard {
  id: string;
  num: number;
  conc: number;   // actual concentration
  area: number;   // mean area
}

interface CalibInfo {
  idNum: string;
  name: string;
  quantMethod: string;
  fitType: string;
  zeroThrough: string;
  weightedRegression: string;
  offsetCorrection: string;
  detectorName: string;
  xScale: number;  // e.g. 1e-1
  xScaleLabel: string;  // e.g. "*10^-1"
  yScale: number;  // e.g. 1e7
  yScaleLabel: string;  // e.g. "*10^7"
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function gaussian(t: number, rt: number, sigma: number, h: number, asym: number): number {
  const d = t - rt;
  const s = d < 0 ? sigma : sigma * asym;
  return h * Math.exp(-(d * d) / (2 * s * s));
}

function buildChromatogram(peaks: Peak[], runTime: number, pts = 2000) {
  const dt = runTime / pts;
  return Array.from({ length: pts + 1 }, (_, i) => {
    const t = parseFloat((i * dt).toFixed(4));
    let signal = 0;
    for (const p of peaks) signal += gaussian(t, p.retentionTime, p.width, p.height, p.asymmetry);
    return { time: t, signal: Math.max(0, parseFloat(signal.toFixed(2))) };
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
    area += 0.5 * dt * (
      gaussian(t1, p.retentionTime, p.width, p.height, p.asymmetry) +
      gaussian(t2, p.retentionTime, p.width, p.height, p.asymmetry)
    );
  }
  return area;
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, rr1: 0, rr2: 0, rss: 0, meanRF: 0, rfsd: 0, rfrsd: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const rr1 = Math.sqrt(Math.abs(r2));
  const rr2 = r2;
  // Response factors per point (area / conc)
  const rfs = points.filter(p => p.x > 0).map(p => p.y / p.x);
  const meanRF = rfs.length > 0 ? rfs.reduce((a, v) => a + v, 0) / rfs.length : 0;
  const rfsd = rfs.length > 1
    ? Math.sqrt(rfs.reduce((a, v) => a + Math.pow(v - meanRF, 2), 0) / (rfs.length - 1))
    : 0;
  const rfrsd = meanRF > 0 ? (rfsd / meanRF) * 100 : 0;
  return { slope, intercept, r2, rr1, rr2, rss: ssRes, meanRF, rfsd, rfrsd };
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function fmtNum(n: number, dec = 3) { return n.toFixed(dec).replace(".", ","); }
function fmtSci(n: number) {
  if (n === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const man = n / Math.pow(10, exp);
  return `${man.toFixed(5)}e+${String(exp).padStart(3, "0")}`;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PEAKS: Peak[] = [
  { id: uid(), name: "",        retentionTime: 2.055, height: 280,  width: 0.09, asymmetry: 1.20, conc: 0, unit: "", mark: "" },
  { id: uid(), name: "",        retentionTime: 2.545, height: 210,  width: 0.07, asymmetry: 1.10, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "",        retentionTime: 2.661, height: 230,  width: 0.06, asymmetry: 1.18, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "",        retentionTime: 5.302, height: 1970, width: 0.20, asymmetry: 1.02, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "",        retentionTime: 6.920, height: 185,  width: 0.26, asymmetry: 1.12, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "Cafeina", retentionTime:10.417, height: 2511, width: 0.22, asymmetry: 1.01, conc: 0.382, unit: "mg/L", mark: "" },
];

const DEFAULT_SAMPLE: SampleInfo = {
  sampleName: "Amostra_4",
  sampleId: "010",
  dataFilename: "Cafeina_MEOH_H2O_29042025_010.lcd",
  methodFilename: "Cafeina_28042025.lcm",
  batchFilename: "Cafeina_MEOH_H2O.lcb",
  vialNo: "1-10",
  sampleType: "Unknown",
  injectionVolume: "10 uL",
  dateAcquired: "29/04/2025 15:48:44",
  acquiredBy: "System Administrator",
  dateProcessed: "30/04/2025 10:40:59",
  processedBy: "System Administrator",
};

const DEFAULT_DETECTOR: DetectorInfo = {
  detectorName: "Detector A",
  wavelength: "272nm",
  runTime: 15,
};

const DEFAULT_STANDARDS: CalibStandard[] = [
  { id: uid(), num: 1, conc: 0.1, area: 2948718 },
  { id: uid(), num: 2, conc: 0.2, area: 5807986 },
  { id: uid(), num: 3, conc: 0.4, area: 11415203 },
  { id: uid(), num: 4, conc: 0.6, area: 17009026 },
];

const DEFAULT_CALIB: CalibInfo = {
  idNum: "1",
  name: "Cafeina",
  quantMethod: "External Standard",
  fitType: "Linear",
  zeroThrough: "Not Through",
  weightedRegression: "None",
  offsetCorrection: "Off",
  detectorName: "Detector A",
  xScale: 1e-1,
  xScaleLabel: "*10^-1",
  yScale: 1e7,
  yScaleLabel: "*10^7",
};

// ─── Tooltips ──────────────────────────────────────────────────────────────────

function ChromTooltip({ active, payload }: { active?: boolean; payload?: { payload: { time: number; signal: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { time, signal } = payload[0].payload;
  return (
    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
      <div>{fmtNum(time, 3)} min</div>
      <div>{signal.toFixed(0)} mV</div>
    </div>
  );
}

function CalibTooltip({ active, payload }: { active?: boolean; payload?: { payload: { x: number; y: number; label?: string } }[] }) {
  if (!active || !payload?.length) return null;
  const { x, y } = payload[0].payload;
  return (
    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
      <div>Conc: {x.toFixed(4)}</div>
      <div>Area: {Math.round(y).toLocaleString("pt-BR")}</div>
    </div>
  );
}

// ─── Vertical RT label on chromatogram ────────────────────────────────────────

function PeakLabel({ viewBox, rt }: { viewBox?: { x: number; y: number }; rt: number }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text
      x={x + 3}
      y={y - 3}
      textAnchor="start"
      transform={`rotate(-90, ${x + 3}, ${y - 3})`}
      style={{ fontFamily: "Courier New, monospace", fontSize: 9.5, fill: "#111" }}
    >
      {fmtNum(rt, 3)}
    </text>
  );
}

// ─── Peak editor ──────────────────────────────────────────────────────────────

function PeakEditorDialog({ peak, onSave, children }: { peak: Peak; onSave: (p: Peak) => void; children: React.ReactNode }) {
  const [draft, setDraft] = useState<Peak>({ ...peak });
  const [open, setOpen] = useState(false);
  const numKeys: (keyof Peak)[] = ["retentionTime", "height", "width", "asymmetry", "conc"];
  const field = (key: keyof Peak) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [key]: numKeys.includes(key) ? parseFloat(e.target.value) || 0 : e.target.value }));
  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (v) setDraft({ ...peak }); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle style={{ fontFamily: "Courier New, monospace" }}>Editar Pico</DialogTitle></DialogHeader>
        <div className="space-y-2 pt-1">
          {([
            ["name", "Nome (ex: Cafeina)", "text"],
            ["retentionTime", "Ret. Time (min)", "number"],
            ["height", "Altura (mV)", "number"],
            ["width", "Largura σ (min)", "number"],
            ["asymmetry", "Assimetria", "number"],
            ["conc", "Conc.", "number"],
            ["unit", "Unidade (ex: mg/L)", "text"],
            ["mark", "Mark (V / SV / T)", "text"],
          ] as [keyof Peak, string, string][]).map(([k, label, type]) => (
            <div key={k} className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input type={type} step="0.001" value={draft[k] as string | number} onChange={field(k)} className="h-7 text-xs font-mono" />
            </div>
          ))}
          <Button className="w-full" size="sm" onClick={() => { onSave(draft); setOpen(false); }}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type PageMode = "chromatogram" | "calibration";

export default function HplcSimulator() {
  const [page, setPage] = useState<PageMode>("chromatogram");
  const [peaks, setPeaks] = useState<Peak[]>(DEFAULT_PEAKS);
  const [sample, setSample] = useState<SampleInfo>(DEFAULT_SAMPLE);
  const [detector, setDetector] = useState<DetectorInfo>(DEFAULT_DETECTOR);
  const [standards, setStandards] = useState<CalibStandard[]>(DEFAULT_STANDARDS);
  const [calib, setCalib] = useState<CalibInfo>(DEFAULT_CALIB);
  const [showControls, setShowControls] = useState(true);

  // ── Chromatogram ────────────────────────────────────────────────────────────

  const chromatogram = useMemo(() => buildChromatogram(peaks, detector.runTime), [peaks, detector.runTime]);

  const peakStats = useMemo(() => {
    return [...peaks]
      .sort((a, b) => a.retentionTime - b.retentionTime)
      .map((p, i) => ({ ...p, peakNum: i + 1, area: Math.round(computeArea(p)) }));
  }, [peaks]);

  const totalArea = peakStats.reduce((s, p) => s + p.area, 0);
  const totalHeight = peakStats.reduce((s, p) => s + p.height, 0);

  const yMax = useMemo(() => {
    const max = Math.max(...chromatogram.map(d => d.signal), 100);
    return Math.ceil(max * 1.12 / 500) * 500;
  }, [chromatogram]);

  const xTicks = useMemo(() => {
    const t: number[] = [];
    for (let v = 0; v <= detector.runTime; v += 2.5) t.push(parseFloat(v.toFixed(1)));
    return t;
  }, [detector.runTime]);

  const yTicks = useMemo(() => {
    const step = yMax <= 2000 ? 500 : yMax <= 5000 ? 1000 : 2000;
    const t: number[] = [];
    for (let v = 0; v <= yMax; v += step) t.push(v);
    return t;
  }, [yMax]);

  // ── Calibration ─────────────────────────────────────────────────────────────

  const reg = useMemo(() => {
    const pts = standards.map(s => ({ x: s.conc, y: s.area }));
    return linearRegression(pts);
  }, [standards]);

  const regLine = useMemo(() => {
    if (standards.length < 2) return [];
    const xs = standards.map(s => s.conc);
    const xMin = 0;
    const xMax = Math.max(...xs) * 1.1;
    return [
      { x: xMin, y: reg.slope * xMin + reg.intercept },
      { x: xMax, y: reg.slope * xMax + reg.intercept },
    ];
  }, [standards, reg]);

  const calibXMax = useMemo(() => {
    if (!standards.length) return 1;
    return Math.max(...standards.map(s => s.conc)) * 1.3;
  }, [standards]);

  const calibYMax = useMemo(() => {
    if (!standards.length) return 1e7;
    return Math.max(...standards.map(s => s.area)) * 1.2;
  }, [standards]);

  // Merged dataset for ComposedChart: reg line (dense) + actual standard points
  const calibChartData = useMemo(() => {
    const sorted = [...standards].sort((a, b) => a.conc - b.conc);
    const xMax = calibXMax;
    // Build 80 points for the regression line from 0 to xMax
    const regPts = Array.from({ length: 80 }, (_, i) => {
      const x = (i / 79) * xMax;
      return { x: parseFloat(x.toFixed(5)), reg: reg.slope * x + reg.intercept, pt: undefined as number | undefined };
    });
    // Overlay the actual standard values
    sorted.forEach(s => {
      const nearest = regPts.reduce((best, p, i) =>
        Math.abs(p.x - s.conc) < Math.abs(regPts[best].x - s.conc) ? i : best, 0);
      regPts[nearest].x = s.conc;
      regPts[nearest].reg = reg.slope * s.conc + reg.intercept;
      regPts[nearest].pt = s.area;
    });
    return regPts;
  }, [standards, calibXMax, reg]);

  const xScaleDisplay = (v: number) => (v / calib.xScale).toFixed(1).replace(".", ",");
  const yScaleDisplay = (v: number) => (v / calib.yScale).toFixed(1).replace(".", ",");

  const addStandard = () => {
    const n = standards.length + 1;
    setStandards(ss => [...ss, { id: uid(), num: n, conc: 0.1 * n, area: Math.round(reg.slope * 0.1 * n + reg.intercept) || 1000000 * n }]);
  };
  const removeStandard = (id: string) => setStandards(ss => ss.filter(s => s.id !== id));
  const updateStandard = (id: string, key: "conc" | "area", val: number) =>
    setStandards(ss => ss.map(s => s.id === id ? { ...s, [key]: val } : s));

  // ── Peaks ────────────────────────────────────────────────────────────────────

  const addPeak = useCallback(() => {
    setPeaks(ps => [...ps, {
      id: uid(), name: "", mark: "V", unit: "", conc: 0,
      retentionTime: parseFloat((1 + Math.random() * (detector.runTime - 2)).toFixed(3)),
      height: Math.round(200 + Math.random() * 500),
      width: parseFloat((0.08 + Math.random() * 0.15).toFixed(3)),
      asymmetry: parseFloat((0.95 + Math.random() * 0.25).toFixed(2)),
    }]);
  }, [detector.runTime]);

  const removePeak = (id: string) => setPeaks(ps => ps.filter(p => p.id !== id));
  const savePeak = (updated: Peak) => setPeaks(ps => ps.map(p => p.id === updated.id ? updated : p));

  const sField = (k: keyof SampleInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSample(s => ({ ...s, [k]: e.target.value }));
  const dField = (k: keyof DetectorInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetector(d => ({ ...d, [k]: k === "runTime" ? parseFloat(e.target.value) || 15 : e.target.value }));
  const cField = (k: keyof CalibInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCalib(c => ({ ...c, [k]: e.target.value }));

  // ── Render ───────────────────────────────────────────────────────────────────

  const MONO: React.CSSProperties = { fontFamily: "Courier New, monospace" };
  const now = new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", padding: "12px 8px" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="no-print max-w-[1100px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        <FlaskConical className="h-5 w-5 text-blue-700" />
        <span style={{ ...MONO, fontWeight: "bold", fontSize: 13 }}>Simulador HPLC — Shimadzu LabSolutions</span>
        <div className="flex-1" />

        {/* Page switcher */}
        <div style={{ display: "flex", border: "1px solid #bbb", borderRadius: 4, overflow: "hidden" }}>
          <button
            onClick={() => setPage("chromatogram")}
            style={{
              ...MONO, fontSize: 11, padding: "4px 12px", cursor: "pointer",
              background: page === "chromatogram" ? "#1d4ed8" : "#fff",
              color: page === "chromatogram" ? "#fff" : "#333",
              border: "none", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <BarChart3 style={{ width: 13, height: 13 }} /> Cromatograma
          </button>
          <button
            onClick={() => setPage("calibration")}
            style={{
              ...MONO, fontSize: 11, padding: "4px 12px", cursor: "pointer",
              background: page === "calibration" ? "#1d4ed8" : "#fff",
              color: page === "calibration" ? "#fff" : "#333",
              border: "none", borderLeft: "1px solid #bbb", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <TrendingUp style={{ width: 13, height: 13 }} /> Curva de Calibração
          </button>
        </div>

        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowControls(v => !v)}>
          <Settings className="h-3.5 w-3.5" /> {showControls ? "Ocultar" : "Controles"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </Button>
      </div>

      <div className={`max-w-[1100px] mx-auto flex gap-3 items-start`}>

        {/* ── LEFT: controls panel ─────────────────────────────────────────── */}
        {showControls && (
          <div className="no-print w-60 flex-shrink-0 space-y-3">

            {page === "chromatogram" && (
              <>
                <ControlBox title="Sample Information">
                  {([
                    ["sampleName", "Sample Name"], ["sampleId", "Sample ID"],
                    ["dataFilename", "Data Filename"], ["methodFilename", "Method Filename"],
                    ["batchFilename", "Batch Filename"], ["vialNo", "Vial #"],
                    ["sampleType", "Sample Type"], ["injectionVolume", "Injection Volume"],
                    ["dateAcquired", "Date Acquired"], ["acquiredBy", "Acquired by"],
                    ["dateProcessed", "Date Processed"], ["processedBy", "Processed by"],
                  ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                    <SmallField key={k} label={label} value={sample[k]} onChange={sField(k)} />
                  ))}
                </ControlBox>

                <ControlBox title="Detector">
                  <SmallField label="Detector Name" value={detector.detectorName} onChange={dField("detectorName")} />
                  <SmallField label="Wavelength" value={detector.wavelength} onChange={dField("wavelength")} />
                  <SmallField label="Run Time (min)" value={String(detector.runTime)} onChange={dField("runTime")} type="number" />
                </ControlBox>

                <ControlBox title="Picos" extra={
                  <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={addPeak}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                }>
                  {[...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map((p, i) => (
                    <div key={p.id} className="flex items-center gap-1 group rounded px-1 py-0.5 hover:bg-gray-50">
                      <span style={{ ...MONO, fontSize: 9, color: "#666", width: 14 }}>{i + 1}</span>
                      <span style={{ ...MONO, fontSize: 9.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtNum(p.retentionTime, 3)}{p.name ? ` (${p.name})` : ""}
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
                </ControlBox>
              </>
            )}

            {page === "calibration" && (
              <>
                <ControlBox title="Calibration Info">
                  {([
                    ["idNum", "ID#"], ["name", "Name"],
                    ["quantMethod", "Quantitative Method"],
                    ["fitType", "Fit Type"], ["zeroThrough", "Zero Through"],
                    ["weightedRegression", "Weighted Regression"],
                    ["offsetCorrection", "Offset Correction"],
                    ["detectorName", "Detector Name"],
                    ["xScaleLabel", "X Scale Label (ex: *10^-1)"],
                    ["yScaleLabel", "Y Scale Label (ex: *10^7)"],
                  ] as [keyof CalibInfo, string][]).map(([k, label]) => (
                    <SmallField key={k} label={label} value={String(calib[k])} onChange={cField(k)} />
                  ))}
                </ControlBox>

                <ControlBox title="Padrões" extra={
                  <Button size="sm" variant="outline" className="h-6 gap-0.5 text-xs px-2" onClick={addStandard}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                }>
                  {standards.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1 group mb-1">
                      <span style={{ ...MONO, fontSize: 9, color: "#666", width: 12 }}>{i + 1}</span>
                      <div className="flex flex-col gap-0.5 flex-1">
                        <Input
                          type="number" step="0.001"
                          value={s.conc}
                          onChange={e => updateStandard(s.id, "conc", parseFloat(e.target.value) || 0)}
                          className="h-5 text-xs font-mono px-1"
                          placeholder="Conc."
                        />
                        <Input
                          type="number"
                          value={s.area}
                          onChange={e => updateStandard(s.id, "area", parseInt(e.target.value) || 0)}
                          className="h-5 text-xs font-mono px-1"
                          placeholder="Area"
                        />
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
          </div>
        )}

        {/* ── RIGHT: report ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, background: "#fff", border: "1px solid #bbb", boxShadow: "0 2px 8px rgba(0,0,0,.18)", padding: "28px 32px", minWidth: 0 }}>

          {/* timestamp + page */}
          <div style={{ ...MONO, fontSize: 10, textAlign: "right", color: "#333", marginBottom: 2 }}>
            {now} Page 1 / 1
          </div>

          {/* ── CHROMATOGRAM PAGE ─────────────────────────────────────────── */}
          {page === "chromatogram" && (
            <>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <span style={{ ...MONO, fontSize: 16, fontWeight: "bold" }}>Analysis Report</span>
              </div>

              {/* Sample Information */}
              <SectionHeader title="Sample Information" />
              <table style={{ ...MONO, fontSize: 11, borderCollapse: "collapse", width: "100%", marginBottom: 14 }}>
                <tbody>
                  {([
                    [["Sample Name", sample.sampleName], ["Sample ID", sample.sampleId]],
                    [["Data Filename", sample.dataFilename], null],
                    [["Method Filename", sample.methodFilename], null],
                    [["Batch Filename", sample.batchFilename], null],
                    [["Vial #", sample.vialNo], ["Sample Type", sample.sampleType]],
                    [["Injection Volume", sample.injectionVolume], null],
                    [["Date Acquired", sample.dateAcquired], ["Acquired by", sample.acquiredBy]],
                    [["Date Processed", sample.dateProcessed], ["Processed by", sample.processedBy]],
                  ] as ([string, string] | null)[][]).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => cell ? (
                        <td key={ci} style={{ padding: "0 8px 1px 0", whiteSpace: "nowrap", width: "50%", verticalAlign: "top" }}>
                          <span style={{ display: "inline-block", minWidth: 140 }}>{cell[0]}</span>
                          <span>: {cell[1]}</span>
                        </td>
                      ) : <td key={ci} />)}
                    </tr>
                  ))}
                </tbody>
              </table>

              <Separator style={{ borderColor: "#aaa", marginBottom: 12 }} />

              {/* Chromatogram */}
              <SectionHeader title="Chromatogram" />
              <div style={{ position: "relative" }}>
                <div style={{ ...MONO, fontSize: 11, position: "absolute", top: 0, left: 0, zIndex: 2 }}>mV</div>
                <div style={{ ...MONO, fontSize: 11, position: "absolute", top: 0, right: 0, zIndex: 2 }}>
                  {detector.detectorName} {detector.wavelength}
                </div>

                <ResponsiveContainer width="100%" height={290}>
                  <ComposedChart data={chromatogram} margin={{ top: 26, right: 16, left: 8, bottom: 26 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#ccc" />
                    <XAxis
                      dataKey="time" type="number"
                      domain={[0, detector.runTime]}
                      ticks={xTicks}
                      tickFormatter={v => fmtNum(v, 1)}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10, fill: "#222" }}
                      label={{ value: "min", position: "right", offset: 8, fontFamily: "Courier New, monospace", fontSize: 11 }}
                      axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }}
                    />
                    <YAxis
                      domain={[0, yMax]} ticks={yTicks}
                      tickFormatter={v => String(v)}
                      tick={{ fontFamily: "Courier New, monospace", fontSize: 10, fill: "#222" }}
                      axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }}
                      width={48}
                    />
                    <Tooltip content={<ChromTooltip />} />
                    {[...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map(p => (
                      <ReferenceLine
                        key={p.id} x={p.retentionTime} stroke="none"
                        label={(props: { viewBox?: { x: number; y: number } }) => (
                          <PeakLabel viewBox={props.viewBox} rt={p.retentionTime} />
                        )}
                      />
                    ))}
                    <Line
                      type="monotone" dataKey="signal"
                      stroke="#111" strokeWidth={0.8}
                      dot={false} isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <Separator style={{ borderColor: "#aaa", marginBottom: 12 }} />

              {/* Peak Table */}
              <SectionHeader title="Peak Table" />
              <div style={{ ...MONO, fontSize: 10.5, color: "#333", marginBottom: 4 }}>
                {detector.detectorName} {detector.wavelength}
              </div>
              <table style={{ ...MONO, fontSize: 10.5, borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #555" }}>
                    {["Peak#", "Ret. Time", "Area", "Height", "Conc.", "Unit", "Mark", "Name"].map(h => (
                      <th key={h} style={{
                        textAlign: ["Name", "Mark", "Unit"].includes(h) ? "left" : "right",
                        padding: "2px 10px 2px 0", fontWeight: "bold", whiteSpace: "nowrap"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {peakStats.map(p => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={TR}>{p.peakNum}</td>
                      <td style={TR}>{fmtNum(p.retentionTime, 3)}</td>
                      <td style={TR}>{p.area.toLocaleString("pt-BR")}</td>
                      <td style={TR}>{p.height.toLocaleString("pt-BR")}</td>
                      <td style={TR}>{p.conc > 0 ? fmtNum(p.conc, 3) : "0,000"}</td>
                      <td style={TL}>{p.unit}</td>
                      <td style={TL}>{p.mark}</td>
                      <td style={TL}>{p.name}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid #555" }}>
                    <td colSpan={2} style={{ ...MONO, padding: "2px 10px 2px 0", fontWeight: "bold" }}>Total</td>
                    <td style={{ ...TR, fontWeight: "bold" }}>{totalArea.toLocaleString("pt-BR")}</td>
                    <td style={{ ...TR, fontWeight: "bold" }}>{totalHeight.toLocaleString("pt-BR")}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>

              <div style={{ ...MONO, fontSize: 9, color: "#555", marginTop: 18, textAlign: "center" }}>
                C:\LabSolutions\Data\{sample.dataFilename}
              </div>
            </>
          )}

          {/* ── CALIBRATION PAGE ──────────────────────────────────────────── */}
          {page === "calibration" && (
            <>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <span style={{ ...MONO, fontSize: 15, fontWeight: "bold" }}>
                  ==== Shimadzu LabSolutions Calibration Curve ====
                </span>
              </div>

              {/* Calib info left column */}
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 16 }}>

                {/* Left: parameters + chart */}
                <div style={{ flex: 1 }}>
                  <table style={{ ...MONO, fontSize: 11, borderCollapse: "collapse" }}>
                    <tbody>
                      {[
                        ["ID#", calib.idNum],
                        ["Name", calib.name],
                        ["Quantitative Method", calib.quantMethod],
                        ["Function", `f(x)=${fmtSci(reg.slope)}*x+${Math.round(reg.intercept).toLocaleString("pt-BR")}`],
                        ["    Rr1=" + reg.rr1.toFixed(7) + " Rr2=" + reg.rr2.toFixed(7) + " RSS=" + fmtSci(reg.rss), ""],
                        ["    MeanRF: " + fmtSci(reg.meanRF) + " RFSD: " + fmtSci(reg.rfsd) + " RFRSD: " + reg.rfrsd.toFixed(6), ""],
                        ["FitType", calib.fitType],
                        ["ZeroThrough", calib.zeroThrough],
                        ["Weighted Regression", calib.weightedRegression],
                        ["Offset Correction", calib.offsetCorrection],
                        ["Detector Name", calib.detectorName],
                      ].map(([label, val], i) => (
                        <tr key={i}>
                          <td style={{ padding: "0.5px 12px 0.5px 0", whiteSpace: "nowrap", color: "#222" }}>
                            {label.startsWith("    ") ? (
                              <span style={{ paddingLeft: 16 }}>{label.trim()}</span>
                            ) : (
                              <>
                                <span style={{ display: "inline-block", minWidth: 160 }}>{label}</span>
                                {val && <span>: {val}</span>}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Chart */}
                  <div style={{ position: "relative", marginTop: 12 }}>
                    <div style={{ ...MONO, fontSize: 11 }}>Area</div>
                    <div style={{ ...MONO, fontSize: 10, color: "#444", marginBottom: 2 }}>[{calib.yScaleLabel}]</div>

                    <ResponsiveContainer width="100%" height={240}>
                      <ComposedChart data={calibChartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#ccc" />
                        <XAxis
                          dataKey="x" type="number"
                          domain={[0, calibXMax]}
                          tickFormatter={xScaleDisplay}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }}
                          label={{ value: `Conc. [${calib.xScaleLabel}]`, position: "insideBottom", offset: -14, fontFamily: "Courier New, monospace", fontSize: 10 }}
                        />
                        <YAxis
                          type="number"
                          domain={[0, calibYMax]}
                          tickFormatter={yScaleDisplay}
                          tick={{ fontFamily: "Courier New, monospace", fontSize: 10 }}
                          axisLine={{ stroke: "#444" }} tickLine={{ stroke: "#444" }}
                          width={44}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload as { x: number; reg: number; pt?: number };
                            return (
                              <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, background: "#fff", border: "1px solid #333", padding: "4px 8px" }}>
                                <div>Conc: {(d.x / calib.xScale).toFixed(3).replace(".", ",")}</div>
                                {d.pt !== undefined && <div>Area: {Math.round(d.pt).toLocaleString("pt-BR")}</div>}
                              </div>
                            );
                          }}
                        />

                        {/* Dashed crosshair lines for each standard point */}
                        {standards.map(s => (
                          <ReferenceLine key={`vx-${s.id}`} x={s.conc} stroke="#888" strokeDasharray="4 3" strokeWidth={0.8} />
                        ))}
                        {standards.map(s => (
                          <ReferenceLine key={`hy-${s.id}`} y={s.area} stroke="#888" strokeDasharray="4 3" strokeWidth={0.8} />
                        ))}

                        {/* Regression line — solid, continuous */}
                        <Line
                          dataKey="reg"
                          stroke="#333"
                          strokeWidth={1.2}
                          dot={false}
                          isAnimationActive={false}
                          connectNulls
                        />

                        {/* Actual standard points — circles */}
                        <Line
                          dataKey="pt"
                          stroke="#333"
                          strokeWidth={1}
                          dot={(props: { cx: number; cy: number; value?: number }) =>
                            props.value !== undefined ? (
                              <circle key={`dot-${props.cx}`} cx={props.cx} cy={props.cy} r={4} fill="#fff" stroke="#333" strokeWidth={1.5} />
                            ) : <g key={`dot-empty-${props.cx}`} />
                          }
                          activeDot={false}
                          isAnimationActive={false}
                          connectNulls={false}
                          legendType="none"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right: standards table */}
                <div style={{ minWidth: 200 }}>
                  <table style={{ ...MONO, fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #555" }}>
                        <th style={{ ...TR2, fontWeight: "bold" }}>#</th>
                        <th style={{ ...TR2, fontWeight: "bold" }}>Conc.(Ratio)</th>
                        <th style={{ ...TR2, fontWeight: "bold" }}>MeanArea</th>
                        <th style={{ ...TR2, fontWeight: "bold" }}>Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...standards]
                        .sort((a, b) => a.conc - b.conc)
                        .map((s, i) => (
                          <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={TR2}>{i + 1}</td>
                            <td style={TR2}>{fmtNum(s.conc, 1)}</td>
                            <td style={TR2}>{s.area.toLocaleString("pt-BR")}</td>
                            <td style={TR2}>{s.area.toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ ...MONO, fontSize: 9, color: "#555", marginTop: 16, textAlign: "center" }}>
                C:\LabSolutions\Data\{calib.name}\{calib.name}_Calibration.lcd
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small reusable helpers ────────────────────────────────────────────────────

const TR: React.CSSProperties = { textAlign: "right", padding: "1.5px 10px 1.5px 0" };
const TL: React.CSSProperties = { textAlign: "left", padding: "1.5px 10px 1.5px 0" };
const TR2: React.CSSProperties = { textAlign: "right", padding: "2px 8px 2px 0", whiteSpace: "nowrap" };

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
      &lt;{title}&gt;
    </div>
  );
}

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

function SmallField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string }) {
  return (
    <div className="mb-1.5">
      <Label style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#666", display: "block" }}>{label}</Label>
      <Input type={type} value={value} onChange={onChange} className="h-6 px-1.5" style={{ fontFamily: "Courier New, monospace", fontSize: 10 }} />
    </div>
  );
}
