"use client";

/**
 * PreAuthNav
 * A minimal top bar shown on all pre-login pages (login, signup, verify).
 * Displays the Voxsense logo + wordmark on the left, and a theme toggle on the right.
 * Uses the same ThemeContext as the rest of the app so the preference persists.
 */

import Image from "next/image";
import { useTheme } from "@/context/ThemeContext";

export default function PreAuthNav() {
  const { toggleTheme, isDark } = useTheme();

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      height: "56px",
      zIndex: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      background: isDark ? "rgba(3,3,8,0.6)" : "rgba(255,255,255,0.85)",
      borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.12)"}`,
      transition: "background 0.3s ease, border-color 0.3s ease",
    }}>

      {/* Logo + wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <div style={{
          width: "30px", height: "30px",
          borderRadius: "8px", overflow: "hidden",
          boxShadow: "0 0 12px rgba(124,58,237,0.45)",
          flexShrink: 0,
        }}>
          <Image
            src="/voxsense_logo.png"
            alt="Voxsense"
            width={30}
            height={30}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            priority
          />
        </div>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: "18px",
          background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Voxsense
        </span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          width: "34px", height: "34px",
          borderRadius: "9px",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(109,40,217,0.2)"}`,
          background: isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.08)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "15px",
          transition: "all 0.2s",
        }}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    </div>
  );
}