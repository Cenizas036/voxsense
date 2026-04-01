"use client";

import { useState, useEffect } from "react";

type Stage = "noise" | "filtering" | "emotion" | "profile" | "done";

interface NoiseResult {
  scene: string;
  noise_type: string;
  scene_confidence: number;
  noise_confidence: number;
  audio_environment: string;
  is_clean: boolean;
}

interface Props {
  stage: Stage;
  noiseResult?: NoiseResult | null;
}

const STAGES: {
  id: Stage;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  colorLight: string;
}[] = [
  { id: "noise",     label: "Scanning Environment", sublabel: "Detecting background noise & acoustic scene",  icon: "🔍", color: "#38bdf8", colorLight: "#0284c7" },
  { id: "filtering", label: "Filtering Audio",       sublabel: "Removing noise, isolating voice signal",       icon: "🎛️", color: "#a78bfa", colorLight: "#6d28d9" },
  { id: "emotion",   label: "Analysing Emotion",     sublabel: "Reading prosody, tone, and vocal patterns",    icon: "🧠", color: "#fb7185", colorLight: "#be185d" },
  { id: "profile",   label: "Building Profile",      sublabel: "Compiling age, gender & acoustic fingerprint", icon: "👤", color: "#34d399", colorLight: "#047857" },
];

const NOISE_EMOJI: Record<string, string> = {
  fan_ac: "❄️", engine_idling: "🚗", car_horn: "📯", siren: "🚨",
  airplane: "✈️", helicopter: "🚁", train: "🚂", bus_tram_metro: "🚌",
  drilling: "⚙️", jackhammer: "🔨", chainsaw: "🪚", hand_saw: "🪚",
  rain: "🌧️", wind: "💨", thunderstorm: "⛈️", sea_waves: "🌊",
  water_drops: "💧", crickets: "🦗", chirping_birds: "🐦", crackling_fire: "🔥",
  crowd_chatter: "👥", street_music: "🎸", children_playing: "🧒",
  laughing: "😄", clapping: "👏", keyboard_typing: "⌨️",
  washing_machine: "🌀", clock_tick: "🕐", door_knock: "🚪",
  glass_breaking: "💥", footsteps: "👣", coughing: "😷", snoring: "😴",
  noiseless: "✨",
};

const STAGE_META: Record<string, {
  glowClass: string; ringClass: string;
  gridColorDark: string; blobColorDark: string;
  gridColorLight: string; blobColorLight: string;
}> = {
  noise:     { glowClass: "vls-glow-blue",   ringClass: "vls-ring-blue",
    gridColorDark: "rgba(56,189,248,0.08)",  blobColorDark: "rgba(56,189,248,0.05)",
    gridColorLight: "rgba(2,132,199,0.07)",  blobColorLight: "rgba(2,132,199,0.06)" },
  filtering: { glowClass: "vls-glow-purple", ringClass: "vls-ring-purple",
    gridColorDark: "rgba(167,139,250,0.08)", blobColorDark: "rgba(167,139,250,0.05)",
    gridColorLight: "rgba(109,40,217,0.07)", blobColorLight: "rgba(109,40,217,0.06)" },
  emotion:   { glowClass: "vls-glow-pink",   ringClass: "vls-ring-pink",
    gridColorDark: "rgba(251,113,133,0.08)", blobColorDark: "rgba(251,113,133,0.05)",
    gridColorLight: "rgba(190,24,93,0.07)",  blobColorLight: "rgba(190,24,93,0.06)" },
  profile:   { glowClass: "vls-glow-green",  ringClass: "vls-ring-green",
    gridColorDark: "rgba(52,211,153,0.08)",  blobColorDark: "rgba(52,211,153,0.05)",
    gridColorLight: "rgba(4,120,87,0.07)",   blobColorLight: "rgba(4,120,87,0.06)" },
  done:      { glowClass: "vls-glow-green",  ringClass: "vls-ring-green",
    gridColorDark: "rgba(52,211,153,0.08)",  blobColorDark: "rgba(52,211,153,0.05)",
    gridColorLight: "rgba(4,120,87,0.07)",   blobColorLight: "rgba(4,120,87,0.06)" },
};

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');

  @keyframes vls-wave      { 0%{height:4px} 100%{height:28px} }
  @keyframes vls-spin      { from{transform:rotate(0deg)}   to{transform:rotate(360deg)}  }
  @keyframes vls-spinRev   { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
  @keyframes vls-fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes vls-pulseGlow-blue   { 0%,100%{box-shadow:0 0 20px #38bdf833} 50%{box-shadow:0 0 40px #38bdf866,0 0 80px #38bdf822} }
  @keyframes vls-pulseGlow-purple { 0%,100%{box-shadow:0 0 20px #a78bfa33} 50%{box-shadow:0 0 40px #a78bfa66,0 0 80px #a78bfa22} }
  @keyframes vls-pulseGlow-pink   { 0%,100%{box-shadow:0 0 20px #fb718533} 50%{box-shadow:0 0 40px #fb718566,0 0 80px #fb718522} }
  @keyframes vls-pulseGlow-green  { 0%,100%{box-shadow:0 0 20px #34d39933} 50%{box-shadow:0 0 40px #34d39966,0 0 80px #34d39922} }
  @keyframes vls-pulseRing-blue   { 0%,100%{box-shadow:0 0 12px #38bdf844} }
  @keyframes vls-pulseRing-purple { 0%,100%{box-shadow:0 0 12px #a78bfa44} }
  @keyframes vls-pulseRing-pink   { 0%,100%{box-shadow:0 0 12px #fb718544} }
  @keyframes vls-pulseRing-green  { 0%,100%{box-shadow:0 0 12px #34d39944} }
  @keyframes vls-scanline  { 0%{transform:translateY(-100%)} 100%{transform:translateY(400%)} }
  @keyframes vls-noisePill { from{opacity:0;transform:translateY(8px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes vls-shimmerBar{ 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes vls-float     { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-6px)} }
  @keyframes vls-diagonal  { 0%{transform:translateX(-100%) translateY(100%)} 100%{transform:translateX(100%) translateY(-100%)} }
  @keyframes vls-twinkle   { 0%,100%{opacity:0.2;transform:scale(1)} 50%{opacity:1;transform:scale(1.6)} }

  .vls-orbit      { animation: vls-spin    linear infinite; }
  .vls-orbit-rev  { animation: vls-spinRev linear infinite; }
  .vls-float      { animation: vls-float 4s ease-in-out infinite; }
  .vls-scanline   { animation: vls-scanline 2s linear infinite; }
  .vls-noise-pill { animation: vls-noisePill 0.5s cubic-bezier(0.34,1.56,0.64,1); }
  .vls-fade-in-up { animation: vls-fadeInUp 0.4s ease; }

  .vls-glow-blue   { animation: vls-pulseGlow-blue   2s ease-in-out infinite; }
  .vls-glow-purple { animation: vls-pulseGlow-purple 2s ease-in-out infinite; }
  .vls-glow-pink   { animation: vls-pulseGlow-pink   2s ease-in-out infinite; }
  .vls-glow-green  { animation: vls-pulseGlow-green  2s ease-in-out infinite; }

  .vls-ring-blue   { animation: vls-pulseRing-blue   1.5s ease-in-out infinite; }
  .vls-ring-purple { animation: vls-pulseRing-purple 1.5s ease-in-out infinite; }
  .vls-ring-pink   { animation: vls-pulseRing-pink   1.5s ease-in-out infinite; }
  .vls-ring-green  { animation: vls-pulseRing-green  1.5s ease-in-out infinite; }

  .vls-shimbar { background-size: 200% 100%; animation: vls-shimmerBar 1.5s linear infinite; }
`;

function WaveformBars({ color, active }: { color: string; active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 32 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, backgroundColor: color,
          opacity: active ? 0.85 : 0.2,
          height: active ? undefined : 6,
          animation: active ? `vls-wave ${0.6 + (i % 5) * 0.12}s ease-in-out infinite alternate` : "none",
          animationDelay: `${i * 0.04}s`,
          minHeight: 4,
        }} />
      ))}
    </div>
  );
}

function OrbitRing({ size, color, duration, reverse }: {
  size: number; color: string; duration: number; reverse?: boolean;
}) {
  return (
    <div className={reverse ? "vls-orbit-rev" : "vls-orbit"} style={{
      position: "absolute", width: size, height: size, borderRadius: "50%",
      border: `1.5px solid ${color}22`,
      top: "50%", left: "50%",
      marginLeft: -(size / 2), marginTop: -(size / 2),
      animationDuration: `${duration}s`,
    }}>
      <div style={{
        position: "absolute", top: -4, left: "50%",
        width: 7, height: 7, borderRadius: "50%",
        backgroundColor: color, transform: "translateX(-50%)",
        boxShadow: `0 0 10px ${color}`,
      }} />
    </div>
  );
}

export default function VoiceLoadingScreen({ stage, noiseResult }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.id === stage);
  const current    = STAGES[currentIdx] ?? STAGES[0];
  const meta       = STAGE_META[stage] ?? STAGE_META["noise"];

  const [displayedNoise, setDisplayedNoise] = useState<NoiseResult | null>(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const checkTheme = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (noiseResult?.noise_type && (stage === "filtering" || stage === "emotion" || stage === "profile")) {
      setDisplayedNoise(noiseResult);
    }
  }, [noiseResult, stage]);

  const fmtConf = (val: number | undefined | null): string => {
    if (val == null || isNaN(val)) return "—";
    return val.toFixed(0);
  };

  // Active color: bright in dark mode, muted in light mode
  const activeColor = isDark ? current.color : current.colorLight;

  // Background
  const gridColor  = isDark ? meta.gridColorDark  : meta.gridColorLight;
  const blobColor  = isDark ? meta.blobColorDark  : meta.blobColorLight;

  const bg = isDark
    ? `linear-gradient(135deg, #050510 0%, #0a0825 30%, #120a30 50%, #0d0520 70%, #050510 100%)`
    : `linear-gradient(135deg, #faf5ff 0%, #ede9fe 15%, #e0f2fe 30%, #fce7f3 50%, #ede9fe 65%, #ecfdf5 80%, #faf5ff 100%)`;

  // Text
  const labelColor = isDark ? "#f1f5f9" : "#12082a";
  const subColor   = isDark ? "#64748b" : "#6b7280";
  const stepColor  = isDark ? "#334155" : "#9c8ab0";
  const stepBorder = isDark ? "#1e293b" : "rgba(109,40,217,0.2)";

  // Pill
  const pillBg     = isDark ? "#0f172a" : "rgba(255,255,255,0.92)";
  const pillBorder = isDark ? "#1e293b" : "rgba(109,40,217,0.2)";
  const pillText   = isDark ? "#e2e8f0" : "#12082a";
  const pillSub    = isDark ? "#475569" : "#7c6e94";
  const barTrack   = isDark ? "#1e293b" : "rgba(109,40,217,0.1)";
  const confColor  = isDark ? "#38bdf8" : "#0284c7";

  // Dark mode star particles
  const stars = isDark ? Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: `${(i * 2.1 + 5) % 100}%`,
    top: `${(i * 3.3 + 7) % 100}%`,
    size: i % 5 === 0 ? 3 : 1.5,
    delay: `${(i * 0.2) % 6}s`,
    duration: `${2 + (i % 4)}s`,
  })) : [];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'SF Pro Display', system-ui, sans-serif",
      overflow: "hidden",
      transition: "background 0.3s ease",
    }}>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />

      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
        opacity: isDark ? 0.6 : 0.5,
        transition: "background-image 0.8s ease",
      }} />

      {/* Dark mode: star particles */}
      {isDark && stars.map(s => (
        <div key={s.id} style={{
          position: "absolute", left: s.left, top: s.top,
          width: s.size, height: s.size, borderRadius: "50%",
          backgroundColor: s.id % 3 === 0 ? "rgba(6,182,212,0.6)" : s.id % 3 === 1 ? "rgba(167,139,250,0.5)" : "rgba(236,72,153,0.5)",
          boxShadow: s.size > 2 ? `0 0 8px ${s.id % 3 === 0 ? "rgba(6,182,212,0.7)" : "rgba(167,139,250,0.6)"}` : "none",
          animation: `vls-twinkle ${s.duration} ${s.delay} ease-in-out infinite`,
        }} />
      ))}

      {/* Dark mode: extra nebula blobs */}
      {isDark && (
        <>
          <div className="vls-float" style={{
            position: "absolute", width: 400, height: 400, borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
            top: "20%", right: "10%", animationDelay: "2s",
          }} />
          <div className="vls-float" style={{
            position: "absolute", width: 300, height: 300, borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)",
            bottom: "15%", left: "8%", animationDelay: "3s",
          }} />
        </>
      )}

      {/* Ambient blob */}
      <div className="vls-float" style={{
        position: "absolute", width: 500, height: 500, borderRadius: "50%",
        backgroundImage: `radial-gradient(circle, ${blobColor} 0%, transparent 70%)`,
        top: "50%", left: "50%", marginLeft: -250, marginTop: -250,
        transition: "background-image 0.8s ease",
      }} />

      {/* Light mode decorations */}
      {!isDark && (
        <>
          {/* Multiple colorful blobs */}
          <div className="vls-float" style={{
            position: "absolute", width: 280, height: 280, borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 70%)",
            top: "15%", right: "10%", animationDelay: "1s",
          }} />
          <div className="vls-float" style={{
            position: "absolute", width: 200, height: 200, borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)",
            bottom: "20%", left: "15%", animationDelay: "2s",
          }} />
          <div className="vls-float" style={{
            position: "absolute", width: 220, height: 220, borderRadius: "50%",
            backgroundImage: "radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%)",
            top: "50%", left: "70%", animationDelay: "3s",
          }} />
          {/* Glassmorphism shapes */}
          <div style={{
            position: "absolute", top: "8%", left: "8%", width: 120, height: 120,
            borderRadius: "28px", transform: "rotate(45deg)",
            background: "rgba(139,92,246,0.04)",
            border: "1px solid rgba(139,92,246,0.12)",
            backdropFilter: "blur(12px)",
          }} />
          <div style={{
            position: "absolute", bottom: "12%", right: "10%", width: 90, height: 90,
            borderRadius: "50%",
            background: "rgba(14,165,233,0.04)",
            border: "1px solid rgba(14,165,233,0.1)",
            backdropFilter: "blur(12px)",
          }} />
          {/* Diagonal decorative lines */}
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden", opacity: 0.3,
            backgroundImage: `repeating-linear-gradient(45deg, rgba(109,40,217,0.06) 0px, rgba(109,40,217,0.06) 1px, transparent 1px, transparent 40px)`,
          }} />
        </>
      )}

      {/* Central orb */}
      <div style={{ position: "relative", marginBottom: 48, width: 100, height: 100 }}>
        <OrbitRing size={160} color={activeColor} duration={4} />
        <OrbitRing size={220} color={activeColor} duration={7} reverse />
        <OrbitRing size={280} color={activeColor} duration={11} />

        <div className={meta.glowClass} style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          backgroundImage: `radial-gradient(circle at 35% 35%, ${activeColor}cc, ${activeColor}44)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, transition: "background-image 0.5s ease", zIndex: 2,
          boxShadow: isDark
            ? `0 0 40px ${activeColor}33`
            : `0 8px 32px ${activeColor}44, 0 0 0 2px ${activeColor}22`,
        }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
            <div className="vls-scanline" style={{
              position: "absolute", left: 0, right: 0, height: "25%",
              backgroundImage: `linear-gradient(180deg, transparent, ${activeColor}33, transparent)`,
            }} />
          </div>
          {current.icon}
        </div>
      </div>

      {/* Stage label */}
      <div key={stage} className="vls-fade-in-up" style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: labelColor, letterSpacing: "-0.3px", marginBottom: 6 }}>
          {current.label}
        </div>
        <div style={{ fontSize: 13, color: subColor, fontFamily: "'Space Mono', monospace", letterSpacing: "0.3px" }}>
          {current.sublabel}
        </div>
      </div>

      {/* Waveform */}
      <div style={{ marginTop: 16, marginBottom: 32 }}>
        <WaveformBars color={activeColor} active={true} />
      </div>

      {/* Progress steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
        {STAGES.map((s, i) => {
          const isDone   = i < currentIdx;
          const isActive = i === currentIdx;
          const stageColor = isDark ? s.color : s.colorLight;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
              <div className={isActive ? meta.ringClass : undefined} style={{
                width: 32, height: 32, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: isDone ? 14 : 11, fontWeight: 700,
                border: `1.5px solid ${isDone ? stageColor : isActive ? stageColor : stepBorder}`,
                backgroundImage: isDone
                  ? `radial-gradient(circle, ${stageColor}22, ${stageColor}22)`
                  : isActive ? `radial-gradient(circle, ${stageColor}15, ${stageColor}15)` : "none",
                color: isDone ? stageColor : isActive ? stageColor : stepColor,
                transition: "all 0.4s ease",
                boxShadow: (isDone || isActive) && !isDark
                  ? `0 2px 8px ${stageColor}33`
                  : "none",
              }}>
                {isDone ? "✓" : i + 1}
              </div>
              {i < STAGES.length - 1 && (
                <div style={{
                  width: 40, height: 1,
                  backgroundImage: i < currentIdx
                    ? `linear-gradient(90deg, ${isDark ? s.color : s.colorLight}, ${isDark ? STAGES[i+1].color : STAGES[i+1].colorLight})`
                    : "none",
                  backgroundColor: i < currentIdx ? "transparent" : stepBorder,
                  transition: "all 0.6s ease", marginLeft: 2, marginRight: 2,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Noise result pill */}
      {displayedNoise && (
        <div className="vls-noise-pill" style={{
          backgroundColor: pillBg,
          border: `1px solid ${pillBorder}`,
          borderRadius: 12, padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 12,
          marginBottom: 12, maxWidth: 320,
          boxShadow: isDark ? "none" : "0 4px 20px rgba(109,40,217,0.1)",
        }}>
          <div style={{ fontSize: 20 }}>{NOISE_EMOJI[displayedNoise.noise_type] ?? "📊"}</div>
          <div>
            <div style={{
              fontSize: 11, color: pillSub,
              fontFamily: "'Space Mono', monospace",
              textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2,
            }}>Environment Detected</div>
            <div style={{ fontSize: 14, color: pillText, fontWeight: 500 }}>
              {displayedNoise.is_clean ? "✨ Noiseless / Clean"
                : (displayedNoise.audio_environment || displayedNoise.scene || "Unknown")}
            </div>
          </div>
          {!displayedNoise.is_clean && (
            <div style={{
              marginLeft: "auto", fontSize: 12,
              fontFamily: "'Space Mono', monospace",
              color: confColor,
              backgroundColor: isDark ? "#0ea5e915" : "rgba(2,132,199,0.08)",
              border: `1px solid ${isDark ? "#0ea5e930" : "rgba(2,132,199,0.2)"}`,
              borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap",
            }}>
              {fmtConf(displayedNoise.noise_confidence)}%
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        width: 260, height: 3, borderRadius: 2,
        backgroundColor: barTrack,
        overflow: "hidden", position: "relative",
      }}>
        <div className="vls-shimbar" style={{
          position: "absolute", inset: 0,
          width: `${((currentIdx + 1) / STAGES.length) * 100}%`,
          backgroundImage: `linear-gradient(90deg, transparent, ${activeColor}, ${activeColor}cc)`,
          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          borderRadius: 2,
        }} />
      </div>

      {/* Step counter */}
      <div style={{
        marginTop: 10, fontSize: 11, color: stepColor,
        fontFamily: "'Space Mono', monospace", letterSpacing: "0.5px",
      }}>
        STEP {currentIdx + 1} / {STAGES.length}
      </div>
    </div>
  );
}