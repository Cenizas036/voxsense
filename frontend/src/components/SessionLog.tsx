"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection, query, orderBy, onSnapshot,
  deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { generateSessionPDF, generateAllSessionsPDF, type SessionData } from "@/lib/pdf";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  gender: string;
  age: string;
  emotion: string;
  noise: string;
  createdAt: Timestamp | null;
  audioUrl?: string | null;
  audioDurationSec?: number | null;
  audioFileName?: string | null;
  rawAnalysis?: any;
  storagePath?: string | null;
  transcript?: { text: string; start: number; end: number; emotion?: string; confidence?: number }[] | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMOTION_EMOJI: Record<string, string> = {
  neutral: "😐", happy: "😊", sad: "😢",
  angry: "😠", fear: "😨", disgust: "🤢", surprise: "😲",
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
const MODEL_ORDER = ["rf", "svm", "xgb", "cnn", "lstm", "attentive_lstm", "transformer_cnn"];

// ─── Theme hook ───────────────────────────────────────────────────────────────
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

// ─── Confidence Bar ───────────────────────────────────────────────────────────
function ConfBar({ value, color, label, isDark }: {
  value: number; color: string; label?: string; isDark: boolean;
}) {
  const trackColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)";
  return (
    <div style={{ width: "100%" }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: isDark ? "#9ca3af" : "#6b7280", fontWeight: 500 }}>{label}</span>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value.toFixed(1)}%</span>
        </div>
      )}
      <div style={{ width: "100%", height: 5, borderRadius: 3, backgroundColor: trackColor, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.min(value, 100)}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 6px ${color}55`,
          transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
        }} />
      </div>
    </div>
  );
}

// ─── Stat Chip ────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, color, isDark }: {
  icon: string; label: string; value: string; color: string; isDark: boolean;
}) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 14,
      background: isDark
        ? `linear-gradient(135deg, ${color}12 0%, rgba(255,255,255,0.02) 100%)`
        : `linear-gradient(135deg, ${color}15 0%, rgba(255,255,255,0.7) 100%)`,
      border: `1px solid ${color}28`,
      boxShadow: isDark ? `0 2px 12px ${color}10` : `0 2px 12px ${color}18`,
      flex: 1, minWidth: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: isDark ? `${color}bb` : color }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: isDark ? "white" : "#0f172a", lineHeight: 1.2 }}>{value || "—"}</div>
    </div>
  );
}

// ─── Model Comparison Table (inside replay modal) ─────────────────────────────
function ModelTable({ comparison, majority, isDark }: {
  comparison: Record<string, any>; majority: Record<string, string>; isDark: boolean;
}) {
  const allKeys = [...MODEL_ORDER.filter(k => k in comparison), ...Object.keys(comparison).filter(k => !MODEL_ORDER.includes(k))];
  const tk = {
    th:    isDark ? "#6b7280" : "#4b5563",
    td:    isDark ? "#e2e8f0" : "#1e293b",
    model: isDark ? "#c4b5fd" : "#5b21b6",
    rowHover: isDark ? "rgba(124,58,237,0.06)" : "rgba(109,40,217,0.05)",
    thead: isDark ? "rgba(0,0,0,0.5)" : "rgba(109,40,217,0.07)",
    border: isDark ? "rgba(255,255,255,0.04)" : "rgba(109,40,217,0.08)",
  };
  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)"}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: tk.thead }}>
            {["Model", "Gender", "Age", "Emotion", "Agree"].map(h => (
              <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: tk.th }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allKeys.map(key => {
            const p = comparison[key];
            if (p?.error) return (
              <tr key={key} style={{ borderTop: `1px solid ${tk.border}` }}>
                <td style={{ padding: "7px 10px", color: tk.model, fontWeight: 600 }}>{MODEL_DISPLAY_NAMES[key] ?? key}</td>
                <td colSpan={4} style={{ padding: "7px 10px", color: "#f87171", fontStyle: "italic", fontSize: 11 }}>{p.error}</td>
              </tr>
            );
            const gColor = p.gender === "Male" ? "#93c5fd" : "#f9a8d4";
            const eColor = EMOTION_COLOR[p.emotion?.toLowerCase() ?? ""] ?? "#9ca3af";
            const agrees = [p.gender === majority.gender, p.age_label === majority.age, p.emotion === majority.emotion].filter(Boolean).length;
            return (
              <tr key={key} style={{ borderTop: `1px solid ${tk.border}`, cursor: "default" }}
                onMouseEnter={e => (e.currentTarget.style.background = tk.rowHover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "7px 10px", color: tk.model, fontWeight: 600, whiteSpace: "nowrap" }}>{MODEL_DISPLAY_NAMES[key] ?? key}</td>
                <td style={{ padding: "7px 10px", color: gColor, fontWeight: 500 }}>{p.gender ?? "—"}{p.gender_conf != null ? <span style={{ color: tk.th, fontWeight: 400 }}> ({p.gender_conf}%)</span> : ""}</td>
                <td style={{ padding: "7px 10px", color: "#fcd34d", fontWeight: 500 }}>{p.age_label ?? "—"}{p.age_conf != null ? <span style={{ color: tk.th, fontWeight: 400 }}> ({p.age_conf}%)</span> : ""}</td>
                <td style={{ padding: "7px 10px", color: eColor, fontWeight: 500, textTransform: "capitalize" }}>{EMOTION_EMOJI[p.emotion ?? ""] ?? ""} {p.emotion ?? "—"}{p.emotion_conf != null ? <span style={{ color: tk.th, fontWeight: 400 }}> ({p.emotion_conf}%)</span> : ""}</td>
                <td style={{ padding: "7px 10px" }}>
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 700,
                    background: agrees === 3 ? "rgba(52,211,153,0.15)" : agrees === 2 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.12)",
                    color: agrees === 3 ? "#34d399" : agrees === 2 ? "#fbbf24" : "#f87171",
                    border: `1px solid ${agrees === 3 ? "rgba(52,211,153,0.3)" : agrees === 2 ? "rgba(251,191,36,0.3)" : "rgba(248,113,113,0.25)"}`,
                  }}>{agrees}/3</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Replay Modal ─────────────────────────────────────────────────────────────
function ReplayModal({ session, onClose, isDark }: { session: Session; onClose: () => void; isDark: boolean }) {
  const ra = session.rawAnalysis;
  const tk = {
    overlay:    isDark ? "rgba(0,0,0,0.88)" : "rgba(80,60,120,0.55)",
    modal:      isDark ? "rgba(8,6,20,0.97)" : "rgba(255,255,255,0.98)",
    border:     isDark ? "rgba(124,58,237,0.25)" : "rgba(124,58,237,0.2)",
    header:     isDark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.05)",
    hborder:    isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    sectionBg:  isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.75)",
    sectionBdr: isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.1)",
    subtext:    isDark ? "#6b7280" : "#6b7280",
    heading:    isDark ? "white" : "#0f172a",
    label:      isDark ? "#9ca3af" : "#4b5563",
    closeHover: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.1)",
    consBg:     isDark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.07)",
    consBdr:    isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.15)",
  };

  const issong = ra?.type === "song";
  const majority = ra?.majority_vote ?? {};
  const modelComp = ra?.model_comparison ?? {};
  const hasModelComp = Object.keys(modelComp).length > 0;

  const totalModels = Object.values(modelComp).filter((p: any) => !p.error).length;
  const gAgree = Object.values(modelComp).filter((p: any) => !p.error && p.gender === majority.gender).length;
  const aAgree = Object.values(modelComp).filter((p: any) => !p.error && p.age_label === majority.age).length;
  const eAgree = Object.values(modelComp).filter((p: any) => !p.error && p.emotion === majority.emotion).length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: tk.overlay, backdropFilter: "blur(16px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      overflowY: "auto", padding: "32px 16px",
    }} onClick={e => { /* only close via X button */ }}>
      <div style={{
        width: "100%", maxWidth: 860, borderRadius: 28,
        background: tk.modal,
        border: `1px solid ${tk.border}`,
        boxShadow: isDark
          ? "0 0 0 1px rgba(124,58,237,0.1), 0 40px 120px rgba(0,0,0,0.8), 0 0 80px rgba(124,58,237,0.1)"
          : "0 8px 60px rgba(109,40,217,0.2), 0 0 0 1px rgba(109,40,217,0.12)",
        overflow: "hidden",
        animation: "modalIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 28px", borderBottom: `1px solid ${tk.hborder}`,
          background: `linear-gradient(135deg, ${tk.header} 0%, transparent 100%)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>{issong ? "🎵" : "🗣"}</div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: tk.heading }}>
                {issong ? "Music Analysis" : "Voice Analysis"}
              </div>
              <div style={{ fontSize: 12, color: tk.subtext, marginTop: 2 }}>
                {session.createdAt ? new Date(session.createdAt.seconds * 1000).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Session replay"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${tk.hborder}`,
            background: "transparent", color: tk.subtext, fontSize: 20, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = tk.closeHover; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = tk.subtext; }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Stat chips ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {session.gender && <StatChip icon={session.gender === "Male" ? "👨" : "👩"} label="Gender" value={session.gender} color={session.gender === "Male" ? "#60a5fa" : "#f9a8d4"} isDark={isDark} />}
            {session.age    && <StatChip icon="🎂" label="Age Group" value={session.age} color="#fbbf24" isDark={isDark} />}
            {session.emotion && <StatChip icon={EMOTION_EMOJI[session.emotion.toLowerCase()] ?? "💭"} label="Emotion" value={session.emotion} color={EMOTION_COLOR[session.emotion.toLowerCase()] ?? "#6366f1"} isDark={isDark} />}
            {session.noise  && <StatChip icon="🔊" label="Environment" value={session.noise} color="#06b6d4" isDark={isDark} />}
          </div>

          {/* ── Confidence bars (from rawAnalysis) ── */}
          {ra?.gender?.confidence != null && (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, marginBottom: 12 }}>Confidence Scores</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ra.gender?.confidence != null && <ConfBar value={ra.gender.confidence} color={session.gender === "Male" ? "#60a5fa" : "#f9a8d4"} label={`Gender — ${ra.gender.label}`} isDark={isDark} />}
                {ra.age?.confidence    != null && <ConfBar value={ra.age.confidence}    color="#fbbf24" label={`Age — ${ra.age.label}`} isDark={isDark} />}
                {ra.emotion?.confidence != null && <ConfBar value={ra.emotion.confidence} color={EMOTION_COLOR[ra.emotion.label?.toLowerCase() ?? ""] ?? "#6366f1"} label={`Emotion — ${ra.emotion.label}`} isDark={isDark} />}
              </div>
            </div>
          )}

          {/* ── Emotion breakdown ── */}
          {ra?.emotion?.breakdown && Object.keys(ra.emotion.breakdown).length > 0 && (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, marginBottom: 12 }}>Emotion Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {Object.entries(ra.emotion.breakdown as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .map(([emo, val]) => (
                    <ConfBar key={emo} value={val} color={EMOTION_COLOR[emo.toLowerCase()] ?? "#6b7280"} label={`${EMOTION_EMOJI[emo.toLowerCase()] ?? ""} ${emo}`} isDark={isDark} />
                  ))}
              </div>
            </div>
          )}

          {/* ── Speech classifier ── */}
          {ra?.song_speech && (
            <div style={{ padding: "14px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label }}>Speech Classifier</div>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "capitalize", padding: "3px 10px", borderRadius: 20, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)" }}>{ra.song_speech.label}</span>
              </div>
              <ConfBar value={ra.song_speech.confidence} color="#34d399" isDark={isDark} />
            </div>
          )}

          {/* ── Model comparison ── */}
          {hasModelComp && (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, marginBottom: 12 }}>🔬 Model Comparison</div>

              {(majority.gender || majority.age || majority.emotion) && (
                <div style={{ padding: "12px 14px", borderRadius: 12, background: tk.consBg, border: `1px solid ${tk.consBdr}`, marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#818cf8", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>⚡ Consensus</div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                    {majority.gender  && <span style={{ fontSize: 12, color: majority.gender === "Male" ? "#93c5fd" : "#f9a8d4", fontWeight: 700 }}>Gender: {majority.gender} <span style={{ color: tk.subtext, fontWeight: 400 }}>({gAgree}/{totalModels})</span></span>}
                    {majority.age     && <span style={{ fontSize: 12, color: "#fcd34d", fontWeight: 700 }}>Age: {majority.age} <span style={{ color: tk.subtext, fontWeight: 400 }}>({aAgree}/{totalModels})</span></span>}
                    {majority.emotion && <span style={{ fontSize: 12, color: EMOTION_COLOR[majority.emotion] ?? "#9ca3af", fontWeight: 700, textTransform: "capitalize" }}>{EMOTION_EMOJI[majority.emotion] ?? ""} {majority.emotion} <span style={{ color: tk.subtext, fontWeight: 400 }}>({eAgree}/{totalModels})</span></span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <ConfBar value={(gAgree / Math.max(totalModels, 1)) * 100} color="#60a5fa" label="Gender agreement" isDark={isDark} />
                    <ConfBar value={(aAgree / Math.max(totalModels, 1)) * 100} color="#fbbf24" label="Age agreement" isDark={isDark} />
                    <ConfBar value={(eAgree / Math.max(totalModels, 1)) * 100} color={EMOTION_COLOR[majority.emotion ?? ""] ?? "#6366f1"} label="Emotion agreement" isDark={isDark} />
                  </div>
                </div>
              )}
              <ModelTable comparison={modelComp} majority={majority} isDark={isDark} />
            </div>
          )}

          {/* ── Audio playback ── */}
          {session.audioUrl ? (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, marginBottom: 12 }}>🎙 Audio Recording</div>
              <div style={{ fontSize: 12, color: tk.subtext, marginBottom: 10 }}>{session.audioFileName ?? "voice_recording.webm"}{session.audioDurationSec ? ` · ${Math.round(session.audioDurationSec)}s` : ""}</div>
              <audio controls src={session.audioUrl} crossOrigin="anonymous" style={{ width: "100%", borderRadius: 10 }} />
            </div>
          ) : (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, marginBottom: 8 }}>🎙 Audio Recording</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: isDark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.05)", border: `1px solid ${isDark ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.12)"}` }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.3)", borderTop: "2px solid #7c3aed", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 12, color: isDark ? "#a78bfa" : "#6d28d9", fontWeight: 500 }}>Audio uploading... Refresh in a moment</span>
              </div>
            </div>
          )}

          {/* ── Transcript (emotion-coded) ── */}
          {session.transcript && session.transcript.length > 0 && (() => {
            // Group consecutive segments by emotion
            const groups: { emotion: string; segments: typeof session.transcript }[] = [];
            (session.transcript ?? []).forEach((seg) => {
              const emo = seg.emotion?.toLowerCase() ?? "neutral";
              if (groups.length > 0 && groups[groups.length - 1].emotion === emo) {
                groups[groups.length - 1].segments!.push(seg);
              } else {
                groups.push({ emotion: emo, segments: [seg] });
              }
            });
            const usedEmotions = [...new Set((session.transcript ?? []).map(s => s.emotion?.toLowerCase() ?? "neutral"))];
            return (
              <div style={{ padding: "16px 18px", borderRadius: 16, background: tk.sectionBg, border: `1px solid ${tk.sectionBdr}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label }}>📝 Emotion-Coded Transcript</div>
                  <span style={{ fontSize: 10, color: tk.subtext }}>{(session.transcript ?? []).length} segments</span>
                </div>
                {/* Color legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, padding: "6px 10px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(109,40,217,0.04)", border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.08)"}` }}>
                  {usedEmotions.map(emo => {
                    const ec = EMOTION_COLOR[emo] ?? "#6b7280";
                    return (
                      <span key={emo} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: ec, textTransform: "capitalize" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: ec, display: "inline-block", boxShadow: `0 0 4px ${ec}60` }} />
                        {EMOTION_EMOJI[emo] ?? ""} {emo}
                      </span>
                    );
                  })}
                </div>
                {/* Emotion groups */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groups.map((group, gi) => {
                    const ec = EMOTION_COLOR[group.emotion] ?? "#6b7280";
                    const emoji = EMOTION_EMOJI[group.emotion] ?? "💭";
                    return (
                      <div key={gi} style={{
                        borderRadius: 12, overflow: "hidden",
                        border: `1px solid ${ec}30`,
                        background: isDark ? `linear-gradient(135deg, ${ec}08, ${ec}04)` : `linear-gradient(135deg, ${ec}0c, ${ec}06)`,
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 12px",
                          background: isDark ? `${ec}12` : `${ec}10`,
                          borderBottom: `1px solid ${ec}20`,
                        }}>
                          <span style={{ fontSize: 12 }}>{emoji}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: ec }}>{group.emotion}</span>
                          <span style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.25)" : "#b0b0b0", marginLeft: "auto" }}>
                            {group.segments!.length} line{group.segments!.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ padding: "8px 12px" }}>
                          {group.segments!.map((seg, si) => (
                            <div key={si} style={{ marginBottom: si < group.segments!.length - 1 ? 6 : 0 }}>
                              <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: ec, fontWeight: 500, textShadow: isDark ? `0 0 16px ${ec}25` : "none" }}>
                                {seg.text}
                              </p>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                                {seg.confidence != null && seg.confidence > 0 && (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: `${ec}aa` }}>{seg.confidence.toFixed(1)}%</span>
                                )}
                                <span style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.15)" : "#d1d5db" }}>
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
                {/* Emotion flow */}
                {groups.length > 1 && (
                  <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(109,40,217,0.03)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: tk.label, marginBottom: 6 }}>Emotion Flow</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {groups.map((g, i) => {
                        const ec = EMOTION_COLOR[g.emotion] ?? "#6b7280";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 16, fontSize: 10, fontWeight: 700,
                              color: ec, backgroundColor: `${ec}18`, border: `1px solid ${ec}30`,
                              textTransform: "capitalize",
                            }}>
                              {EMOTION_EMOJI[g.emotion] ?? ""} {g.emotion}
                            </span>
                            {i < groups.length - 1 && <span style={{ color: isDark ? "rgba(255,255,255,0.15)" : "#d1d5db", fontSize: 11 }}>→</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── MFCC Spectrogram ── */}
          {ra?.plot_url && (
            <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${tk.sectionBdr}` }}>
              <div style={{ padding: "10px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tk.label, borderBottom: `1px solid ${tk.sectionBdr}`, background: tk.header }}>📊 MFCC Spectrogram</div>
              <img src={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${ra.plot_url}`} alt="MFCC Spectrogram" style={{ width: "100%", display: "block" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { transform: scale(0.93) translateY(16px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onDelete, onReplay, onPDF, isDark }: {
  session: Session; onDelete: () => void; onReplay: () => void; onPDF: () => void; isDark: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const emotionColor = EMOTION_COLOR[session.emotion?.toLowerCase() ?? ""] ?? "#6b7280";
  const tk = {
    card:    isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.88)",
    border:  isDark ? "rgba(255,255,255,0.07)" : "rgba(109,40,217,0.12)",
    hover:   isDark ? "rgba(124,58,237,0.12)"  : "rgba(124,58,237,0.07)",
    text:    isDark ? "white"    : "#0f172a",
    subtext: isDark ? "#6b7280"  : "#6b7280",
    divider: isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.08)",
    pill:    isDark ? "rgba(124,58,237,0.12)"  : "rgba(109,40,217,0.08)",
    pillBdr: isDark ? "rgba(124,58,237,0.25)"  : "rgba(109,40,217,0.18)",
    btnBg:   isDark ? "rgba(255,255,255,0.04)" : "rgba(109,40,217,0.06)",
    btnBdr:  isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.14)",
    btnTxt:  isDark ? "rgba(255,255,255,0.6)"  : "#4b5563",
    delHov:  isDark ? "rgba(239,68,68,0.12)"   : "rgba(239,68,68,0.08)",
    delTxt:  "#f87171",
    shadow:  isDark ? "none" : "0 2px 16px rgba(109,40,217,0.08)",
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  const date = session.createdAt
    ? new Date(session.createdAt.seconds * 1000).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div style={{
      borderRadius: 18, border: `1px solid ${tk.border}`,
      background: tk.card, boxShadow: tk.shadow,
      backdropFilter: "blur(16px)", overflow: "hidden",
      transition: "all 0.25s ease",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDark ? "rgba(124,58,237,0.35)" : "rgba(109,40,217,0.28)"; (e.currentTarget as HTMLDivElement).style.boxShadow = isDark ? "0 4px 30px rgba(124,58,237,0.12)" : "0 4px 24px rgba(109,40,217,0.14)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = tk.border; (e.currentTarget as HTMLDivElement).style.boxShadow = tk.shadow; }}
    >
      {/* Clickable top area → replay */}
      <div style={{ padding: "18px 20px", cursor: "pointer" }} onClick={onReplay}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(192,38,211,0.15))",
              border: "1px solid rgba(124,58,237,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>🗣</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: tk.text, fontFamily: "'Syne',sans-serif" }}>Voice Session</div>
              <div style={{ fontSize: 11, color: tk.subtext, marginTop: 1 }}>{date}</div>
            </div>
          </div>
          {/* Emotion badge */}
          {session.emotion && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
              borderRadius: 20, border: `1px solid ${emotionColor}35`,
              background: isDark ? `${emotionColor}14` : `${emotionColor}18`,
            }}>
              <span style={{ fontSize: 13 }}>{EMOTION_EMOJI[session.emotion.toLowerCase()] ?? "💭"}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: emotionColor, textTransform: "capitalize" }}>{session.emotion}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Gender",  val: session.gender,  color: session.gender === "Male" ? "#93c5fd" : "#f9a8d4", icon: session.gender === "Male" ? "👨" : "👩" },
            { label: "Age",     val: session.age,     color: "#fbbf24",  icon: "🎂" },
            { label: "Noise",   val: session.noise,   color: "#06b6d4",  icon: "🔊" },
          ].filter(s => s.val).map(s => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 9px", borderRadius: 8,
              background: tk.pill, border: `1px solid ${tk.pillBdr}`,
            }}>
              <span style={{ fontSize: 11 }}>{s.icon}</span>
              <span style={{ fontSize: 10, color: tk.subtext }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.val}</span>
            </div>
          ))}
          {session.audioUrl && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 9px", borderRadius: 8,
              background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
            }}>
              <span style={{ fontSize: 10 }}>🎙</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#34d399" }}>Audio saved</span>
            </div>
          )}
        </div>

        {/* Replay hint */}
        <div style={{ marginTop: 12, fontSize: 11, color: isDark ? "rgba(124,58,237,0.7)" : "rgba(109,40,217,0.6)", display: "flex", alignItems: "center", gap: 5 }}>
          <span>▶</span> <span>Click to replay full analysis</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: "flex", gap: 0, borderTop: `1px solid ${tk.divider}`,
      }}>
        {[
          { label: "Replay", icon: "▶", action: onReplay, color: "#a78bfa" },
          { label: "PDF",    icon: "⬇", action: onPDF,    color: "#60a5fa" },
        ].map(b => (
          <button key={b.label} onClick={b.action} style={{
            flex: 1, padding: "10px 0", border: "none",
            background: "transparent", cursor: "pointer",
            fontSize: 12, fontWeight: 600, color: tk.btnTxt,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            borderRight: `1px solid ${tk.divider}`,
            transition: "all 0.2s",
            fontFamily: "'Inter',sans-serif",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = tk.hover; (e.currentTarget as HTMLButtonElement).style.color = b.color; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = tk.btnTxt; }}
          >
            <span>{b.icon}</span>{b.label}
          </button>
        ))}
        <button onClick={handleDelete} disabled={deleting} style={{
          flex: 1, padding: "10px 0", border: "none",
          background: "transparent", cursor: deleting ? "not-allowed" : "pointer",
          fontSize: 12, fontWeight: 600, color: tk.delTxt,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          opacity: deleting ? 0.5 : 1, transition: "all 0.2s",
          fontFamily: "'Inter',sans-serif",
        }}
          onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = tk.delHov; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <span>🗑</span>{deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ─── Main SessionLog ───────────────────────────────────────────────────────────
export default function SessionLog() {
  const { user, profile } = useAuth();
  const isDark = useIsDark();
  const [sessions, setSessions]           = useState<Session[]>([]);
  const [loading, setLoading]             = useState(true);
  const [replaySession, setReplaySession] = useState<Session | null>(null);
  const [exportingAll, setExportingAll]   = useState(false);
  const [filterEmotion, setFilterEmotion] = useState("all");
  const [sortOrder, setSortOrder]         = useState<"newest" | "oldest">("newest");

  const tk = {
    heading:    isDark ? "#f0f0ff"  : "#0f172a",
    subtext:    isDark ? "#6b7280"  : "#6b7280",
    cardBg:     isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.85)",
    cardBorder: isDark ? "rgba(255,255,255,0.07)" : "rgba(109,40,217,0.12)",
    btnBg:      isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.07)",
    btnBdr:     isDark ? "rgba(255,255,255,0.1)"  : "rgba(109,40,217,0.18)",
    btnTxt:     isDark ? "rgba(255,255,255,0.7)"  : "#374151",
    emptyIcon:  isDark ? "rgba(124,58,237,0.2)"   : "rgba(124,58,237,0.12)",
    emptyTxt:   isDark ? "rgba(255,255,255,0.3)"  : "#9ca3af",
    filterBg:   isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.75)",
    filterBdr:  isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.14)",
    activeBg:   "linear-gradient(135deg, #7c3aed, #4f46e5)",
    selectBg:   isDark ? "#0f0a1e" : "#f0eeff",
    selectColor:isDark ? "white"   : "#0f172a",
    statBg:     isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.8)",
    statBdr:    isDark ? "rgba(255,255,255,0.07)" : "rgba(109,40,217,0.1)",
    divider:    isDark ? "rgba(255,255,255,0.05)" : "rgba(109,40,217,0.08)",
  };

  // ── Firestore listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "sessions"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
      setLoading(false);
    }, err => {
      console.error("SessionLog error:", err);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // ── Delete ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (session: Session) => {
    if (!user) return;
    try {
      // Delete audio from Storage if we have a storagePath
      if (session.storagePath) {
        await deleteObject(storageRef(storage, session.storagePath));
      }
      await deleteDoc(doc(db, "users", user.uid, "sessions", session.id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  }, [user]);

  // ── PDF export single ────────────────────────────────────────────────
  const handlePDF = useCallback((session: Session) => {
    const ra = session.rawAnalysis;
    const sd: SessionData = {
      id: session.id,
      uid: user?.uid,
      gender:  session.gender,
      age:     session.age,
      emotion: session.emotion,
      noise:   session.noise,
      createdAt: session.createdAt ? { seconds: session.createdAt.seconds } : null,
      audioUrl:        session.audioUrl ?? undefined,
      audioDurationSec: session.audioDurationSec ?? undefined,
      audioFileName:   session.audioFileName ?? undefined,
      rawPredictions: ra ? {
        gender:  ra.gender ? [{ label: ra.gender.label, confidence: ra.gender.confidence }] : undefined,
        age:     ra.age    ? [{ label: ra.age.label,    confidence: ra.age.confidence }]    : undefined,
        emotion: ra.emotion?.breakdown
          ? Object.entries(ra.emotion.breakdown as Record<string, number>).map(([label, confidence]) => ({ label, confidence }))
          : ra.emotion ? [{ label: ra.emotion.label, confidence: ra.emotion.confidence }] : undefined,
        noiseType:          ra.noise_detail?.noise_type,
        noiseScene:         ra.noise_detail?.scene,
        audioEnvironment:   ra.audio_environment,
        isClean:            ra.noise_detail?.noise_type === "noiseless",
        sceneConfidence:    ra.noise_detail?.scene_confidence != null ? ra.noise_detail.scene_confidence / 100 : undefined,
        noiseConfidence:    ra.noise_detail?.noise_confidence != null ? ra.noise_detail.noise_confidence / 100 : undefined,
        noiseBreakdown:     ra.noise_detail?.noise_breakdown,
        modelComparison:    ra.model_comparison,
        majorityVote:       ra.majority_vote,
        audioType:          ra.type,
        songSpeechLabel:    ra.song_speech?.label,
        songSpeechConfidence: ra.song_speech?.confidence,
      } : undefined,
    };
    const ui = { displayName: user?.displayName ?? profile?.displayName ?? null, email: user?.email ?? null, phone: user?.phoneNumber ?? profile?.phone ?? null, age: profile?.age, gender: profile?.gender, occupation: profile?.occupation };
    generateSessionPDF(sd, ui);
  }, [user, profile]);

  // ── PDF export all ───────────────────────────────────────────────────
  const handleExportAll = async () => {
    if (!sessions.length) return;
    setExportingAll(true);
    const list: SessionData[] = sessions.map(session => {
      const ra = session.rawAnalysis;
      return {
        id: session.id, uid: user?.uid,
        gender: session.gender, age: session.age, emotion: session.emotion, noise: session.noise,
        createdAt: session.createdAt ? { seconds: session.createdAt.seconds } : null,
        audioUrl: session.audioUrl ?? undefined,
        audioDurationSec: session.audioDurationSec ?? undefined,
        audioFileName: session.audioFileName ?? undefined,
        rawPredictions: ra ? {
          gender:  ra.gender ? [{ label: ra.gender.label, confidence: ra.gender.confidence }] : undefined,
          age:     ra.age    ? [{ label: ra.age.label,    confidence: ra.age.confidence }]    : undefined,
          emotion: ra.emotion?.breakdown
            ? Object.entries(ra.emotion.breakdown as Record<string, number>).map(([label, confidence]) => ({ label, confidence }))
            : ra.emotion ? [{ label: ra.emotion.label, confidence: ra.emotion.confidence }] : undefined,
          noiseType: ra.noise_detail?.noise_type, noiseScene: ra.noise_detail?.scene,
          audioEnvironment: ra.audio_environment, isClean: ra.noise_detail?.noise_type === "noiseless",
          sceneConfidence: ra.noise_detail?.scene_confidence != null ? ra.noise_detail.scene_confidence / 100 : undefined,
          noiseConfidence: ra.noise_detail?.noise_confidence != null ? ra.noise_detail.noise_confidence / 100 : undefined,
          noiseBreakdown: ra.noise_detail?.noise_breakdown,
          modelComparison: ra.model_comparison, majorityVote: ra.majority_vote,
          audioType: ra.type, songSpeechLabel: ra.song_speech?.label, songSpeechConfidence: ra.song_speech?.confidence,
        } : undefined,
      };
    });
    const ui = { displayName: user?.displayName ?? profile?.displayName ?? null, email: user?.email ?? null, phone: user?.phoneNumber ?? profile?.phone ?? null, age: profile?.age, gender: profile?.gender, occupation: profile?.occupation };
    await generateAllSessionsPDF(list, ui);
    setExportingAll(false);
  };

  // ── Derived lists ────────────────────────────────────────────────────
  const emotions = ["all", ...Array.from(new Set(sessions.map(s => s.emotion?.toLowerCase()).filter(Boolean)))];
  const filtered = sessions
    .filter(s => filterEmotion === "all" || s.emotion?.toLowerCase() === filterEmotion)
    .sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });

  const stats = {
    total:    sessions.length,
    genders:  [...new Set(sessions.map(s => s.gender).filter(Boolean))].join(", ") || "—",
    emotions: [...new Set(sessions.map(s => s.emotion).filter(Boolean))].slice(0, 3).join(", ") || "—",
    withAudio: sessions.filter(s => s.audioUrl).length,
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid rgba(124,58,237,0.2)", borderTop: "3px solid #7c3aed", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: tk.heading, margin: "0 0 4px" }}>
            Session History
          </h2>
          <p style={{ fontSize: 13, color: tk.subtext, margin: 0 }}>
            {sessions.length} {sessions.length === 1 ? "analysis" : "analyses"} · click any card to replay
          </p>
        </div>
        {sessions.length > 0 && (
          <button onClick={handleExportAll} disabled={exportingAll} style={{
            padding: "9px 18px", borderRadius: 10, border: `1px solid ${tk.btnBdr}`,
            background: tk.btnBg, color: tk.btnTxt, fontSize: 13, fontWeight: 600,
            cursor: exportingAll ? "not-allowed" : "pointer", transition: "all 0.2s",
            display: "flex", alignItems: "center", gap: 6, fontFamily: "'Inter',sans-serif",
            opacity: exportingAll ? 0.6 : 1,
          }}
            onMouseEnter={e => { if (!exportingAll) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.15)"; (e.currentTarget as HTMLButtonElement).style.color = "#a78bfa"; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = tk.btnBg; (e.currentTarget as HTMLButtonElement).style.color = tk.btnTxt; }}
          >
            ⬇ {exportingAll ? "Generating…" : "Export All PDFs"}
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      {sessions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Total Sessions", value: String(stats.total),      color: "#a78bfa", icon: "📊" },
            { label: "With Audio",     value: String(stats.withAudio),  color: "#34d399", icon: "🎙" },
            { label: "Top Emotion",    value: sessions[0]?.emotion ?? "—", color: EMOTION_COLOR[sessions[0]?.emotion?.toLowerCase() ?? ""] ?? "#6366f1", icon: EMOTION_EMOJI[sessions[0]?.emotion?.toLowerCase() ?? ""] ?? "💭" },
            { label: "Top Gender",     value: sessions[0]?.gender  ?? "—", color: sessions[0]?.gender === "Male" ? "#60a5fa" : "#f9a8d4", icon: sessions[0]?.gender === "Male" ? "👨" : "👩" },
          ].map(s => (
            <div key={s.label} style={{ padding: "12px 14px", borderRadius: 14, background: tk.statBg, border: `1px solid ${tk.statBdr}`, backdropFilter: "blur(12px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: tk.subtext }}>{s.label}</span>
                <span>{s.icon}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "'Syne',sans-serif", marginTop: 4, textTransform: "capitalize" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      {sessions.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {emotions.map(e => (
              <button key={e} onClick={() => setFilterEmotion(e)} style={{
                padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterEmotion === e ? "transparent" : tk.filterBdr}`,
                background: filterEmotion === e ? tk.activeBg : tk.filterBg,
                color: filterEmotion === e ? "white" : tk.subtext,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s", textTransform: "capitalize",
                fontFamily: "'Inter',sans-serif",
              }}>
                {e === "all" ? "All" : `${EMOTION_EMOJI[e] ?? ""} ${e}`}
              </button>
            ))}
          </div>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value as any)} style={{
            marginLeft: "auto", padding: "5px 10px", borderRadius: 8, border: `1px solid ${tk.filterBdr}`,
            background: tk.selectBg, color: tk.selectColor, fontSize: 11, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Inter',sans-serif", outline: "none",
          }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      )}

      {/* ── Empty state ── */}
      {sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 24px" }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, background: tk.emptyIcon,
            border: "1px solid rgba(124,58,237,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, margin: "0 auto 20px",
          }}>🎙</div>
          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, color: tk.heading, margin: "0 0 8px" }}>No sessions yet</p>
          <p style={{ fontSize: 13, color: tk.emptyTxt, margin: 0 }}>Record or upload audio above to get started</p>
        </div>
      )}

      {/* ── Grid ── */}
      {filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {filtered.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              isDark={isDark}
              onDelete={() => handleDelete(session)}
              onReplay={() => setReplaySession(session)}
              onPDF={() => handlePDF(session)}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && sessions.length > 0 && (
        <div style={{ textAlign: "center", padding: "32px 24px", color: tk.emptyTxt, fontSize: 13 }}>
          No sessions match that filter.
        </div>
      )}

      {/* ── Replay Modal ── */}
      {replaySession && (
        <ReplayModal
          session={replaySession}
          onClose={() => setReplaySession(null)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
