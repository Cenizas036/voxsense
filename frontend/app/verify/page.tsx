"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ConfirmationResult } from "firebase/auth";
import PreAuthNav from "@/components/PreAuthNav";
import { useTheme } from "@/context/ThemeContext";

export default function VerifyPage() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [digits, setDigits]     = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [cooldown, setCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { startCooldown(); }, []);

  function startCooldown() {
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError("");
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (digit && index === 5) {
      const code = [...newDigits.slice(0, 5), digit].join("");
      if (code.length === 6) verifyCode(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) { const n = [...digits]; n[index] = ""; setDigits(n); }
      else if (index > 0) inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) newDigits[i] = pasted[i];
    setDigits(newDigits);
    setError("");
    inputRefs.current[Math.min(pasted.length - 1, 5)]?.focus();
    if (pasted.length === 6) verifyCode(pasted);
  }

  async function verifyCode(code: string) {
    setError(""); setLoading(true);
    try {
      const confirmationResult = (window as unknown as Record<string, unknown>).confirmationResult as ConfirmationResult | undefined;
      if (!confirmationResult) { setError("Session expired. Please go back and request a new OTP."); setLoading(false); return; }
      await confirmationResult.confirm(code);
      setSuccess("Verified! Taking you to your dashboard…");
      setTimeout(() => router.push("/dashboard"), 1000);
    } catch {
      setError("Incorrect code. Please check and try again.");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally { setLoading(false); }
  }

  function handleVerifyClick() {
    const code = digits.join("");
    if (code.length < 6) return setError("Please enter all 6 digits.");
    verifyCode(code);
  }

  const bg      = isDark ? "#030308" : "#f0eeff";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";
  const cardBdr = isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.15)";
  const headCol = isDark ? "white"                  : "#0f172a";
  const subCol  = isDark ? "rgba(255,255,255,0.4)"  : "#6b7280";

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 24px 24px", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden", transition: "background 0.3s ease" }}>

      <PreAuthNav />

      {/* Aurora blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)" : "radial-gradient(circle, rgba(124,58,237,0.10) 0%, transparent 70%)", animation: "blob1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "450px", height: "450px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(192,38,211,0.14) 0%, transparent 70%)" : "radial-gradient(circle, rgba(192,38,211,0.07) 0%, transparent 70%)", animation: "blob2 15s ease-in-out infinite" }} />
      </div>

      {/* Card */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "420px", background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: "24px", padding: "40px 36px", backdropFilter: "blur(24px)", boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 8px 40px rgba(109,40,217,0.1)", transition: "background 0.3s, border-color 0.3s" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", overflow: "hidden", boxShadow: "0 0 16px rgba(124,58,237,0.5)", flexShrink: 0 }}>
            <Image src="/voxsense_logo.png" alt="Voxsense" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Voxsense
          </span>
        </div>

        {/* Phone icon */}
        <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", marginBottom: "20px" }}>
          📱
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "24px", margin: "0 0 8px", color: headCol }}>
          Verify your number
        </h1>
        <p style={{ fontSize: "14px", color: subCol, margin: "0 0 32px", lineHeight: 1.6 }}>
          We sent a 6-digit code to your phone. Enter it below to continue.
        </p>

        {/* OTP boxes */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "28px" }}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              autoFocus={i === 0}
              style={{ width: "48px", height: "56px", borderRadius: "12px", border: digit ? "1px solid rgba(124,58,237,0.7)" : `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.2)"}`, background: digit ? "rgba(124,58,237,0.12)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)"), color: isDark ? "white" : "#0f172a", fontSize: "22px", fontWeight: 700, fontFamily: "'Syne', sans-serif", textAlign: "center", outline: "none", transition: "all 0.15s", boxShadow: digit ? "0 0 12px rgba(124,58,237,0.25)" : "none", caretColor: "transparent" }}
            />
          ))}
        </div>

        {error && <div style={{ marginBottom: "16px", padding: "12px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "10px", fontSize: "13px", color: "#fca5a5", textAlign: "center" }}>{error}</div>}
        {success && <div style={{ marginBottom: "16px", padding: "12px 14px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: "10px", fontSize: "13px", color: "#6ee7b7", textAlign: "center" }}>{success}</div>}

        <button onClick={handleVerifyClick} disabled={loading || !!success} style={{ width: "100%", padding: "13px", borderRadius: "12px", border: "none", background: (loading || !!success) ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", fontSize: "15px", fontWeight: 700, fontFamily: "'Syne', sans-serif", cursor: (loading || !!success) ? "not-allowed" : "pointer", boxShadow: (loading || !!success) ? "none" : "0 0 24px rgba(124,58,237,0.5)", transition: "all 0.2s" }}>
          {loading ? "Verifying…" : success ? "✓ Verified!" : "Verify Code"}
        </button>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: subCol }}>
          Didn't receive it?{" "}
          <button onClick={() => cooldown === 0 && router.back()} disabled={cooldown > 0} style={{ background: "none", border: "none", padding: 0, cursor: cooldown > 0 ? "not-allowed" : "pointer", color: cooldown > 0 ? (isDark ? "rgba(255,255,255,0.25)" : "#9ca3af") : "#a78bfa", fontWeight: 600, fontSize: "14px", fontFamily: "'Inter', sans-serif" }}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
          </button>
        </p>
        <p style={{ textAlign: "center", marginTop: "10px", fontSize: "13px", color: isDark ? "rgba(255,255,255,0.25)" : "#9ca3af" }}>
          Wrong number?{" "}
          <button onClick={() => router.back()} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: isDark ? "rgba(255,255,255,0.4)" : "#6b7280", fontSize: "13px", fontFamily: "'Inter', sans-serif", textDecoration: "underline" }}>
            Go back
          </button>
        </p>
      </div>

      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,30px) scale(1.1)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,40px) scale(0.95)} }
      `}</style>
    </div>
  );
}