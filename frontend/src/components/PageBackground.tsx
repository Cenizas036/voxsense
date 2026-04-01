"use client";

import { useState, useEffect } from "react";

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

/**
 * Shared animated background used across ALL pages (dashboard, profile, settings, etc.)
 * Provides consistent vibrant backgrounds in both dark and light modes.
 */
export default function PageBackground() {
  const isDark = useIsDark();

  if (isDark) {
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden",
        background: "linear-gradient(145deg, #030308 0%, #0a0520 40%, #0d0a1a 70%, #030308 100%)",
      }}>
        {/* Aurora blobs */}
        <div style={{
          position: "absolute", top: "-15%", left: "-10%",
          width: 700, height: 700, borderRadius: "50%",
          backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(79,70,229,0.1) 40%, transparent 70%)",
          animation: "pb-float1 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", right: "-8%",
          width: 600, height: 600, borderRadius: "50%",
          backgroundImage: "radial-gradient(circle, rgba(6,182,212,0.2) 0%, rgba(79,70,229,0.08) 40%, transparent 70%)",
          animation: "pb-float2 18s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "40%", left: "60%", transform: "translate(-50%,-50%)",
          width: 450, height: 450, borderRadius: "50%",
          backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)",
          animation: "pb-float3 12s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "65%", left: "20%",
          width: 300, height: 300, borderRadius: "50%",
          backgroundImage: "radial-gradient(circle, rgba(20,184,166,0.12) 0%, transparent 70%)",
          animation: "pb-float2 16s 3s ease-in-out infinite",
        }} />
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />
        {/* Stars */}
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: i % 5 === 0 ? 3 : 1.5, height: i % 5 === 0 ? 3 : 1.5,
            left: `${(i * 3.3 + 5) % 100}%`, top: `${(i * 2.7 + 8) % 100}%`,
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.35)",
            boxShadow: i % 5 === 0 ? "0 0 6px rgba(255,255,255,0.5)" : "none",
            animation: `pb-twinkle ${3 + (i % 4)}s ${(i * 0.3) % 4}s ease-in-out infinite`,
          }} />
        ))}
        {/* Vignette */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse at center, transparent 40%, rgba(3,3,8,0.7) 100%)" }} />
      </div>
    );
  }

  // Light mode
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden",
      background: "linear-gradient(135deg, #faf5ff 0%, #ede9fe 15%, #e0f2fe 30%, #fce7f3 50%, #ede9fe 65%, #ecfdf5 80%, #faf5ff 100%)",
    }}>
      {/* Multi-color orbs */}
      <div style={{
        position: "absolute", top: "-10%", left: "-8%",
        width: 550, height: 550, borderRadius: "50%",
        backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)",
        animation: "pb-float1 14s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "-8%", right: "-5%",
        width: 450, height: 450, borderRadius: "50%",
        backgroundImage: "radial-gradient(circle, rgba(236,72,153,0.15) 0%, rgba(244,114,182,0.06) 50%, transparent 70%)",
        animation: "pb-float2 18s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 400, height: 400, borderRadius: "50%",
        backgroundImage: "radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)",
        animation: "pb-float3 12s ease-in-out infinite",
      }} />
      {/* Pastel accents */}
      {[
        { top: "12%", left: "72%", size: 180, color: "rgba(251,191,36,0.1)" },
        { top: "58%", left: "12%", size: 150, color: "rgba(52,211,153,0.1)" },
        { top: "80%", left: "55%", size: 120, color: "rgba(99,102,241,0.08)" },
      ].map((orb, i) => (
        <div key={i} style={{
          position: "absolute", width: orb.size, height: orb.size, top: orb.top, left: orb.left,
          borderRadius: "50%", backgroundColor: orb.color, filter: "blur(40px)",
          animation: `pb-float${(i % 3) + 1} ${10 + i * 3}s ${i * 2}s ease-in-out infinite`,
        }} />
      ))}
      {/* Dot pattern */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.12) 1px, transparent 1px)",
        backgroundSize: "28px 28px", opacity: 0.5,
      }} />
      {/* Diagonal lines */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(135deg, rgba(124,58,237,0.04) 0px, rgba(124,58,237,0.04) 1px, transparent 1px, transparent 50px)",
      }} />
      {/* Glassmorphism shapes */}
      <div style={{
        position: "absolute", top: "6%", right: "6%", width: 140, height: 140,
        borderRadius: "28px", transform: "rotate(45deg)",
        background: "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(236,72,153,0.03))",
        border: "1px solid rgba(139,92,246,0.12)",
        backdropFilter: "blur(16px)",
        animation: "pb-float1 15s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", left: "4%", width: 100, height: 100,
        borderRadius: "50%",
        background: "linear-gradient(135deg, rgba(14,165,233,0.04), rgba(52,211,153,0.03))",
        border: "1px solid rgba(14,165,233,0.1)",
        backdropFilter: "blur(16px)",
        animation: "pb-float2 12s 2s ease-in-out infinite",
      }} />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pb-float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,20px) scale(1.06)} }
        @keyframes pb-float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-25px,30px) scale(0.96)} }
        @keyframes pb-float3 { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) translate(15px,-20px) scale(1.04)} }
        @keyframes pb-twinkle { 0%,100%{opacity:0.25;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
      `}} />
    </div>
  );
}
