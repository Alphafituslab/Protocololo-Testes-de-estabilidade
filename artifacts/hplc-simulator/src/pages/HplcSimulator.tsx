import { useState, useMemo, useCallback, useRef } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Printer, Plus, Trash2, Settings, FlaskConical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Peak {
  id: string;
  name: string;
  retentionTime: number; // min
  height: number;        // mV
  width: number;         // sigma (min)
  asymmetry: number;     // tailing factor
  conc: number;          // mg/L (0 = not quantified)
  unit: string;
  mark: string;          // '', 'V', 'SV', 'T'
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

// ─── Math helpers ──────────────────────────────────────────────────────────────

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

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtNum(n: number, dec = 3) {
  return n.toFixed(dec).replace(".", ",");
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PEAKS: Peak[] = [
  { id: uid(), name: "",        retentionTime: 2.089, height: 280,  width: 0.08, asymmetry: 1.20, conc: 0, unit: "", mark: "" },
  { id: uid(), name: "",        retentionTime: 2.604, height: 520,  width: 0.10, asymmetry: 1.15, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "",        retentionTime: 5.302, height: 1980, width: 0.20, asymmetry: 1.02, conc: 0, unit: "", mark: "V" },
  { id: uid(), name: "",        retentionTime: 6.920, height: 195,  width: 0.25, asymmetry: 1.10, conc: 0, unit: "", mark: "V" },
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

// ─── Custom chromatogram tooltip ───────────────────────────────────────────────

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

// ─── Vertical retention-time label rendered on the chart ──────────────────────

function PeakLabel({ viewBox, rt }: { viewBox?: { x: number; y: number }; rt: number }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text
      x={x + 4}
      y={y - 4}
      textAnchor="start"
      transform={`rotate(-90, ${x + 4}, ${y - 4})`}
      style={{ fontFamily: "Courier New, monospace", fontSize: 10, fill: "#111", userSelect: "none" }}
    >
      {fmtNum(rt, 3)}
    </text>
  );
}

// ─── Peak editor dialog ────────────────────────────────────────────────────────

function PeakEditorDialog({ peak, onSave, children }: { peak: Peak; onSave: (p: Peak) => void; children: React.ReactNode }) {
  const [draft, setDraft] = useState<Peak>({ ...peak });
  const [open, setOpen] = useState(false);

  function field<K extends keyof Peak>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const numericKeys: (keyof Peak)[] = ["retentionTime", "height", "width", "asymmetry", "conc"];
      setDraft(d => ({ ...d, [key]: numericKeys.includes(key) ? parseFloat(raw) || 0 : raw }));
    };
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setDraft({ ...peak })}>{children}</DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle style={{ fontFamily: "Courier New, monospace" }}>Editar Pico</DialogTitle></DialogHeader>
        <div className="space-y-2.5 pt-1">
          {([
            ["name", "Nome (ex: Cafeina)", "text"],
            ["retentionTime", "Ret. Time (min)", "number"],
            ["height", "Altura (mV)", "number"],
            ["width", "Largura σ (min)", "number"],
            ["asymmetry", "Assimetria", "number"],
            ["conc", "Conc.", "number"],
            ["unit", "Unidade (ex: mg/L)", "text"],
            ["mark", "Mark (V/SV/T/em branco)", "text"],
          ] as [keyof Peak, string, string][]).map(([k, label, type]) => (
            <div key={k} className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type={type}
                step={type === "number" ? "0.001" : undefined}
                value={draft[k] as string | number}
                onChange={field(k)}
                className="h-7 text-xs font-mono"
              />
            </div>
          ))}
          <Button className="w-full mt-1" size="sm" onClick={() => { onSave(draft); setOpen(false); }}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function HplcSimulator() {
  const [peaks, setPeaks] = useState<Peak[]>(DEFAULT_PEAKS);
  const [sample, setSample] = useState<SampleInfo>(DEFAULT_SAMPLE);
  const [detector, setDetector] = useState<DetectorInfo>(DEFAULT_DETECTOR);
  const [showControls, setShowControls] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const chromatogram = useMemo(
    () => buildChromatogram(peaks, detector.runTime),
    [peaks, detector.runTime]
  );

  const peakStats = useMemo(() => {
    const sorted = [...peaks].sort((a, b) => a.retentionTime - b.retentionTime);
    const totalArea = sorted.reduce((s, p) => s + computeArea(p), 0);
    const totalHeight = sorted.reduce((s, p) => s + p.height, 0);
    return sorted.map((p, i) => ({
      ...p,
      peakNum: i + 1,
      area: Math.round(computeArea(p)),
      totalArea,
      totalHeight,
    }));
  }, [peaks]);

  const totalArea = peakStats.reduce((s, p) => s + p.area, 0);
  const totalHeight = peakStats.reduce((s, p) => s + p.height, 0);

  const yMax = useMemo(() => {
    const max = Math.max(...chromatogram.map(d => d.signal), 100);
    return Math.ceil(max * 1.12 / 500) * 500;
  }, [chromatogram]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = 0; t <= detector.runTime; t += 2.5) ticks.push(parseFloat(t.toFixed(1)));
    return ticks;
  }, [detector.runTime]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = yMax <= 2000 ? 500 : yMax <= 5000 ? 1000 : 2000;
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMax]);

  const addPeak = useCallback(() => {
    const p: Peak = {
      id: uid(), name: "", mark: "V", unit: "", conc: 0,
      retentionTime: parseFloat((1 + Math.random() * (detector.runTime - 2)).toFixed(3)),
      height: Math.round(200 + Math.random() * 500),
      width: parseFloat((0.08 + Math.random() * 0.15).toFixed(3)),
      asymmetry: parseFloat((0.95 + Math.random() * 0.25).toFixed(2)),
    };
    setPeaks(ps => [...ps, p]);
  }, [detector.runTime]);

  const removePeak = useCallback((id: string) => setPeaks(ps => ps.filter(p => p.id !== id)), []);
  const savePeak = useCallback((updated: Peak) => setPeaks(ps => ps.map(p => p.id === updated.id ? updated : p)), []);

  const sField = (k: keyof SampleInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSample(s => ({ ...s, [k]: e.target.value }));
  const dField = (k: keyof DetectorInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetector(d => ({ ...d, [k]: k === "runTime" ? parseFloat(e.target.value) || 15 : e.target.value }));

  // ─── Render ────────────────────────────────────────────────────────────────

  const MONO: React.CSSProperties = { fontFamily: "Courier New, monospace" };
  const FIELD_COL = "#000";

  const now = new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", padding: "16px 8px" }}>
      {/* ── Controls bar (screen only) ───────────────────────────────────────── */}
      <div className="no-print max-w-[1100px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-blue-700" />
          <span style={{ ...MONO, fontWeight: "bold", fontSize: 13 }}>Simulador HPLC — Shimadzu LabSolutions</span>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setShowControls(v => !v)}>
          <Settings className="h-3.5 w-3.5" />
          {showControls ? "Ocultar Controles" : "Controles"}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
        </Button>
      </div>

      <div className={`max-w-[1100px] mx-auto flex gap-3 items-start ${showControls ? "" : "justify-center"}`}>

        {/* ── LEFT PANEL: controls (screen only) ───────────────────────────── */}
        {showControls && (
          <div className="no-print w-64 flex-shrink-0 space-y-3">

            {/* Sample info editor */}
            <div style={{ background: "#fff", border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
              <p style={{ ...MONO, fontSize: 11, fontWeight: "bold", marginBottom: 8 }}>Sample Information</p>
              {([
                ["sampleName", "Sample Name"],
                ["sampleId", "Sample ID"],
                ["dataFilename", "Data Filename"],
                ["methodFilename", "Method Filename"],
                ["batchFilename", "Batch Filename"],
                ["vialNo", "Vial #"],
                ["sampleType", "Sample Type"],
                ["injectionVolume", "Injection Volume"],
                ["dateAcquired", "Date Acquired"],
                ["acquiredBy", "Acquired by"],
                ["dateProcessed", "Date Processed"],
                ["processedBy", "Processed by"],
              ] as [keyof SampleInfo, string][]).map(([k, label]) => (
                <div key={k} className="mb-1.5">
                  <Label style={{ ...MONO, fontSize: 9, color: "#666" }}>{label}</Label>
                  <Input value={sample[k]} onChange={sField(k)} className="h-6 text-xs font-mono" style={{ fontSize: 10 }} />
                </div>
              ))}
            </div>

            {/* Detector editor */}
            <div style={{ background: "#fff", border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
              <p style={{ ...MONO, fontSize: 11, fontWeight: "bold", marginBottom: 8 }}>Detector</p>
              {([
                ["detectorName", "Detector Name"],
                ["wavelength", "Wavelength"],
              ] as [keyof DetectorInfo, string][]).map(([k, label]) => (
                <div key={k} className="mb-1.5">
                  <Label style={{ ...MONO, fontSize: 9, color: "#666" }}>{label}</Label>
                  <Input value={detector[k] as string} onChange={dField(k)} className="h-6 text-xs font-mono" style={{ fontSize: 10 }} />
                </div>
              ))}
              <div className="mb-1.5">
                <Label style={{ ...MONO, fontSize: 9, color: "#666" }}>Run Time (min)</Label>
                <Input type="number" min={5} max={60} step={1} value={detector.runTime} onChange={dField("runTime")} className="h-6 text-xs font-mono" style={{ fontSize: 10 }} />
              </div>
            </div>

            {/* Peaks editor */}
            <div style={{ background: "#fff", border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ ...MONO, fontSize: 11, fontWeight: "bold" }}>Picos</p>
                <Button size="sm" variant="outline" className="h-6 gap-1 text-xs px-2" onClick={addPeak}>
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              <div className="space-y-1">
                {[...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-1 group rounded px-1 py-0.5 hover:bg-gray-50">
                    <span style={{ ...MONO, fontSize: 10, width: 16, color: "#666" }}>{i + 1}</span>
                    <span style={{ ...MONO, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fmtNum(p.retentionTime, 3)} {p.name ? `(${p.name})` : ""}
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
              </div>
            </div>
          </div>
        )}

        {/* ── RIGHT: Shimadzu-style report ─────────────────────────────────── */}
        <div ref={reportRef} style={{ flex: 1, background: "#fff", border: "1px solid #bbb", boxShadow: "0 2px 8px rgba(0,0,0,.18)", padding: "28px 32px", minWidth: 0 }}>

          {/* ── REPORT HEADER ──────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
            <div />
            <div style={{ ...MONO, fontSize: 10, color: "#333", textAlign: "right" }}>
              {now} Page 1 / 1
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <span style={{ ...MONO, fontSize: 16, fontWeight: "bold" }}>Analysis Report</span>
          </div>

          {/* ── SAMPLE INFORMATION ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...MONO, fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>&lt;Sample Information&gt;</div>
            <table style={{ ...MONO, fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {([
                  [["Sample Name", sample.sampleName], ["Sample ID", sample.sampleId]],
                  [["Data Filename", sample.dataFilename], ["", ""]],
                  [["Method Filename", sample.methodFilename], ["", ""]],
                  [["Batch Filename", sample.batchFilename], ["", ""]],
                  [["Vial #", sample.vialNo], ["Sample Type", sample.sampleType]],
                  [["Injection Volume", sample.injectionVolume], ["", ""]],
                  [["Date Acquired", sample.dateAcquired], ["Acquired by", sample.acquiredBy]],
                  [["Date Processed", sample.dateProcessed], ["Processed by", sample.processedBy]],
                ] as [[string, string], [string, string]][]).map((row, ri) => (
                  <tr key={ri}>
                    {row.map(([label, val], ci) => label ? (
                      <td key={ci} style={{ padding: "0 8px 1px 0", whiteSpace: "nowrap", verticalAlign: "top", width: ci === 0 ? "50%" : "50%" }}>
                        <span style={{ display: "inline-block", minWidth: 140 }}>{label}</span>
                        <span style={{ color: FIELD_COL }}>: {val}</span>
                      </td>
                    ) : <td key={ci} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator style={{ borderColor: "#aaa", marginBottom: 12 }} />

          {/* ── CHROMATOGRAM ───────────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...MONO, fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>&lt;Chromatogram&gt;</div>

            <div style={{ position: "relative" }}>
              {/* mV label top-left */}
              <div style={{ ...MONO, fontSize: 11, position: "absolute", top: 0, left: 0, zIndex: 2 }}>mV</div>
              {/* Detector label top-right */}
              <div style={{ ...MONO, fontSize: 11, position: "absolute", top: 0, right: 0, zIndex: 2 }}>
                {detector.detectorName} {detector.wavelength}
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chromatogram} margin={{ top: 28, right: 16, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#ccc" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, detector.runTime]}
                    ticks={xTicks}
                    tickFormatter={v => fmtNum(v, 1)}
                    tick={{ fontFamily: "Courier New, monospace", fontSize: 10, fill: "#222" }}
                    label={{ value: "min", position: "right", offset: 8, fontFamily: "Courier New, monospace", fontSize: 11 }}
                    axisLine={{ stroke: "#444" }}
                    tickLine={{ stroke: "#444" }}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    ticks={yTicks}
                    tickFormatter={v => String(v)}
                    tick={{ fontFamily: "Courier New, monospace", fontSize: 10, fill: "#222" }}
                    axisLine={{ stroke: "#444" }}
                    tickLine={{ stroke: "#444" }}
                    width={48}
                  />
                  <Tooltip content={<ChromTooltip />} />

                  {/* Retention time reference lines with vertical labels */}
                  {[...peaks].sort((a, b) => a.retentionTime - b.retentionTime).map(p => (
                    <ReferenceLine
                      key={p.id}
                      x={p.retentionTime}
                      stroke="none"
                      label={(props: { viewBox?: { x: number; y: number } }) => (
                        <PeakLabel viewBox={props.viewBox} rt={p.retentionTime} />
                      )}
                    />
                  ))}

                  {/* Chromatogram line — black, no fill */}
                  <Line
                    type="monotone"
                    dataKey="signal"
                    stroke="#111"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <Separator style={{ borderColor: "#aaa", marginBottom: 12 }} />

          {/* ── PEAK TABLE ─────────────────────────────────────────────────── */}
          <div>
            <div style={{ ...MONO, fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>&lt;Peak Table&gt;</div>
            <div style={{ ...MONO, fontSize: 10.5, marginBottom: 4, color: "#333" }}>
              {detector.detectorName} {detector.wavelength}
            </div>

            <table style={{ ...MONO, fontSize: 10.5, borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #555" }}>
                  {["Peak#", "Ret. Time", "Area", "Height", "Conc.", "Unit", "Mark", "Name"].map(h => (
                    <th key={h} style={{ textAlign: "right", padding: "2px 10px 2px 0", fontWeight: "bold", whiteSpace: "nowrap" }}
                      className={h === "Name" || h === "Mark" || h === "Unit" ? "!text-left" : ""}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {peakStats.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ textAlign: "right", padding: "1.5px 10px 1.5px 0" }}>{p.peakNum}</td>
                    <td style={{ textAlign: "right", padding: "1.5px 10px 1.5px 0" }}>{fmtNum(p.retentionTime, 3)}</td>
                    <td style={{ textAlign: "right", padding: "1.5px 10px 1.5px 0" }}>{p.area.toLocaleString("pt-BR")}</td>
                    <td style={{ textAlign: "right", padding: "1.5px 10px 1.5px 0" }}>{p.height.toLocaleString("pt-BR")}</td>
                    <td style={{ textAlign: "right", padding: "1.5px 10px 1.5px 0" }}>
                      {p.conc > 0 ? fmtNum(p.conc, 3) : "0,000"}
                    </td>
                    <td style={{ textAlign: "left", padding: "1.5px 10px 1.5px 0" }}>{p.unit || ""}</td>
                    <td style={{ textAlign: "left", padding: "1.5px 10px 1.5px 0" }}>{p.mark || ""}</td>
                    <td style={{ textAlign: "left", padding: "1.5px 0" }}>{p.name || ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid #555" }}>
                  <td colSpan={2} style={{ padding: "2px 10px 2px 0", fontWeight: "bold" }}>Total</td>
                  <td style={{ textAlign: "right", padding: "2px 10px 2px 0", fontWeight: "bold" }}>{totalArea.toLocaleString("pt-BR")}</td>
                  <td style={{ textAlign: "right", padding: "2px 10px 2px 0", fontWeight: "bold" }}>{totalHeight.toLocaleString("pt-BR")}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── FOOTER ─────────────────────────────────────────────────────── */}
          <div style={{ ...MONO, fontSize: 9, color: "#555", marginTop: 20, textAlign: "center" }}>
            C:\LabSolutions\Data\{sample.dataFilename}
          </div>
        </div>
      </div>
    </div>
  );
}
