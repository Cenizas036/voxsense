"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import PreAuthNav from "@/components/PreAuthNav";
import { useTheme } from "@/context/ThemeContext";

export default function LoginPage() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]             = useState("");

  const handleEmailLogin = async () => {
    setError("");
    if (!email.trim())    return setError("Please enter your email.");
    if (!password.trim()) return setError("Please enter your password.");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential"))
        setError("Incorrect email or password. Please try again.");
      else if (msg.includes("too-many-requests"))
        setError("Too many failed attempts. Please wait a moment.");
      else
        setError("Login failed. Please check your details and try again.");
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/dashboard");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (!msg.includes("popup-closed")) setError("Google sign-in failed. Please try again.");
    } finally { setGoogleLoading(false); }
  };

  const bg      = isDark ? "#030308" : "#f0eeff";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";
  const cardBdr = isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.15)";
  const headCol = isDark ? "white"                  : "#0f172a";
  const subCol  = isDark ? "rgba(255,255,255,0.4)"  : "#6b7280";
  const labCol  = isDark ? "rgba(255,255,255,0.5)"  : "#4b5563";

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.2)"}`,
    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.95)",
    color: isDark ? "white" : "#0f172a",
    fontSize: "14px", fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box", transition: "border-color 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 24px 24px", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden", transition: "background 0.3s ease" }}>

      <PreAuthNav />

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)" : "radial-gradient(circle, rgba(79,70,229,0.1) 0%, transparent 70%)", animation: "blob1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-10%", left: "-10%", width: "450px", height: "450px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)" : "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)", animation: "blob2 15s ease-in-out infinite" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "440px", background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: "24px", padding: "40px 36px", backdropFilter: "blur(24px)", boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 8px 40px rgba(109,40,217,0.1)", transition: "background 0.3s, border-color 0.3s" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", overflow: "hidden", boxShadow: "0 0 16px rgba(124,58,237,0.5)", flexShrink: 0 }}>
            <Image src="/voxsense_logo.png" alt="Voxsense" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Voxsense
          </span>
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", margin: "0 0 6px", color: headCol }}>Welcome back</h1>
        <p style={{ fontSize: "14px", color: subCol, margin: "0 0 28px" }}>Sign in to continue to Voxsense</p>

        {/* Google Button */}
        <button onClick={handleGoogleLogin} disabled={googleLoading} style={{ width: "100%", padding: "11px", borderRadius: "12px", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.2)"}`, background: isDark ? "rgba(255,255,255,0.05)" : "white", color: isDark ? "white" : "#0f172a", fontSize: "14px", fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: googleLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "20px", transition: "all 0.2s", opacity: googleLoading ? 0.7 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ flex: 1, height: "1px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.1)" }} />
          <span style={{ fontSize: "12px", color: subCol }}>or</span>
          <div style={{ flex: 1, height: "1px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.1)" }} />
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "13px", color: labCol, display: "block", marginBottom: "6px" }}>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: "13px", color: labCol, display: "block", marginBottom: "6px" }}>Password</label>
            <input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()} style={inputStyle} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: "16px", padding: "12px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "10px", fontSize: "13px", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        <button onClick={handleEmailLogin} disabled={loading} style={{ width: "100%", marginTop: "22px", padding: "13px", borderRadius: "12px", border: "none", background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", fontSize: "15px", fontWeight: 700, fontFamily: "'Syne', sans-serif", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 24px rgba(124,58,237,0.5)", transition: "all 0.2s" }}>
          {loading ? "Please wait…" : "Sign In"}
        </button>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: subCol }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>Sign up</Link>
        </p>
      </div>

      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,30px) scale(1.1)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,40px) scale(0.95)} }
        input::placeholder { color: ${isDark ? "rgba(255,255,255,0.2)" : "#9ca3af"}; }
        input:focus { outline:none; border-color:rgba(124,58,237,0.6)!important; box-shadow:0 0 0 3px rgba(124,58,237,0.15); }
      `}</style>
    </div>
  );
}