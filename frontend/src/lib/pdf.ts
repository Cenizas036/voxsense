// src/lib/pdf.ts
// npm install pdf-lib

export interface SessionData {
  id: string;
  uid?: string;
  gender: string;
  age: string;
  emotion: string;
  noise: string;
  createdAt: { seconds: number } | null;
  audioUrl?: string;
  audioDurationSec?: number;
  audioFileName?: string;
  rawPredictions?: {
    gender?: { label: string; confidence: number }[];
    age?: { label: string; confidence: number }[];
    emotion?: { label: string; confidence: number }[];
    noiseType?: string;
    noiseScene?: string;
    audioEnvironment?: string;
    isClean?: boolean;
    sceneConfidence?: number;
    noiseConfidence?: number;
    noiseBreakdown?: Record<string, number>;
    pitchHz?: number;
    pitchCategory?: string;
    vadSpeechRatio?: number;
    speakerEmbeddingNote?: string;
    modelComparison?: Record<string, {
      gender?: string; gender_conf?: number | null;
      age_label?: string; age_conf?: number | null;
      emotion?: string; emotion_conf?: number | null;
      error?: string;
    }>;
    majorityVote?: { gender?: string; age?: string; emotion?: string };
    audioType?: "speech" | "song";
    songSpeechLabel?: string;
    songSpeechConfidence?: number;
  };
}

export interface UserInfo {
  displayName: string | null;
  email: string | null;
  phone?: string | null;
  age?: string;
  gender?: string;
  occupation?: string;
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bgDark:    "#030308",
  bgCard:    "#0d0d1a",
  bgCard2:   "#0a0a14",
  purple:    "#7c3aed",
  indigo:    "#4f46e5",
  magenta:   "#c026d3",
  cyan:      "#06b6d4",
  gold:      "#b45309",
  green:     "#16a34a",
  red:       "#dc2626",
  textLight: "#f0f0ff",
  textMuted: "#94a3b8",
  border:    "#1e1b4b",
  white:     "#ffffff",
};

const EMOTION_COLOR: Record<string, string> = {
  neutral: "#6b7280", happy: "#f59e0b", sad: "#3b82f6",
  angry: "#ef4444", fear: "#8b5cf6", disgust: "#10b981", surprise: "#f97316",
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  rf: "Random Forest", svm: "SVM (RBF)", xgb: "XGBoost",
  cnn: "CNN (1D)", lstm: "Bi-LSTM",
  attentive_lstm: "Attentive LSTM", transformer_cnn: "Transformer+DSOM",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hex2rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function R(rgb: any, hex: string) {
  const [r, g, b] = hex2rgb(hex);
  return rgb(r, g, b);
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ─── Rounded rectangle via SVG path (pdf-lib has no drawRoundedRectangle) ─────
// pdf-lib coordinate system: y=0 is bottom-left.
// x, y = bottom-left corner of the rectangle (same convention as drawRectangle).
function drawRoundedRect(
  page: any,
  rgb: any,
  opts: {
    x: number; y: number; width: number; height: number;
    borderRadius: number;
    color?: any;
    borderColor?: any;
    borderWidth?: number;
    opacity?: number;
  }
) {
  const { x, y, width, height, borderRadius: r } = opts;
  const bw = opts.borderWidth ?? 0;

  // SVG path: origin is TOP-LEFT of the SVG coordinate space used by drawSvgPath.
  // drawSvgPath in pdf-lib uses a transform where y increases downward,
  // but the `x, y` position argument places the path's origin at that point
  // with y going up (PDF coords). We work entirely in PDF coords here.
  // The trick: pass x/y as the position, and build the path with (0,0) = bottom-left.

  // Build path starting from bottom-left, going clockwise.
  // pdf-lib SVG path: M, L, A, Z supported.
  const w = width, h = height;
  const rc = Math.min(r, w / 2, h / 2);

  // In PDF space y increases upward, but drawSvgPath expects SVG-style (y down).
  // So we pass `{ x, y: y + h }` as the anchor and build the path top-left origin.
  const path = [
    `M ${rc} 0`,
    `L ${w - rc} 0`,
    `A ${rc} ${rc} 0 0 1 ${w} ${rc}`,
    `L ${w} ${h - rc}`,
    `A ${rc} ${rc} 0 0 1 ${w - rc} ${h}`,
    `L ${rc} ${h}`,
    `A ${rc} ${rc} 0 0 1 0 ${h - rc}`,
    `L 0 ${rc}`,
    `A ${rc} ${rc} 0 0 1 ${rc} 0`,
    `Z`,
  ].join(" ");

  if (opts.color) {
    page.drawSvgPath(path, {
      x,
      y: y + height,
      color: opts.color,
      opacity: opts.opacity,
    });
  }

  if (opts.borderColor && bw > 0) {
    page.drawSvgPath(path, {
      x,
      y: y + height,
      borderColor: opts.borderColor,
      borderWidth: bw,
      color: undefined,
    });
  }
}

// ─── pdf-lib loader ───────────────────────────────────────────────────────────
async function loadPdfLib() {
  const mod = await import("pdf-lib");
  return { PDFDocument: mod.PDFDocument, rgb: mod.rgb, StandardFonts: mod.StandardFonts };
}

async function fetchLogoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch("/voxsense_logo.png");
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE BUILDER
// ═════════════════════════════════════════════════════════════════════════════
async function buildPage(
  pdfDoc: any, rgb: any,
  fontBold: any, fontReg: any, fontObl: any,
  logoImg: any,
  session: SessionData,
  userInfo?: UserInfo
) {
  const page = pdfDoc.addPage([595, 1400]);
  const { width } = page.getSize();
  const H = 1400;
  const margin = 36;
  const cw = width - margin * 2;
  const colW = (cw - 10) / 2;

  // ── Background ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: H, color: R(rgb, C.bgDark) });
  page.drawEllipse({ x: -40, y: H - 60, xScale: 140, yScale: 140, color: rgb(0.31, 0.14, 0.93), opacity: 0.1 });
  page.drawEllipse({ x: width + 40, y: 60, xScale: 130, yScale: 130, color: rgb(0.75, 0.10, 0.82), opacity: 0.07 });
  page.drawRectangle({ x: 0, y: H - 5, width, height: 5, color: R(rgb, C.purple) });

  // ── Header ──────────────────────────────────────────────────────────────────
  let curY = H - 44;

  if (logoImg) {
    const dims = logoImg.scale(0.09);
    page.drawImage(logoImg, { x: margin, y: curY - dims.height / 2 + 8, width: dims.width, height: dims.height });
  }

  const logoOffX = logoImg ? 50 : 0;
  page.drawText("VOXSENSE", { x: margin + logoOffX, y: curY + 4, size: 20, font: fontBold, color: R(rgb, C.purple) });
  page.drawText("Voice Intelligence Report", { x: margin + logoOffX, y: curY - 10, size: 8.5, font: fontReg, color: R(rgb, C.textMuted) });
  page.drawText(trunc(`Session: ${session.id}`, 36), { x: width - margin - 165, y: curY + 4, size: 7, font: fontObl, color: R(rgb, C.textMuted) });
  if (session.createdAt) {
    page.drawText(formatDate(session.createdAt.seconds), { x: width - margin - 165, y: curY - 9, size: 7.5, font: fontReg, color: R(rgb, C.textMuted) });
  }

  curY -= 26;
  page.drawLine({ start: { x: margin, y: curY }, end: { x: width - margin, y: curY }, thickness: 0.4, color: R(rgb, C.border) });
  curY -= 16;

  // ── Inner helpers ────────────────────────────────────────────────────────────
  function secHeader(label: string) {
    page.drawText(label, { x: margin, y: curY, size: 7, font: fontBold, color: R(rgb, C.purple) });
    page.drawLine({ start: { x: margin, y: curY - 5 }, end: { x: width - margin, y: curY - 5 }, thickness: 0.3, color: R(rgb, C.border) });
    curY -= 18;
  }

  function chip(label: string, value: string, x: number, y: number, accentHex: string, w: number) {
    const h = 40;
    // Card background
    drawRoundedRect(page, rgb, {
      x, y: y - h + 10, width: w, height: h,
      borderRadius: 7,
      color: R(rgb, C.bgCard),
      borderColor: R(rgb, accentHex),
      borderWidth: 0.7,
    });
    // Accent left bar (plain rectangle)
    page.drawRectangle({ x, y: y - h + 10, width: 3.5, height: h, color: R(rgb, accentHex) });
    page.drawText(label, { x: x + 9, y: y - 4, size: 6.5, font: fontBold, color: R(rgb, accentHex) });
    page.drawText(trunc(value, 22), { x: x + 9, y: y - 18, size: 11, font: fontBold, color: R(rgb, C.textLight) });
  }

  function confBar(label: string, conf: number, x: number, y: number, barW: number, hex: string) {
    page.drawText(trunc(label, 20), { x, y, size: 6.5, font: fontReg, color: R(rgb, C.textMuted) });
    const pct = Math.min(Math.max(conf, 0), 1);
    // Track
    drawRoundedRect(page, rgb, { x, y: y - 9, width: barW, height: 5, borderRadius: 2.5, color: R(rgb, C.bgCard) });
    // Fill
    if (pct > 0.01) {
      drawRoundedRect(page, rgb, { x, y: y - 9, width: barW * pct, height: 5, borderRadius: 2.5, color: R(rgb, hex) });
    }
    page.drawText(`${Math.round(pct * 100)}%`, { x: x + barW + 4, y: y - 7, size: 6.5, font: fontBold, color: R(rgb, hex) });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1 — VOICE ANALYSIS RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  secHeader("VOICE ANALYSIS RESULTS");
  const chipH = 46;
  chip("GENDER",   session.gender || "—", margin,             curY, C.purple,  colW);
  chip("AGE GROUP", session.age   || "—", margin + colW + 10, curY, C.gold,    colW);
  curY -= chipH;
  chip("EMOTION",  session.emotion || "—", margin,             curY, C.magenta, colW);
  chip("NOISE ENV", session.noise  || "—", margin + colW + 10, curY, C.cyan,    colW);
  curY -= chipH + 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2 — AUDIO RECORDING
  // ═══════════════════════════════════════════════════════════════════════════
  secHeader("AUDIO RECORDING");

  const audioBoxH = session.audioUrl?.startsWith("http") ? 82 : 66;
  drawRoundedRect(page, rgb, {
    x: margin, y: curY - audioBoxH + 10, width: cw, height: audioBoxH,
    borderRadius: 8,
    color: R(rgb, C.bgCard),
    borderColor: R(rgb, C.border),
    borderWidth: 0.5,
  });

  // Waveform icon
  const wvX = margin + 12, wvBaseY = curY - 14;
  const bars = [7, 13, 9, 17, 11, 19, 9, 15, 7, 11, 17, 9, 13, 7];
  bars.forEach((bh, i) => {
    page.drawRectangle({ x: wvX + i * 5.5, y: wvBaseY - bh / 2, width: 3.5, height: bh, color: R(rgb, C.purple), opacity: 0.6 });
  });

  const aX = wvX + bars.length * 5.5 + 12;
  page.drawText(trunc(session.audioFileName ?? "voice_recording.webm", 48), { x: aX, y: curY - 8,  size: 8.5, font: fontBold, color: R(rgb, C.textLight) });
  page.drawText(
    session.audioDurationSec != null ? `Duration: ${formatDuration(session.audioDurationSec)}` : "Duration: captured during session",
    { x: aX, y: curY - 21, size: 7.5, font: fontReg, color: R(rgb, C.textMuted) }
  );
  page.drawText("Format: WebM / WAV  ·  Captured via browser microphone",         { x: aX, y: curY - 33, size: 7, font: fontObl, color: R(rgb, C.textMuted) });
  page.drawText("Storage: Firebase Storage  ·  Privacy: end-to-end encrypted",    { x: aX, y: curY - 45, size: 7, font: fontObl, color: R(rgb, C.textMuted) });
  page.drawText("Note: Audio cannot be embedded in PDF — play from dashboard",    { x: aX, y: curY - 57, size: 6.5, font: fontObl, color: R(rgb, C.indigo) });

  if (session.audioUrl?.startsWith("http")) {
    page.drawText(`URL: ${trunc(session.audioUrl, 64)}`, { x: aX, y: curY - 69, size: 6.5, font: fontObl, color: R(rgb, C.indigo) });
  }

  curY -= audioBoxH + 8;

  const rp = session.rawPredictions;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3 — AUDIO TYPE (Speech / Song)
  // ═══════════════════════════════════════════════════════════════════════════
  if (rp?.audioType || rp?.songSpeechLabel) {
    secHeader("AUDIO CLASSIFICATION");
    const typeLabel = rp.audioType === "song" ? "Music / Song" : "Human Speech";
    page.drawText(typeLabel, { x: margin, y: curY, size: 10, font: fontBold, color: R(rgb, rp.audioType === "song" ? C.magenta : C.purple) });
    curY -= 14;
    if (rp.songSpeechLabel) {
      const barW = Math.min(180, cw / 2);
      confBar("Speech Classifier Confidence", (rp.songSpeechConfidence ?? 0) / 100, margin, curY, barW, C.green);
      curY -= 18;
    }
    curY -= 6;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4 — MODEL CONFIDENCE SCORES
  // ═══════════════════════════════════════════════════════════════════════════
  secHeader("MODEL CONFIDENCE SCORES");
  const barW = colW - 28;
  let leftY = curY, rightY = curY;

  // Left: Gender + Age
  if (rp?.gender?.length) {
    page.drawText("Gender Classifier", { x: margin, y: leftY, size: 7.5, font: fontBold, color: R(rgb, C.textLight) });
    leftY -= 11;
    for (const g of rp.gender.slice(0, 3)) {
      confBar(g.label, g.confidence / 100, margin + 6, leftY, barW, C.purple);
      leftY -= 15;
    }
    leftY -= 4;
  } else {
    page.drawText("Gender Classifier", { x: margin, y: leftY, size: 7.5, font: fontBold, color: R(rgb, C.textLight) });
    leftY -= 11;
    confBar("Male",   0, margin + 6, leftY, barW, C.purple); leftY -= 15;
    confBar("Female", 0, margin + 6, leftY, barW, C.purple); leftY -= 15;
    page.drawText("(no raw data)", { x: margin + 6, y: leftY + 6, size: 6, font: fontObl, color: R(rgb, C.textMuted) });
    leftY -= 6;
  }

  if (rp?.age?.length) {
    page.drawText("Age Estimator", { x: margin, y: leftY, size: 7.5, font: fontBold, color: R(rgb, C.textLight) });
    leftY -= 11;
    for (const a of rp.age.slice(0, 6)) {
      confBar(a.label, a.confidence / 100, margin + 6, leftY, barW, C.gold);
      leftY -= 15;
    }
    leftY -= 4;
  }

  // Right: Emotion
  const rightX = margin + colW + 10;
  if (rp?.emotion?.length) {
    page.drawText("Emotion Recognition (SER)", { x: rightX, y: rightY, size: 7.5, font: fontBold, color: R(rgb, C.textLight) });
    rightY -= 11;
    for (const e of rp.emotion.slice(0, 7)) {
      confBar(e.label, e.confidence / 100, rightX + 6, rightY, barW, EMOTION_COLOR[e.label.toLowerCase()] ?? C.magenta);
      rightY -= 15;
    }
    rightY -= 4;
  }

  curY = Math.min(leftY, rightY) - 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5 — NOISE & SIGNAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  secHeader("NOISE & SIGNAL ANALYSIS");

  const noiseLines: [string, string][] = [];
  if (rp?.noiseScene)            noiseLines.push(["Scene",               rp.noiseScene]);
  if (rp?.noiseType)             noiseLines.push(["Noise Type",          rp.noiseType]);
  if (rp?.audioEnvironment)      noiseLines.push(["Environment",         rp.audioEnvironment]);
  if (rp?.isClean !== undefined)  noiseLines.push(["Clean Audio",         rp.isClean ? "Yes" : "No"]);
  if (rp?.sceneConfidence !== undefined) noiseLines.push(["Scene Confidence", `${Math.round(rp.sceneConfidence * 100)}%`]);
  if (rp?.noiseConfidence !== undefined) noiseLines.push(["Noise Confidence", `${Math.round(rp.noiseConfidence * 100)}%`]);
  if (rp?.pitchHz !== undefined)  noiseLines.push(["Pitch (F0)",         `${rp.pitchHz.toFixed(1)} Hz${rp.pitchCategory ? ` — ${rp.pitchCategory}` : ""}`]);
  if (rp?.vadSpeechRatio !== undefined)  noiseLines.push(["Speech Ratio (VAD)", `${Math.round(rp.vadSpeechRatio * 100)}%`]);
  if (rp?.speakerEmbeddingNote)   noiseLines.push(["Speaker Embedder",   rp.speakerEmbeddingNote]);

  if (noiseLines.length === 0) {
    page.drawText("No noise analysis data available for this session.", { x: margin, y: curY, size: 7.5, font: fontObl, color: R(rgb, C.textMuted) });
    curY -= 14;
  } else {
    const mid = Math.ceil(noiseLines.length / 2);
    const leftLines  = noiseLines.slice(0, mid);
    const rightLines = noiseLines.slice(mid);
    const startY = curY;
    leftLines.forEach(([k, v]) => {
      page.drawText(`${k}:`, { x: margin,       y: curY, size: 7.5, font: fontBold, color: R(rgb, C.textMuted) });
      page.drawText(trunc(v, 30), { x: margin + 100, y: curY, size: 7.5, font: fontReg,  color: R(rgb, C.textLight) });
      curY -= 13;
    });
    let rColY = startY;
    rightLines.forEach(([k, v]) => {
      page.drawText(`${k}:`, { x: rightX,       y: rColY, size: 7.5, font: fontBold, color: R(rgb, C.textMuted) });
      page.drawText(trunc(v, 30), { x: rightX + 100, y: rColY, size: 7.5, font: fontReg,  color: R(rgb, C.textLight) });
      rColY -= 13;
    });
    curY = Math.min(curY, rColY);
  }

  // Noise breakdown bars
  if (rp?.noiseBreakdown && Object.keys(rp.noiseBreakdown).length > 0) {
    curY -= 4;
    page.drawText("Noise Type Breakdown", { x: margin, y: curY, size: 7.5, font: fontBold, color: R(rgb, C.textLight) });
    curY -= 11;
    const entries = Object.entries(rp.noiseBreakdown).sort(([, a], [, b]) => b - a).slice(0, 6);
    for (const [k, v] of entries) {
      confBar(k, v, margin + 6, curY, cw - 60, C.cyan);
      curY -= 15;
    }
  }
  curY -= 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 6 — MODEL COMPARISON TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (rp?.modelComparison && Object.keys(rp.modelComparison).length > 0) {
    secHeader("ML MODEL COMPARISON");

    // Majority vote header
    if (rp.majorityVote) {
      const mv = rp.majorityVote;
      drawRoundedRect(page, rgb, {
        x: margin, y: curY - 24 + 10, width: cw, height: 24,
        borderRadius: 6,
        color: R(rgb, C.bgCard),
        borderColor: R(rgb, C.indigo),
        borderWidth: 0.5,
      });
      let mvX = margin + 10;
      page.drawText("Consensus >>", { x: mvX, y: curY - 8, size: 7, font: fontBold, color: R(rgb, C.indigo) });
      mvX += 70;
      if (mv.gender)  { page.drawText(`Gender: ${mv.gender}`,   { x: mvX, y: curY - 8, size: 7.5, font: fontBold, color: R(rgb, C.purple) }); mvX += 90; }
      if (mv.age)     { page.drawText(`Age: ${mv.age}`,         { x: mvX, y: curY - 8, size: 7.5, font: fontBold, color: R(rgb, C.gold) });   mvX += 90; }
      if (mv.emotion) { page.drawText(`Emotion: ${mv.emotion}`, { x: mvX, y: curY - 8, size: 7.5, font: fontBold, color: R(rgb, EMOTION_COLOR[mv.emotion] ?? C.magenta) }); }
      curY -= 28;
    }

    // Table header
    const cols = [0, 120, 210, 310, 410];
    const headers = ["Model", "Gender", "Age", "Emotion", "Conf."];
    const rowH = 14;

    page.drawRectangle({ x: margin, y: curY - rowH + 4, width: cw, height: rowH, color: R(rgb, C.bgCard2) });
    headers.forEach((h, i) => {
      page.drawText(h, { x: margin + cols[i] + 4, y: curY - 8, size: 6.5, font: fontBold, color: R(rgb, C.textMuted) });
    });
    curY -= rowH;

    // Table rows
    for (const [key, pred] of Object.entries(rp.modelComparison)) {
      const name = MODEL_DISPLAY_NAMES[key] ?? key;
      if (pred.error) {
        page.drawText(name, { x: margin + 4, y: curY - 8, size: 7, font: fontReg, color: R(rgb, C.textMuted) });
        page.drawText(trunc(pred.error, 45), { x: margin + cols[1] + 4, y: curY - 8, size: 6.5, font: fontObl, color: R(rgb, C.red) });
      } else {
        const gColor = pred.gender === "Male" ? "#93c5fd" : "#f9a8d4";
        const eColor = EMOTION_COLOR[pred.emotion?.toLowerCase() ?? ""] ?? C.textMuted;
        page.drawText(trunc(name, 17),             { x: margin + cols[0] + 4, y: curY - 8, size: 7, font: fontReg,  color: R(rgb, "#c4b5fd") });
        page.drawText(pred.gender ?? "—",          { x: margin + cols[1] + 4, y: curY - 8, size: 7, font: fontReg,  color: R(rgb, gColor) });
        page.drawText(trunc(pred.age_label ?? "—", 14), { x: margin + cols[2] + 4, y: curY - 8, size: 7, font: fontReg, color: R(rgb, C.gold) });
        page.drawText(trunc(pred.emotion ?? "—", 12),   { x: margin + cols[3] + 4, y: curY - 8, size: 7, font: fontReg, color: R(rgb, eColor) });
        const confs = [pred.gender_conf, pred.age_conf, pred.emotion_conf].filter((c): c is number => c != null);
        if (confs.length) {
          const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
          page.drawText(`${avg.toFixed(0)}%`, { x: margin + cols[4] + 4, y: curY - 8, size: 7, font: fontBold, color: R(rgb, C.green) });
        }
      }
      page.drawLine({ start: { x: margin, y: curY - rowH + 4 }, end: { x: width - margin, y: curY - rowH + 4 }, thickness: 0.2, color: R(rgb, C.border) });
      curY -= rowH;
    }
    curY -= 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 7 — ML MODELS USED
  // ═══════════════════════════════════════════════════════════════════════════
  secHeader("ML MODELS USED");

  const models = [
    { name: "Gender Classifier",          desc: "Binary gender prediction from MFCC features",      color: C.purple },
    { name: "Age Estimator",              desc: "Multi-class age bracket regression",                color: C.gold },
    { name: "Emotion Recognition (SER)",  desc: "7-class speech emotion recognition",               color: C.magenta },
    { name: "Noise Environment Detector", desc: "Background noise classification & separation",     color: C.cyan },
    { name: "Voice Activity Detector",    desc: "Speech / silence segmentation (VAD)",              color: C.indigo },
    { name: "Pitch Analyzer",             desc: "F0 extraction, prosody & vocal range analysis",    color: C.green },
    { name: "Speaker Embedder",           desc: "d-vector speaker representation & identity",       color: C.textMuted },
  ];

  for (const m of models) {
    page.drawCircle({ x: margin + 5, y: curY - 2, size: 4, color: R(rgb, m.color) });
    page.drawText(m.name, { x: margin + 14, y: curY, size: 8, font: fontBold, color: R(rgb, C.textLight) });
    page.drawText(m.desc, { x: margin + 14 + 165, y: curY, size: 7.5, font: fontReg, color: R(rgb, C.textMuted) });
    page.drawLine({ start: { x: margin + 14, y: curY - 8 }, end: { x: width - margin, y: curY - 8 }, thickness: 0.2, color: R(rgb, C.border) });
    curY -= 20;
  }
  curY -= 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 8 — USER PROFILE
  // ═══════════════════════════════════════════════════════════════════════════
  if (userInfo) {
    secHeader("USER PROFILE");
    const fields: [string, string][] = [
      ["Name",       userInfo.displayName ?? "—"],
      ["Email",      userInfo.email ?? "—"],
      ["Phone",      userInfo.phone ?? "—"],
      ["Age",        userInfo.age ?? "—"],
      ["Gender",     userInfo.gender ?? "—"],
      ["Occupation", userInfo.occupation ?? "—"],
    ];
    for (const [label, val] of fields) {
      page.drawText(`${label}:`, { x: margin, y: curY, size: 7.5, font: fontBold, color: R(rgb, C.textMuted) });
      page.drawText(trunc(val, 55), { x: margin + 110, y: curY, size: 7.5, font: fontReg, color: R(rgb, C.textLight) });
      curY -= 13;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footY = 28;
  page.drawLine({ start: { x: margin, y: footY + 14 }, end: { x: width - margin, y: footY + 14 }, thickness: 0.3, color: R(rgb, C.border) });
  page.drawText("Generated by Voxsense Voice Intelligence  ·  voxsense.app",                          { x: margin, y: footY + 2,  size: 7,   font: fontObl, color: R(rgb, C.textMuted) });
  page.drawText("Powered by 7 state-of-the-art ML models  ·  Results are probabilistic, not definitive.", { x: margin, y: footY - 9, size: 6.5, font: fontObl, color: R(rgb, C.border) });
  page.drawText(new Date().toLocaleDateString("en-IN"), { x: width - margin - 60, y: footY + 2, size: 7, font: fontReg, color: R(rgb, C.textMuted) });
}

// ─── Public exports ───────────────────────────────────────────────────────────
export async function generateSessionPDF(session: SessionData, userInfo?: UserInfo): Promise<void> {
  const { PDFDocument, rgb, StandardFonts } = await loadPdfLib();
  const pdfDoc   = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontObl  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  let logoImg: any = null;
  const logoBytes = await fetchLogoBytes();
  if (logoBytes) { try { logoImg = await pdfDoc.embedPng(logoBytes); } catch { logoImg = null; } }

  await buildPage(pdfDoc, rgb, fontBold, fontReg, fontObl, logoImg, session, userInfo);

  const bytes = await pdfDoc.save();
  const blob  = new Blob([bytes as any], { type: "application/pdf" });
  const url   = URL.createObjectURL(blob);
  const a     = Object.assign(document.createElement("a"), { href: url, download: `voxsense_${session.id.slice(0, 8)}_${Date.now()}.pdf` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function generateAllSessionsPDF(sessions: SessionData[], userInfo?: UserInfo): Promise<void> {
  const { PDFDocument, rgb, StandardFonts } = await loadPdfLib();
  const combined = await PDFDocument.create();
  const fontBold = await combined.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await combined.embedFont(StandardFonts.Helvetica);
  const fontObl  = await combined.embedFont(StandardFonts.HelveticaOblique);
  let logoImg: any = null;
  const logoBytes = await fetchLogoBytes();
  if (logoBytes) { try { logoImg = await combined.embedPng(logoBytes); } catch { logoImg = null; } }

  for (const session of sessions) {
    await buildPage(combined, rgb, fontBold, fontReg, fontObl, logoImg, session, userInfo);
  }

  const bytes = await combined.save();
  const blob  = new Blob([bytes as any], { type: "application/pdf" });
  const url   = URL.createObjectURL(blob);
  const a     = Object.assign(document.createElement("a"), { href: url, download: `voxsense_all_sessions_${Date.now()}.pdf` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}