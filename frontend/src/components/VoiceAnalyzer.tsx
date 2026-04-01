"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import VoiceLoadingScreen from "./VoiceLoadingScreen";

// ── Types ──────────────────────────────────────────────────────────────
type Stage = "noise" | "filtering" | "emotion" | "profile";

interface ModelPrediction {
  gender?: string;
  gender_conf?: number | null;
  age_bucket?: number;
  age_label?: string;
  age_conf?: number | null;
  emotion?: string;
  emotion_conf?: number | null;
  emotion_probs?: Record<string, number>;
  error?: string;
}

interface MajorityVote {
  gender?: string;
  age?: string;
  emotion?: string;
}

interface NoiseDetail {
  scene: string;
  scene_confidence: number;
  noise_type: string;
  noise_confidence: number;
  noise_breakdown: Record<string, number>;
  audio_environment?: string;
  is_clean?: boolean;
}

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  emotion?: string;
  confidence?: number;
}

interface AnalysisResult {
  type: "speech" | "song" | "noise";
  audio_environment?: string;
  avatar_url?: string;
  gender?: { label: string; confidence: number };
  age?: { label: string; confidence: number };
  emotion?: { label: string; confidence: number; breakdown?: Record<string, number> };
  song_speech?: { label: string; confidence: number };
  plot_url?: string;
  label?: string;
  confidence?: number;
  model_comparison?: Record<string, ModelPrediction>;
  majority_vote?: MajorityVote;
  noise_detail?: NoiseDetail;
  transcript?: TranscriptSegment[];
}

// ── Constants ──────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const MODEL_DISPLAY_NAMES: Record<string, string> = {  svm:             "SVM (RBF)",
  xgb:             "XGBoost",
  cnn:             "CNN (1D)",
  lstm:            "Bi-LSTM",
  attentive_lstm:  "Attentive LSTM",
  transformer_cnn: "Transformer+DSOM",
};

const MODEL_ORDER = ["svm", "xgb", "cnn", "lstm", "attentive_lstm", "transformer_cnn"];

const EMOTION_EMOJI: Record<string, string> = {
  neutral: "😐", happy: "😊", sad: "😢",
  angry: "😠", fear: "😨", disgust: "🤢", surprise: "😲",
};

const EMOTION_COLOR: Record<string, string> = {
  neutral: "#6b7280", happy: "#f59e0b", sad: "#3b82f6",
  angry: "#ef4444", fear: "#8b5cf6", disgust: "#10b981", surprise: "#f97316",
};

// ── Helpers ────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Theme hook ─────────────────────────────────────────────────────────
function useIsDark() {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// ── Animated Background ────────────────────────────────────────────────
function AnimatedBackground({ isDark }: { isDark: boolean }) {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${(i * 4.3 + 5) % 100}%`,
    size: `${2 + (i % 4)}px`,
    duration: `${7 + (i % 9)}s`,
    delay: `${(i * 0.4) % 10}s`,
    opacity: 0.3 + (i % 5) * 0.1,
  }));

  if (isDark) {
    return (
      <div className="fixed inset-0 -z-10 overflow-hidden" style={{ background: "linear-gradient(145deg, #030308 0%, #0a0520 40%, #0d0a1a 70%, #030308 100%)" }}>
        {/* Vivid aurora blobs */}
        <div className="animate-aurora-1 absolute rounded-full blur-[140px]" style={{
          width: "900px", height: "900px",
          backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.4) 0%, rgba(79,70,229,0.15) 40%, transparent 70%)",
          top: "-280px", left: "-220px",
        }} />
        <div className="animate-aurora-2 absolute rounded-full blur-[120px]" style={{
          width: "750px", height: "750px",
          backgroundImage: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(79,70,229,0.1) 40%, transparent 70%)",
          bottom: "-200px", right: "-150px",
        }} />
        <div className="animate-aurora-3 absolute rounded-full blur-[160px]" style={{
          width: "600px", height: "600px",
          backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.22) 0%, rgba(192,38,211,0.08) 40%, transparent 70%)",
          top: "35%", left: "55%", transform: "translate(-50%,-50%)",
        }} />
        {/* Extra teal aurora */}
        <div className="animate-aurora-2 absolute rounded-full blur-[100px]" style={{
          width: "400px", height: "400px",
          backgroundImage: "radial-gradient(circle, rgba(20,184,166,0.2) 0%, transparent 70%)",
          top: "60%", left: "15%",
        }} />
        {/* Constellation particles */}
        {particles.map((p) => (
          <div key={p.id} className="absolute rounded-full" style={{
            left: p.left, bottom: "-10px",
            width: p.size, height: p.size,
            backgroundColor: p.id % 3 === 0 ? "rgba(6,182,212,0.6)" : p.id % 3 === 1 ? "rgba(167,139,250,0.6)" : "rgba(236,72,153,0.5)",
            boxShadow: `0 0 8px ${p.id % 3 === 0 ? "rgba(6,182,212,0.8)" : p.id % 3 === 1 ? "rgba(167,139,250,0.8)" : "rgba(236,72,153,0.7)"}`,
            animation: `float-particle ${p.duration} ${p.delay} linear infinite`,
            opacity: p.opacity,
          }} />
        ))}
        {/* Animated grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />
        {/* Star dots */}
        {Array.from({ length: 40 }, (_, i) => (
          <div key={`star-${i}`} className="absolute rounded-full" style={{
            width: i % 4 === 0 ? 3 : 1.5, height: i % 4 === 0 ? 3 : 1.5,
            left: `${(i * 2.7 + 3) % 100}%`, top: `${(i * 3.1 + 8) % 100}%`,
            backgroundColor: "rgba(255,255,255,0.4)",
            boxShadow: i % 4 === 0 ? "0 0 6px rgba(255,255,255,0.5)" : "none",
            animation: `twinkle ${3 + (i % 5)}s ${(i * 0.3) % 5}s ease-in-out infinite`,
          }} />
        ))}
        {/* Deep vignette */}
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at center, transparent 35%, rgba(3,3,8,0.85) 100%)" }} />
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(3,3,8,0.3)" }} />
      </div>
    );
  }

  // Light mode — vibrant colorful gradient mesh
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" style={{
      background: "linear-gradient(135deg, #faf5ff 0%, #ede9fe 15%, #e0f2fe 30%, #fce7f3 50%, #ede9fe 70%, #f0fdf4 85%, #faf5ff 100%)",
    }}>
      {/* Large animated orbs — multi-color */}
      <div className="animate-aurora-1 absolute rounded-full blur-[130px]" style={{
        width: "700px", height: "700px",
        backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.1) 50%, transparent 70%)",
        top: "-120px", left: "-100px",
      }} />
      <div className="animate-aurora-2 absolute rounded-full blur-[110px]" style={{
        width: "600px", height: "600px",
        backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.2) 0%, rgba(244,114,182,0.08) 50%, transparent 70%)",
        bottom: "-80px", right: "-60px",
      }} />
      <div className="animate-aurora-3 absolute rounded-full blur-[100px]" style={{
        width: "500px", height: "500px",
        backgroundImage: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(6,182,212,0.06) 50%, transparent 70%)",
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      }} />
      {/* Accent orbs — pastel variety */}
      {[
        { top: "10%", left: "70%", size: 220, color: "rgba(251,191,36,0.12)" },
        { top: "55%", left: "15%", size: 180, color: "rgba(52,211,153,0.12)" },
        { top: "75%", left: "80%", size: 140, color: "rgba(99,102,241,0.1)" },
        { top: "20%", left: "35%", size: 160, color: "rgba(244,114,182,0.1)" },
        { top: "85%", left: "45%", size: 120, color: "rgba(14,165,233,0.1)" },
      ].map((orb, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: orb.size, height: orb.size, top: orb.top, left: orb.left,
          backgroundColor: orb.color, filter: "blur(50px)",
          animation: `float-particle ${9 + i * 2.5}s ${i * 1.5}s ease-in-out infinite alternate`,
        }} />
      ))}
      {/* Colorful dot pattern */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.15) 1px, transparent 1px)",
        backgroundSize: "28px 28px", opacity: 0.6,
      }} />
      {/* Diagonal accent lines */}
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(135deg, rgba(124,58,237,0.05) 0px, rgba(124,58,237,0.05) 1px, transparent 1px, transparent 50px)`,
      }} />
      {/* Glassmorphism shapes */}
      <div className="absolute" style={{
        top: "6%", right: "6%", width: 180, height: 180,
        borderRadius: "32px", transform: "rotate(45deg)",
        background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(236,72,153,0.04))",
        border: "1px solid rgba(139,92,246,0.15)",
        backdropFilter: "blur(20px)",
        animation: "float-particle 12s ease-in-out infinite alternate",
      }} />
      <div className="absolute" style={{
        bottom: "10%", left: "4%", width: 130, height: 130,
        borderRadius: "50%",
        background: "linear-gradient(135deg, rgba(14,165,233,0.05), rgba(52,211,153,0.04))",
        border: "1px solid rgba(14,165,233,0.12)",
        backdropFilter: "blur(20px)",
        animation: "float-particle 15s 2s ease-in-out infinite alternate",
      }} />
      <div className="absolute" style={{
        top: "45%", right: "12%", width: 100, height: 100,
        borderRadius: "24px",
        background: "linear-gradient(135deg, rgba(251,191,36,0.05), rgba(244,114,182,0.04))",
        border: "1px solid rgba(251,191,36,0.12)",
        backdropFilter: "blur(20px)",
        animation: "float-particle 10s 3s ease-in-out infinite alternate",
      }} />
    </div>
  );
}

// ── Recording Animation ────────────────────────────────────────────────
function RecordingAnimation({ isDark, elapsedSec }: { isDark: boolean; elapsedSec: number }) {
  const bars = Array.from({ length: 32 }, (_, i) => i);
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
      {/* Pulsing rings + mic icon */}
      <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Outer pulsing ring */}
        <div style={{
          position: "absolute", inset: -8, borderRadius: "50%",
          border: "2px solid rgba(239,68,68,0.4)",
          animation: "recording-ring-1 1.8s ease-out infinite",
        }} />
        {/* Middle pulsing ring */}
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: "2px solid rgba(239,68,68,0.6)",
          animation: "recording-ring-2 1.8s ease-out infinite",
        }} />
        {/* Inner glow circle */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #ef4444, #dc2626)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px rgba(239,68,68,0.5), 0 0 48px rgba(239,68,68,0.25)",
          animation: "recording-glow 1.2s ease-in-out infinite alternate",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
          </svg>
        </div>
      </div>
      {/* Animated waveform bars */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, height: 36 }}>
        {bars.map((i) => (
          <div key={i} style={{
            width: 3, borderRadius: 2,
            backgroundImage: "linear-gradient(to top, #ef4444, #f87171)",
            animation: `recording-bar 0.6s ${i * 0.04}s ease-in-out infinite alternate`,
            boxShadow: "0 0 4px rgba(239,68,68,0.3)",
          }} />
        ))}
      </div>
      {/* Timer */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 16px", borderRadius: 20,
        background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.2)"}`,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ef4444",
          animation: "recording-dot 1s ease-in-out infinite",
          boxShadow: "0 0 6px rgba(239,68,68,0.6)",
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: "#f87171", fontVariantNumeric: "tabular-nums" }}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

// ── Idle Waveform (not recording) ─────────────────────────────────────
function IdleWaveform({ isDark }: { isDark: boolean }) {
  const bars = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 40, marginTop: 4, marginBottom: 4 }}>
      {bars.map((i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          height: `${12 + (i % 5) * 5}px`,
          backgroundColor: isDark ? "rgba(167,139,250,0.25)" : "rgba(109,40,217,0.15)",
          transition: "height 0.3s ease",
        }} />
      ))}
    </div>
  );
}

// ── Loading Dots ───────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <span className="inline-flex gap-1 ml-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full bg-purple-300"
          style={{ animation: `bounce-dot 1.4s ease-in-out ${i * 0.16}s infinite` }} />
      ))}
    </span>
  );
}

// ── ConfidenceBar ──────────────────────────────────────────────────────
function ConfidenceBar({ value, color = "#6366f1", label, isDark }: {
  value: number; color?: string; label?: string; isDark: boolean;
}) {
  const trackColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)";
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs mb-1.5">
          <span style={{ color: isDark ? "#9ca3af" : "#6b7280" }} className="font-medium">{label}</span>
          <span className="font-semibold tabular-nums" style={{ color }}>{value.toFixed(1)}%</span>
        </div>
      )}
      <div className="w-full rounded-full overflow-hidden" style={{
        height: "6px", backgroundColor: trackColor,
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
      }}>
        <div className="h-full rounded-full progress-bar-animated" style={{
          width: `${Math.min(value, 100)}%`,
          backgroundImage: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: `0 0 8px ${color}60`,
        }} />
      </div>
    </div>
  );
}

// ── AgreeBadge ─────────────────────────────────────────────────────────
function AgreeBadge({ agrees }: { agrees: boolean }) {
  return agrees ? (
    <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{
      backgroundColor: "rgba(16,185,129,0.15)", color: "#34d399",
      border: "1px solid rgba(16,185,129,0.25)",
    }}>✓</span>
  ) : (
    <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{
      backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171",
      border: "1px solid rgba(239,68,68,0.2)",
    }}>✗</span>
  );
}

// ── ModelRow ───────────────────────────────────────────────────────────
function ModelRow({ modelKey, pred, majority, isDark }: {
  modelKey: string; pred: ModelPrediction; majority: MajorityVote; isDark: boolean;
}) {
  const nameColor  = isDark ? "#c4b5fd" : "#5b21b6";
  const subtleText = isDark ? "#6b7280" : "#9ca3af";

  if (pred.error) {
    return (
      <tr style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.07)"}` }}>
        <td className="py-2.5 px-3 text-sm font-medium whitespace-nowrap" style={{ color: nameColor }}>
          {MODEL_DISPLAY_NAMES[modelKey] ?? modelKey}
        </td>
        <td colSpan={3} className="py-2.5 px-3 text-xs italic" style={{ color: "#f87171" }}>{pred.error}</td>
      </tr>
    );
  }

  const genderAgrees  = !!majority.gender  && pred.gender    === majority.gender;
  const ageAgrees     = !!majority.age     && pred.age_label === majority.age;
  const emotionAgrees = !!majority.emotion && pred.emotion   === majority.emotion;

  return (
    <tr className="transition-colors duration-150" style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(109,40,217,0.06)"}` }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = isDark ? "rgba(124,58,237,0.06)" : "rgba(109,40,217,0.04)")}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <td className="py-2.5 px-3 text-sm font-semibold whitespace-nowrap" style={{ color: nameColor }}>
        {MODEL_DISPLAY_NAMES[modelKey] ?? modelKey}
      </td>
      <td className="py-2.5 px-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="font-medium" style={{ color: pred.gender === "Male" ? "#93c5fd" : "#f9a8d4" }}>{pred.gender ?? "—"}</span>
          {pred.gender_conf != null && <span className="text-xs" style={{ color: subtleText }}>({pred.gender_conf}%)</span>}
          <AgreeBadge agrees={genderAgrees} />
        </div>
      </td>
      <td className="py-2.5 px-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="font-medium" style={{ color: "#fcd34d" }}>{pred.age_label ?? "—"}</span>
          {pred.age_conf != null && <span className="text-xs" style={{ color: subtleText }}>({pred.age_conf}%)</span>}
          <AgreeBadge agrees={ageAgrees} />
        </div>
      </td>
      <td className="py-2.5 px-3 text-sm">
        <div className="flex items-center gap-1">
          <span>{EMOTION_EMOJI[pred.emotion ?? ""] ?? ""}</span>
          <span className="capitalize font-medium" style={{ color: EMOTION_COLOR[pred.emotion ?? ""] ?? "#9ca3af" }}>{pred.emotion ?? "—"}</span>
          {pred.emotion_conf != null && <span className="text-xs" style={{ color: subtleText }}>({pred.emotion_conf}%)</span>}
          <AgreeBadge agrees={emotionAgrees} />
        </div>
      </td>
    </tr>
  );
}

// ── ModelComparisonPanel ───────────────────────────────────────────────
function ModelComparisonPanel({ comparison, majority, isDark }: {
  comparison: Record<string, ModelPrediction>; majority: MajorityVote; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const orderedKeys = MODEL_ORDER.filter(k => k in comparison);
  const extraKeys   = Object.keys(comparison).filter(k => !MODEL_ORDER.includes(k) && k !== "our_cnn");
  const allKeys     = [...orderedKeys, ...extraKeys];

  const totalModels       = allKeys.filter(k => !comparison[k]?.error).length;
  const genderAgreements  = allKeys.filter(k => !comparison[k]?.error && comparison[k]?.gender    === majority.gender).length;
  const ageAgreements     = allKeys.filter(k => !comparison[k]?.error && comparison[k]?.age_label === majority.age).length;
  const emotionAgreements = allKeys.filter(k => !comparison[k]?.error && comparison[k]?.emotion   === majority.emotion).length;

  const panelBg    = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.8)";
  const panelBdr   = isDark ? "rgba(124,58,237,0.2)"  : "rgba(124,58,237,0.15)";
  const hdrBg      = isDark ? "rgba(0,0,0,0.3)"       : "rgba(124,58,237,0.05)";
  const consBg     = isDark ? "rgba(99,102,241,0.08)"  : "rgba(99,102,241,0.07)";
  const consBdr    = isDark ? "rgba(99,102,241,0.2)"   : "rgba(99,102,241,0.15)";
  const tblBdr     = isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)";
  const theadBg    = isDark ? "rgba(0,0,0,0.5)"        : "rgba(109,40,217,0.07)";
  const thColor    = isDark ? "#6b7280" : "#4b5563";
  const subColor   = isDark ? "#6b7280" : "#6b7280";
  const headingColor = isDark ? "white" : "#0f172a";

  return (
    <div className="mt-6 rounded-2xl overflow-hidden animate-slide-up" style={{
      backgroundColor: panelBg, border: `1px solid ${panelBdr}`,
      boxShadow: isDark ? "0 4px 30px rgba(124,58,237,0.08)" : "0 4px 20px rgba(109,40,217,0.06)",
    }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 transition-colors duration-200"
        style={{ backgroundColor: hdrBg }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = isDark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.06)")}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = hdrBg)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{
            backgroundColor: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)",
          }}>🔬</div>
          <div className="text-left">
            <div className="font-semibold text-sm font-syne" style={{ color: headingColor }}>Model Comparison</div>
            <div className="text-xs" style={{ color: subColor }}>{allKeys.length} models evaluated</div>
          </div>
        </div>
        <div className="w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-300" style={{
          backgroundColor: "rgba(124,58,237,0.2)",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        }}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1L5 5L9 1" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 py-4 animate-slide-up">
          {(majority.gender || majority.age || majority.emotion) && (
            <div className="mb-5 p-4 rounded-xl" style={{ backgroundColor: consBg, border: `1px solid ${consBdr}` }}>
              <p className="text-xs font-bold mb-3 uppercase tracking-widest" style={{ color: "#818cf8" }}>⚡ Majority Vote Consensus</p>
              <div className="flex flex-wrap gap-5 text-sm mb-4">
                {majority.gender && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: subColor }} className="text-xs uppercase tracking-wide">Gender</span>
                    <span className="font-bold px-2 py-0.5 rounded-lg text-xs" style={{
                      color: majority.gender === "Male" ? "#93c5fd" : "#f9a8d4",
                      backgroundColor: majority.gender === "Male" ? "rgba(147,197,253,0.1)" : "rgba(249,168,212,0.1)",
                      border: `1px solid ${majority.gender === "Male" ? "rgba(147,197,253,0.2)" : "rgba(249,168,212,0.2)"}`,
                    }}>{majority.gender}</span>
                    <span className="text-xs" style={{ color: subColor }}>{genderAgreements}/{totalModels}</span>
                  </div>
                )}
                {majority.age && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: subColor }} className="text-xs uppercase tracking-wide">Age</span>
                    <span className="font-bold px-2 py-0.5 rounded-lg text-xs" style={{ color: "#fcd34d", backgroundColor: "rgba(252,211,77,0.1)", border: "1px solid rgba(252,211,77,0.2)" }}>{majority.age}</span>
                    <span className="text-xs" style={{ color: subColor }}>{ageAgreements}/{totalModels}</span>
                  </div>
                )}
                {majority.emotion && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: subColor }} className="text-xs uppercase tracking-wide">Emotion</span>
                    <span className="font-bold px-2 py-0.5 rounded-lg text-xs capitalize" style={{
                      color: EMOTION_COLOR[majority.emotion] ?? "#9ca3af",
                      backgroundColor: EMOTION_COLOR[majority.emotion] ? `${EMOTION_COLOR[majority.emotion]}18` : "rgba(156,163,175,0.1)",
                      border: EMOTION_COLOR[majority.emotion] ? `1px solid ${EMOTION_COLOR[majority.emotion]}30` : "1px solid rgba(156,163,175,0.2)",
                    }}>{EMOTION_EMOJI[majority.emotion] ?? ""} {majority.emotion}</span>
                    <span className="text-xs" style={{ color: subColor }}>{emotionAgreements}/{totalModels}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ConfidenceBar value={(genderAgreements / Math.max(totalModels, 1)) * 100} color="#60a5fa" label="Gender agreement" isDark={isDark} />
                <ConfidenceBar value={(ageAgreements / Math.max(totalModels, 1)) * 100} color="#fbbf24" label="Age agreement" isDark={isDark} />
                <ConfidenceBar value={(emotionAgreements / Math.max(totalModels, 1)) * 100} color={EMOTION_COLOR[majority.emotion ?? ""] ?? "#6366f1"} label="Emotion agreement" isDark={isDark} />
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${tblBdr}` }}>
            <table className="w-full text-left">
              <thead>
                <tr style={{ backgroundColor: theadBg }}>
                  {["Model", "Gender", "Age", "Emotion"].map(h => (
                    <th key={h} className="py-2.5 px-3 text-xs font-bold uppercase tracking-widest" style={{ color: thColor }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allKeys.map(key => (
                  <ModelRow key={key} modelKey={key} pred={comparison[key]} majority={majority} isDark={isDark} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, confidence, isDark }: {
  icon: string; label: string; value: string; color: string; confidence?: number; isDark: boolean;
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2 animate-slide-up" style={{
      backgroundImage: `linear-gradient(135deg, ${color}0d 0%, ${isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.6)"} 100%)`,
      border: `1px solid ${color}25`,
      boxShadow: `0 4px 20px ${color}${isDark ? "10" : "15"}`,
    }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: `${color}${isDark ? "99" : "cc"}` }}>{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="font-bold text-xl font-syne" style={{ color: isDark ? "white" : "#0f172a" }}>{value}</div>
      {confidence !== undefined && <ConfidenceBar value={confidence} color={color} isDark={isDark} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Main VoiceAnalyzer component
// ══════════════════════════════════════════════════════════════════════
export default function VoiceAnalyzer({ onResult, onSaveProfile }: {
  onResult?: (result: {
    gender?: string;
    age?: string;
    emotion?: string;
    noise?: string;
    rawAnalysis?: any;
    audioUrl?: string;
    audioDurationSec?: number;
    audioFileName?: string;
    audioBlob?: Blob;
    transcript?: TranscriptSegment[];
  }) => void;
  onSaveProfile?: (gender: string, age: string) => void;
} = {}) {
  const isDark = useIsDark();

  const [audioBlob,    setAudioBlob]    = useState<Blob | null>(null);
  const [audioUrl,     setAudioUrl]     = useState<string | null>(null);
  const [isRecording,  setIsRecording]  = useState(false);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);
  const [loadingStage, setLoadingStage] = useState<Stage>("noise");
  const [noiseResult,  setNoiseResult]  = useState<any>(null);
  const [result,       setResult]       = useState<AnalysisResult | null>(null);
  const [showModal,    setShowModal]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [mounted,      setMounted]      = useState(false);
  const [transcript,   setTranscript]   = useState<TranscriptSegment[]>([]);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [hasAnalyser,  setHasAnalyser]  = useState(false);
  const [liveSegments, setLiveSegments] = useState<{text: string; emotion?: string}[]>([]);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const fileInputRef      = useRef<HTMLInputElement | null>(null);
  const recognitionRef    = useRef<any>(null);
  const transcriptBuf     = useRef<TranscriptSegment[]>([]);
  const audioContextRef   = useRef<AudioContext | null>(null);
  const analyserRef       = useRef<AnalyserNode | null>(null);
  const canvasRef         = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef      = useRef<number>(0);
  const recordStartRef    = useRef<number>(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // ── Recording elapsed timer ──────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      setRecordingElapsed(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  // ── Live waveform drawing ──────────────────────────────────────────
  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    const bars = 48;
    const barW = w / bars;
    for (let i = 0; i < bars; i++) {
      const idx = Math.floor(i * bufLen / bars);
      const val = data[idx] / 255;
      const barH = val * h * 0.85 + 2;
      const gradient = ctx.createLinearGradient(0, h, 0, h - barH);
      gradient.addColorStop(0, "rgba(124,58,237,0.3)");
      gradient.addColorStop(1, "rgba(192,38,211,0.8)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(i * barW + 1, h - barH, barW - 2, barH, 2);
      ctx.fill();
    }
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  // ── Blocked scripts (Urdu, Arabic) ────────────────────────────────
  const BLOCKED_SCRIPTS = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0980-\u09FF\u0A00-\u0A7F]/;
  // Bengali (\u0980-\u09FF) included for filtering only Arabic/Urdu:
  // Actually user said block Urdu/Arabic ONLY. Bengali is wanted.
  const BLOCKED_URDU_ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

  // ── Record ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      // ── Setup live waveform (AnalyserNode) ──
      try {
        const actx = new AudioContext();
        const source = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = actx;
        analyserRef.current = analyser;
        setHasAnalyser(true);
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      } catch { /* no waveform if AudioContext fails */ }

      // ── Setup Web Speech API transcript ──
      recordStartRef.current = Date.now();
      transcriptBuf.current = [];
      setTranscript([]);
      setLiveTranscript("");
      setLiveSegments([]);
      try {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = ""; // auto-detect
          recognition.maxAlternatives = 1;
          recognition.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const text = event.results[i][0].transcript;
              // Block Urdu/Arabic scripts
              if (BLOCKED_URDU_ARABIC.test(text)) continue;
              if (event.results[i].isFinal) {
                const now = (Date.now() - recordStartRef.current) / 1000;
                const seg = { text: text.trim(), start: Math.max(0, now - 3), end: now };
                transcriptBuf.current.push(seg);
                // Add to live segments with a rotating emotion from context
                setLiveSegments(prev => [...prev, { text: text.trim() }]);
              } else {
                interim += text;
              }
            }
            setLiveTranscript(interim);
          };
          recognition.onerror = () => {};
          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch { /* speech recognition not supported */ }

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch {
      setError("Microphone access denied. Please allow microphone permissions.");
    }
  }, [drawWaveform]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setLiveTranscript("");
    // Stop speech recognition
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    // Stop waveform
    cancelAnimationFrame(animFrameRef.current);
    try { audioContextRef.current?.close(); } catch {}
    audioContextRef.current = null;
    analyserRef.current = null;
    setHasAnalyser(false);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setError(null);
    setTranscript([]);
    setLiveTranscript("");
    setLiveSegments([]);
    transcriptBuf.current = [];
  }, []);

  // ── Analyze ─────────────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (!audioBlob) return;
    setIsAnalyzing(true);
    setIsLoading(true);
    setLoadingStage("noise");
    setNoiseResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      
      // Determine if text was actually spoken during a mic recording
      const isUpload = audioBlob instanceof File;
      formData.append("source", isUpload ? "upload" : "mic");
      formData.append("has_transcript", transcriptBuf.current.length > 0 ? "true" : "false");
      
      const res = await fetch(`${API_BASE}/analyze-audio`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`);

      const data: AnalysisResult = await res.json();

      if (data.noise_detail) {
        setNoiseResult({
          scene:             data.noise_detail.scene,
          scene_confidence:  data.noise_detail.scene_confidence,
          noise_type:        data.noise_detail.noise_type,
          noise_confidence:  data.noise_detail.noise_confidence,
          noise_breakdown:   data.noise_detail.noise_breakdown,
          audio_environment: data.audio_environment ?? data.noise_detail.scene,
          is_clean:          data.noise_detail.noise_type === "noiseless",
        });
      }

      setLoadingStage("filtering"); await sleep(500);
      setLoadingStage("emotion");   await sleep(450);
      setLoadingStage("profile");   await sleep(400);

      // ── Per-sentence emotion analysis ──────────────────────────────
      // If we uploaded a file instead of recording, ANY live transcript currently in memory is guaranteed
      // to be leftover "ghost" data from a past recording session. Safely wipe it.
      if (audioBlob instanceof File) {
        transcriptBuf.current = [];
      }
      
      let segments = transcriptBuf.current;
      
      // Only wipe transcript for pure noise — for speech and song, keep transcript if it exists
      if (data.type === "noise") {
        segments = [];
        transcriptBuf.current = [];
      } else if (segments.length > 0 && audioBlob) {
        // Speech or song WITH a transcript — run per-segment emotion analysis
        try {
          const segForm = new FormData();
          segForm.append("file", audioBlob, "audio.webm");
          segForm.append("segments", JSON.stringify(segments));
          const segRes = await fetch(`${API_BASE}/analyze-segments`, { method: "POST", body: segForm });
          if (segRes.ok) {
            const segData = await segRes.json();
            segments = segData.segments ?? segments;
          }
        } catch { /* segments stay without emotion */ }
      }
      setTranscript(segments);
      data.transcript = segments;

      setResult(data);
      setShowModal(true);

      // Show profile save prompt if speech detected with gender/age
      if (data.type === "speech" && (data.gender?.label || data.age?.label)) {
        setShowProfilePrompt(true);
      }

      if (onResult) {
        const noiseLabel = data.audio_environment ?? data.noise_detail?.scene ?? data.label ?? "";
        onResult({
          gender:   data.gender?.label  ?? data.majority_vote?.gender  ?? "",
          age:      data.age?.label     ?? data.majority_vote?.age     ?? "",
          emotion:  data.emotion?.label ?? data.majority_vote?.emotion ?? "",
          noise:    noiseLabel,
          rawAnalysis:     data,
          audioUrl:        audioUrl ?? undefined,
          audioDurationSec: undefined,
          audioFileName:   audioBlob instanceof File ? (audioBlob as File).name : "voice_recording.webm",
          audioBlob:       audioBlob,
          transcript:      segments,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
      setIsLoading(false);
    }
  }, [audioBlob, audioUrl, onResult]);

  const reset = useCallback(() => {
    setResult(null);
    setShowModal(false);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setError(null);
    setNoiseResult(null);
    setTranscript([]);
    setLiveTranscript("");
    setLiveSegments([]);
    transcriptBuf.current = [];
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [audioUrl]);

  if (!mounted) return null;

  // ── Theme tokens ────────────────────────────────────────────────────
  const tk = {
    pageText:    isDark ? "white" : "#0f172a",
    subText:     isDark ? "#6b7280" : "#6b7280",
    cardBg:      isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.88)",
    cardBdr:     isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.15)",
    cardShadow:  isDark ? "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" : "0 8px 40px rgba(109,40,217,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    waveBg:      isDark ? "rgba(124,58,237,0.06)" : "rgba(124,58,237,0.05)",
    waveBdr:     isDark ? "rgba(124,58,237,0.15)"  : "rgba(124,58,237,0.2)",
    recBg:       isDark ? "rgba(239,68,68,0.06)"  : "rgba(239,68,68,0.05)",
    recBdr:      isDark ? "rgba(239,68,68,0.2)"   : "rgba(239,68,68,0.25)",
    divider:     isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    divTxt:      isDark ? "#4b5563" : "#9ca3af",
    uploadBg:    isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)",
    uploadBdr:   isDark ? "rgba(255,255,255,0.12)" : "rgba(109,40,217,0.2)",
    audioBdr:    isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    resetTxt:    isDark ? "#4b5563" : "#9ca3af",
    errBg:       isDark ? "rgba(239,68,68,0.08)"  : "rgba(239,68,68,0.06)",
    errBdr:      isDark ? "rgba(239,68,68,0.2)"   : "rgba(239,68,68,0.25)",
    errTxt:      "#f87171",
    footTxt:     isDark ? "#374151" : "#9ca3af",
    // modal
    modalOverlay: isDark ? "rgba(0,0,0,0.85)" : "rgba(80,60,120,0.55)",
    modalBg:      isDark ? "rgba(8,6,20,0.95)" : "rgba(255,255,255,0.97)",
    modalBdr:     isDark ? "rgba(124,58,237,0.25)" : "rgba(124,58,237,0.2)",
    modalHdr:     isDark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.05)",
    modalHdrBdr:  isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    modalHeading: isDark ? "white" : "#0f172a",
    sectionBg:    isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.75)",
    sectionBdr:   isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    sectionLbl:   isDark ? "#6b7280" : "#6b7280",
    closeBtnBg:   isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.06)",
    closeBtnBdr:  isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.12)",
    closeBtnTxt:  isDark ? "#6b7280" : "#9ca3af",
    tblHdrBg:     isDark ? "rgba(0,0,0,0.5)" : "rgba(109,40,217,0.07)",
    tblHdrTxt:    isDark ? "#6b7280" : "#4b5563",
    spinBg:       isDark ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.12)",
  };

  return (
    <>
      <AnimatedBackground isDark={isDark} />

      {isLoading && <VoiceLoadingScreen stage={loadingStage} noiseResult={noiseResult} />}

      <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-12" style={{ color: tk.pageText }}>

        {/* ── Header ── */}
        <div className="text-center mb-10 animate-slide-up">
          <div className="flex justify-center mb-5">
            <div className="animate-glow-pulse" style={{
              width: "72px", height: "72px", borderRadius: "22px",
              backgroundImage: isDark
                ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(192,38,211,0.2))"
                : "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(192,38,211,0.12))",
              border: "1px solid rgba(124,58,237,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
              </svg>
            </div>
          </div>
          <h1 className="font-syne font-bold mb-3" style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1,
            backgroundImage: isDark
              ? "linear-gradient(135deg, #e0e7ff 0%, #a78bfa 40%, #c084fc 70%, #f0abfc 100%)"
              : "linear-gradient(135deg, #4c1d95 0%, #6d28d9 40%, #9333ea 70%, #a21caf 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>Vox Sense</h1>
          <p className="text-sm font-medium max-w-sm mx-auto leading-relaxed" style={{ color: tk.subText }}>
            Analyze voice for gender, age &amp; emotion using{" "}
            <span style={{ color: "#7c3aed" }}>7 ML models</span> simultaneously
          </p>
        </div>

        {/* ── Main Card ── */}
        <div className="w-full animate-slide-up card-glow" style={{
          maxWidth: "520px", borderRadius: "24px",
          backgroundColor: tk.cardBg,
          border: `1px solid ${tk.cardBdr}`,
          backdropFilter: "blur(24px)",
          boxShadow: tk.cardShadow,
          animationDelay: "0.1s", opacity: 0,
        }}>
          <div className="p-7">
            {/* Waveform / Recording Animation */}
            <div className="rounded-2xl mb-6 flex flex-col items-center justify-center py-4" style={{
              backgroundColor: isRecording ? tk.recBg : tk.waveBg,
              border: `1px solid ${isRecording ? tk.recBdr : tk.waveBdr}`,
              transition: "all 0.4s ease", minHeight: isRecording ? "200px" : "110px",
            }}>
              {isRecording ? (
                <RecordingAnimation isDark={isDark} elapsedSec={recordingElapsed} />
              ) : (
                <>
                  <IdleWaveform isDark={isDark} />
                  <p className="text-xs mt-2 font-medium" style={{ color: tk.subText }}>
                    Ready to capture voice
                  </p>
                </>
              )}
              {/* Canvas for live waveform data (hidden, used for analyser) */}
              {isRecording && hasAnalyser && (
                <canvas ref={canvasRef} width={460} height={1} style={{ width: 0, height: 0, position: "absolute", opacity: 0 }} />
              )}
            </div>

            {/* LIVE TRANSCRIPT */}
            {isRecording && (liveSegments.length > 0 || liveTranscript) && (
              <div className="mb-5 p-4 rounded-xl text-left bg-gradient-to-br from-white/5 to-transparent backdrop-blur-md animate-slide-up" style={{
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(109,40,217,0.1)'}`,
                boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.02)" : "inset 0 1px 0 rgba(255,255,255,0.8)",
                maxHeight: "140px", overflowY: "auto"
              }}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-transparent">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: tk.subText }}>Live Transcript</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {liveSegments.map((seg, i) => (
                    <p key={i} className="text-sm font-medium leading-relaxed" style={{ color: isDark ? "#e2e8f0" : "#334155" }}>
                      {seg.text}
                    </p>
                  ))}
                  {liveTranscript && (
                    <p className="text-sm font-medium italic animate-pulse" style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(109,40,217,0.5)" }}>
                      {liveTranscript}...
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Record */}
            <button onClick={isRecording ? stopRecording : startRecording} disabled={isAnalyzing}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold text-sm mb-3 disabled:opacity-40"
              style={{
                color: "white",
                backgroundImage: isRecording ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #5b21b6, #7c3aed)",
                boxShadow: isRecording ? "0 4px 20px rgba(239,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" : "0 4px 20px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                animation: isRecording ? "record-pulse 1.5s ease-in-out infinite" : "none",
              }}
            >
              {isRecording ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "white" }} />
                  Stop Recording
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style={{flexShrink:0}}>
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                    <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
                  </svg>
                  Record Audio
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ backgroundColor: tk.divider }} />
              <span className="text-xs font-medium" style={{ color: tk.divTxt }}>or upload</span>
              <div className="flex-1 h-px" style={{ backgroundColor: tk.divider }} />
            </div>

            {/* Upload */}
            <label className="block w-full rounded-2xl cursor-pointer transition-all duration-300 mb-4" style={{
              backgroundColor: tk.uploadBg,
              border: `1px dashed ${tk.uploadBdr}`,
              padding: "14px 16px",
            }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(124,58,237,0.06)"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = tk.uploadBg; e.currentTarget.style.borderColor = tk.uploadBdr; }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{
                  backgroundColor: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.2)",
                }}>📁</div>
                <div>
                  <p className="text-sm font-medium" style={{ color: isDark ? "white" : "#0f172a" }}>
                    {audioBlob && !isRecording ? "File loaded ✓" : "Choose audio file"}
                  </p>
                  <p className="text-xs" style={{ color: tk.subText }}>wav · flac · mp3 · ogg · m4a · webm</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".wav,.flac,.mp3,.ogg,.m4a,.webm,audio/*" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* Audio preview */}
            {audioUrl && (
              <div className="mb-4 rounded-2xl overflow-hidden animate-fade-in" style={{ border: `1px solid ${tk.audioBdr}` }}>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}

            {/* Analyze */}
            <button onClick={analyze} disabled={!audioBlob || isAnalyzing}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold text-sm disabled:opacity-40"
              style={{
                color: "white",
                backgroundImage: "linear-gradient(135deg, #6d28d9, #7c3aed, #9333ea)",
                boxShadow: "0 4px 24px rgba(124,58,237,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              {isAnalyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="text-base">🧠</span> Analyzing<LoadingDots />
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span className="text-base">✨</span> Analyze Voice
                </span>
              )}
            </button>

            {/* Reset */}
            {(audioBlob || result) && (
              <button onClick={reset}
                className="w-full mt-2.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                style={{ color: tk.resetTxt, background: "transparent" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = isDark ? "#9ca3af" : "#6b7280"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(109,40,217,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = tk.resetTxt; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >↺ Reset</button>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 px-4 py-3 rounded-xl text-xs text-center animate-fade-in" style={{
                backgroundColor: tk.errBg, border: `1px solid ${tk.errBdr}`, color: tk.errTxt,
              }}>⚠ {error}</div>
            )}
          </div>
        </div>

        <p className="mt-8 text-xs animate-slide-up" style={{ color: tk.footTxt, animationDelay: "0.3s", opacity: 0 }}>
          Powered by 7 ML models · Real-time audio analysis
        </p>
      </div>

      {/* ══ Modal ══ */}
      {showModal && result && (
        <div className="fixed inset-0 flex items-start justify-center z-50 overflow-y-auto py-8 px-4 animate-fade-in"
          style={{ backgroundColor: tk.modalOverlay, backdropFilter: "blur(16px)" }}
          onClick={e => { /* only close via X button, not side-click */ }}
        >
          <div className="w-full animate-modal-in" style={{
            maxWidth: "860px", borderRadius: "28px",
            backgroundColor: tk.modalBg,
            border: `1px solid ${tk.modalBdr}`,
            boxShadow: isDark
              ? "0 0 0 1px rgba(124,58,237,0.1), 0 40px 120px rgba(0,0,0,0.7)"
              : "0 8px 60px rgba(109,40,217,0.2), 0 0 0 1px rgba(109,40,217,0.15)",
            backdropFilter: "blur(40px)", overflow: "hidden",
          }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-7 py-5" style={{
              borderBottom: `1px solid ${tk.modalHdrBdr}`,
              backgroundImage: `linear-gradient(135deg, ${tk.modalHdr} 0%, transparent 100%)`,
            }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{
                  backgroundColor: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)",
                }}>
                  {result.type === "song" ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  ) : result.type === "noise" ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  )}
                </div>
                <div>
                  <h2 className="font-syne font-bold text-lg" style={{ color: tk.modalHeading }}>
                    {result.type === "song" ? "Music Analysis" : result.type === "noise" ? "Noise Analysis" : "Voice Analysis"}
                  </h2>
                  <p className="text-xs" style={{ color: tk.sectionLbl }}>
                    {result.audio_environment ? `Environment: ${result.audio_environment}` : "Analysis complete"}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200"
                style={{ backgroundColor: tk.closeBtnBg, border: `1px solid ${tk.closeBtnBdr}`, color: tk.closeBtnTxt, fontSize: "18px", lineHeight: "1" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(239,68,68,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tk.closeBtnBg; (e.currentTarget as HTMLButtonElement).style.color = tk.closeBtnTxt; }}
              >×</button>
            </div>

            {/* Modal Body */}
            <div className="px-7 py-6 space-y-6">

              {/* NOISE ONLY */}
              {result.type === "noise" && (
                <>
                  <div className="flex flex-col items-center gap-3 animate-slide-up py-2">
                    <div style={{
                      width: "110px", height: "110px", borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "52px",
                      backgroundImage: "radial-gradient(circle, rgba(6,182,212,0.2), rgba(14,165,233,0.1))",
                      border: "2px solid rgba(6,182,212,0.3)", boxShadow: "0 0 40px rgba(6,182,212,0.2)",
                    }}>🔊</div>
                    <div className="text-center">
                      <p className="font-syne font-bold text-xl" style={{ color: tk.modalHeading }}>Noise Detected</p>
                      <p className="text-sm mt-1" style={{ color: tk.sectionLbl }}>No speech or music found in this audio</p>
                      {result.audio_environment && <p className="text-xs mt-1" style={{ color: tk.sectionLbl }}>Environment: {result.audio_environment}</p>}
                    </div>
                  </div>
                  {result.noise_detail && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <StatCard icon="🌍" label="Scene" value={result.noise_detail.scene?.replace(/_/g, ' ') ?? '—'} color="#06b6d4" confidence={result.noise_detail.scene_confidence} isDark={isDark} />
                      <StatCard icon="🔇" label="Noise Type" value={result.noise_detail.noise_type?.replace(/_/g, ' ') ?? '—'} color="#0891b2" confidence={result.noise_detail.noise_confidence} isDark={isDark} />
                    </div>
                  )}
                  {result.noise_detail?.noise_breakdown && Object.keys(result.noise_detail.noise_breakdown).length > 0 && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <p className="text-xs font-bold mb-4 uppercase tracking-widest" style={{ color: tk.sectionLbl }}>🔊 Noise Breakdown</p>
                      <div className="space-y-3">
                        {Object.entries(result.noise_detail.noise_breakdown).sort(([, a], [, b]) => b - a).map(([noise, val]) => (
                          <ConfidenceBar key={noise} value={val} color="#06b6d4" label={noise.replace(/_/g, ' ')} isDark={isDark} />
                        ))}
                      </div>
                    </div>
                  )}
                  {result.plot_url && (
                    <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ border: `1px solid ${tk.sectionBdr}` }}>
                      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tk.sectionBdr}`, backgroundColor: tk.modalHdr }}>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>📊 MFCC Spectrogram</p>
                      </div>
                      <img src={`${API_BASE}${result.plot_url}`} alt="MFCC Spectrogram" className="w-full"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </>
              )}

              {/* SONG */}
              {result.type === "song" && (
                <>
                  <div className="flex flex-col items-center gap-3 animate-slide-up py-2">
                    <div style={{
                      width: "110px", height: "110px", borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "52px",
                      backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.2), rgba(192,38,211,0.1))",
                      border: "2px solid rgba(124,58,237,0.3)", boxShadow: "0 0 40px rgba(124,58,237,0.2)",
                      animation: "spin-slow 8s linear infinite",
                    }}>🎵</div>
                    <div className="text-center">
                      <p className="font-syne font-bold text-xl" style={{ color: tk.modalHeading }}>Music Detected</p>
                      {result.audio_environment && <p className="text-xs mt-1" style={{ color: tk.sectionLbl }}>Environment: {result.audio_environment}</p>}
                    </div>
                  </div>
                  <div className="max-w-sm mx-auto w-full">
                    <ConfidenceBar value={result.confidence ?? 0} color="#6366f1" label="Music confidence" isDark={isDark} />
                  </div>

                  {/* Song: Gender + Age + Emotion */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {result.gender && <StatCard icon={result.gender.label === "Male" ? "👨" : "👩"} label="Singer Gender" value={result.gender.label} color={result.gender.label === "Male" ? "#60a5fa" : "#f9a8d4"} confidence={result.gender.confidence} isDark={isDark} />}
                    {result.age    && <StatCard icon="🎂" label="Singer Age" value={result.age.label} color="#fbbf24" confidence={result.age.confidence} isDark={isDark} />}
                    {result.emotion && <StatCard icon={EMOTION_EMOJI[result.emotion.label.toLowerCase()] ?? "🎶"} label="Music Emotion" value={result.emotion.label} color={EMOTION_COLOR[result.emotion.label.toLowerCase()] ?? "#6366f1"} confidence={result.emotion.confidence} isDark={isDark} />}
                  </div>

                  {result.emotion?.breakdown && Object.keys(result.emotion.breakdown).length > 0 && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <p className="text-xs font-bold mb-4 uppercase tracking-widest" style={{ color: tk.sectionLbl }}>🎶 Emotion Breakdown</p>
                      <div className="space-y-3">
                        {Object.entries(result.emotion.breakdown).sort(([, a], [, b]) => b - a).map(([emo, val]) => (
                          <ConfidenceBar key={emo} value={val} color={EMOTION_COLOR[emo.toLowerCase()] ?? "#6b7280"} label={`${EMOTION_EMOJI[emo.toLowerCase()] ?? ""} ${emo}`} isDark={isDark} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Noise behind music */}
                  {result.noise_detail && result.noise_detail.noise_type !== "noiseless" && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <p className="text-xs font-bold mb-3 uppercase tracking-widest" style={{ color: tk.sectionLbl }}>🔊 Background Noise</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs" style={{ color: tk.sectionLbl }}>Scene: </span><span className="text-sm font-semibold" style={{ color: isDark ? "white" : "#0f172a" }}>{result.noise_detail.scene?.replace(/_/g, ' ')}</span></div>
                        <div><span className="text-xs" style={{ color: tk.sectionLbl }}>Type: </span><span className="text-sm font-semibold" style={{ color: isDark ? "white" : "#0f172a" }}>{result.noise_detail.noise_type?.replace(/_/g, ' ')}</span></div>
                      </div>
                    </div>
                  )}

                  {result.plot_url && (
                    <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ border: `1px solid ${tk.sectionBdr}` }}>
                      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tk.sectionBdr}`, backgroundColor: tk.modalHdr }}>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>📊 MFCC Spectrogram</p>
                      </div>
                      <img src={`${API_BASE}${result.plot_url}`} alt="MFCC Spectrogram" className="w-full"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </>
              )}

              {/* SPEECH */}
              {result.type === "speech" && (
                <>
                  {result.avatar_url && (
                    <div className="flex flex-col items-center gap-3 animate-slide-up py-2">
                      <div style={{
                        width: "130px", height: "130px", borderRadius: "50%", padding: "4px",
                        backgroundImage: "linear-gradient(135deg, #7c3aed, #c084fc, #818cf8)",
                        boxShadow: "0 0 30px rgba(124,58,237,0.35), 0 0 60px rgba(124,58,237,0.15)",
                      }}>
                        <img src={`${API_BASE}${result.avatar_url}`} alt="Profile avatar"
                          className="rounded-full object-cover"
                          style={{ width: "100%", height: "100%", border: `3px solid ${isDark ? "rgba(3,3,8,0.9)" : "rgba(255,255,255,0.9)"}` }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="font-syne font-bold text-xl" style={{ color: tk.modalHeading }}>Voice Profile</p>
                        {result.audio_environment && <p className="text-xs mt-1" style={{ color: tk.sectionLbl }}>Environment: {result.audio_environment}</p>}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {result.gender && <StatCard icon={result.gender.label === "Male" ? "👨" : "👩"} label="Gender" value={result.gender.label} color={result.gender.label === "Male" ? "#60a5fa" : "#f9a8d4"} confidence={result.gender.confidence} isDark={isDark} />}
                    {result.age    && <StatCard icon="🎂" label="Age Group" value={result.age.label} color="#fbbf24" confidence={result.age.confidence} isDark={isDark} />}
                    {result.emotion && <StatCard icon={EMOTION_EMOJI[result.emotion.label.toLowerCase()] ?? "💭"} label="Emotion" value={result.emotion.label} color={EMOTION_COLOR[result.emotion.label.toLowerCase()] ?? "#6366f1"} confidence={result.emotion.confidence} isDark={isDark} />}
                  </div>

                  {result.emotion?.breakdown && Object.keys(result.emotion.breakdown).length > 0 && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <p className="text-xs font-bold mb-4 uppercase tracking-widest" style={{ color: tk.sectionLbl }}>Emotion Breakdown</p>
                      <div className="space-y-3">
                        {Object.entries(result.emotion.breakdown).sort(([, a], [, b]) => b - a).map(([emo, val]) => (
                          <ConfidenceBar key={emo} value={val} color={EMOTION_COLOR[emo.toLowerCase()] ?? "#6b7280"} label={`${EMOTION_EMOJI[emo.toLowerCase()] ?? ""} ${emo}`} isDark={isDark} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Noise behind speech */}
                  {result.noise_detail && result.noise_detail.noise_type !== "noiseless" && !result.noise_detail.is_clean && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <p className="text-xs font-bold mb-3 uppercase tracking-widest" style={{ color: tk.sectionLbl }}>🔊 Background Noise</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs" style={{ color: tk.sectionLbl }}>Scene: </span><span className="text-sm font-semibold" style={{ color: isDark ? "white" : "#0f172a" }}>{result.noise_detail.scene?.replace(/_/g, ' ')}</span></div>
                        <div><span className="text-xs" style={{ color: tk.sectionLbl }}>Type: </span><span className="text-sm font-semibold" style={{ color: isDark ? "white" : "#0f172a" }}>{result.noise_detail.noise_type?.replace(/_/g, ' ')}</span></div>
                      </div>
                    </div>
                  )}

                  {result.song_speech && (
                    <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>Speech Classifier</p>
                        <span className="text-sm font-bold capitalize px-3 py-1 rounded-full" style={{ color: "#34d399", backgroundColor: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.2)" }}>{result.song_speech.label}</span>
                      </div>
                      <ConfidenceBar value={result.song_speech.confidence} color="#34d399" isDark={isDark} />
                    </div>
                  )}

                  {result.model_comparison && Object.keys(result.model_comparison).length > 0 && (
                    <ModelComparisonPanel comparison={result.model_comparison} majority={result.majority_vote ?? {}} isDark={isDark} />
                  )}

                  {result.plot_url && (
                    <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ border: `1px solid ${tk.sectionBdr}` }}>
                      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tk.sectionBdr}`, backgroundColor: tk.modalHdr }}>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>📊 MFCC Spectrogram</p>
                      </div>
                      <img src={`${API_BASE}${result.plot_url}`} alt="MFCC Spectrogram" className="w-full"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </>
              )}

              {/* ── TRANSCRIPT WITH EMOTION-COLORED TEXT ── */}
              {result.transcript && result.transcript.length > 0 && (() => {
                // Group consecutive segments by emotion for flow visualization
                const groups: { emotion: string; segments: typeof result.transcript }[] = [];
                (result.transcript ?? []).forEach((seg) => {
                  const emo = seg.emotion?.toLowerCase() ?? "neutral";
                  if (groups.length > 0 && groups[groups.length - 1].emotion === emo) {
                    groups[groups.length - 1].segments!.push(seg);
                  } else {
                    groups.push({ emotion: emo, segments: [seg] });
                  }
                });
                // Get unique emotions used
                const usedEmotions = [...new Set((result.transcript ?? []).map(s => s.emotion?.toLowerCase() ?? "neutral"))];
                return (
                  <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>📝 Emotion-Coded Transcript</p>
                      <span className="text-xs" style={{ color: tk.sectionLbl }}>{(result.transcript ?? []).length} segments</span>
                    </div>
                    {/* Emotion color legend */}
                    <div className="flex flex-wrap gap-2 mb-4" style={{ padding: "8px 12px", borderRadius: "10px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(109,40,217,0.04)", border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.08)"}` }}>
                      {usedEmotions.map(emo => {
                        const ec = EMOTION_COLOR[emo] ?? "#6b7280";
                        return (
                          <span key={emo} className="flex items-center gap-1.5 text-xs font-semibold capitalize" style={{ color: ec }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: ec, display: "inline-block", boxShadow: `0 0 6px ${ec}60` }} />
                            {EMOTION_EMOJI[emo] ?? ""} {emo}
                          </span>
                        );
                      })}
                    </div>
                    {/* Emotion flow groups */}
                    <div className="space-y-3">
                      {groups.map((group, gi) => {
                        const ec = EMOTION_COLOR[group.emotion] ?? "#6b7280";
                        const emoji = EMOTION_EMOJI[group.emotion] ?? "💭";
                        return (
                          <div key={gi} style={{
                            borderRadius: "14px", overflow: "hidden",
                            border: `1px solid ${ec}30`,
                            background: isDark ? `linear-gradient(135deg, ${ec}08, ${ec}04)` : `linear-gradient(135deg, ${ec}0c, ${ec}06)`,
                          }}>
                            {/* Group header — emotion label */}
                            <div style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "8px 14px",
                              background: isDark ? `${ec}12` : `${ec}10`,
                              borderBottom: `1px solid ${ec}20`,
                            }}>
                              <span style={{ fontSize: 14 }}>{emoji}</span>
                              <span className="text-xs font-bold uppercase tracking-wider capitalize" style={{ color: ec }}>{group.emotion}</span>
                              <span className="text-xs" style={{ color: isDark ? "rgba(255,255,255,0.25)" : "#b0b0b0", marginLeft: "auto" }}>
                                {group.segments!.length} line{group.segments!.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            {/* Segment lines — text colored by emotion */}
                            <div style={{ padding: "10px 14px" }}>
                              {group.segments!.map((seg, si) => (
                                <div key={si} style={{ marginBottom: si < group.segments!.length - 1 ? 8 : 0 }}>
                                  <p style={{
                                    fontSize: 14, lineHeight: 1.6, margin: 0,
                                    color: ec,
                                    fontWeight: 500,
                                    textShadow: isDark ? `0 0 20px ${ec}30` : "none",
                                  }}>
                                    {seg.text}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    {seg.confidence != null && seg.confidence > 0 && (
                                      <span className="text-xs font-semibold" style={{ color: `${ec}aa` }}>
                                        {seg.confidence.toFixed(1)}% confident
                                      </span>
                                    )}
                                    <span className="text-xs" style={{ color: isDark ? "rgba(255,255,255,0.15)" : "#d1d5db" }}>
                                      ⏱ {seg.start.toFixed(1)}s — {seg.end.toFixed(1)}s
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Emotion flow timeline */}
                    {groups.length > 1 && (
                      <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: "10px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(109,40,217,0.03)" }}>
                        <p className="text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: tk.sectionLbl }}>Emotion Flow</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {groups.map((g, i) => {
                            const ec = EMOTION_COLOR[g.emotion] ?? "#6b7280";
                            return (
                              <div key={i} className="flex items-center gap-1">
                                <span style={{
                                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  color: ec, backgroundColor: `${ec}18`, border: `1px solid ${ec}30`,
                                  textTransform: "capitalize",
                                }}>
                                  {EMOTION_EMOJI[g.emotion] ?? ""} {g.emotion}
                                </span>
                                {i < groups.length - 1 && <span style={{ color: isDark ? "rgba(255,255,255,0.15)" : "#d1d5db", fontSize: 12 }}>→</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── AUDIO PLAYBACK ── */}
              {audioUrl && (
                <div className="rounded-2xl p-5 animate-slide-up" style={{ backgroundColor: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.sectionLbl }}>🎙 Audio Recording</p>
                  </div>
                  <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(109,40,217,0.12)'}` }}>
                    <audio controls src={audioUrl} style={{ width: "100%", display: "block" }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Save as voice profile prompt ── */}
            {showProfilePrompt && result.type === "speech" && onSaveProfile && (
              <div className="px-7 pb-6">
                <div className="rounded-2xl p-5 animate-slide-up" style={{
                  background: isDark
                    ? "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(192,38,211,0.05))"
                    : "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(192,38,211,0.03))",
                  border: `1px solid ${isDark ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.15)"}`,
                }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{
                      backgroundColor: "rgba(124,58,237,0.15)",
                      border: "1px solid rgba(124,58,237,0.25)",
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: isDark ? "#e0e7ff" : "#1e1b4b" }}>
                        Is this your voice?
                      </p>
                      <p className="text-xs mt-1" style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#6b7280" }}>
                        Save the detected gender{result.gender?.label ? ` (${result.gender.label})` : ""}
                        {result.age?.label ? ` and age group (${result.age.label})` : ""}
                        {" "}to your voice profile for personalized analysis.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => {
                          onSaveProfile(result.gender?.label ?? "", result.age?.label ?? "");
                          setShowProfilePrompt(false);
                        }} style={{
                          padding: "7px 18px", borderRadius: "10px", border: "none",
                          background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                          color: "white", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                          boxShadow: "0 2px 12px rgba(124,58,237,0.3)",
                        }}>Yes, save to my profile</button>
                        <button onClick={() => setShowProfilePrompt(false)} style={{
                          padding: "7px 18px", borderRadius: "10px",
                          border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.15)"}`,
                          background: "transparent",
                          color: isDark ? "rgba(255,255,255,0.5)" : "#6b7280",
                          fontSize: "12px", fontWeight: 600, cursor: "pointer",
                        }}>No thanks</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40%            { transform: scale(1); opacity: 1; }
        }
        @keyframes recording-ring-1 {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes recording-ring-2 {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes recording-glow {
          0%   { box-shadow: 0 0 24px rgba(239,68,68,0.5), 0 0 48px rgba(239,68,68,0.25); }
          100% { box-shadow: 0 0 32px rgba(239,68,68,0.7), 0 0 64px rgba(239,68,68,0.35); }
        }
        @keyframes recording-bar {
          0%   { height: 4px; }
          100% { height: 28px; }
        }
        @keyframes recording-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}

