"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import PreAuthNav from "@/components/PreAuthNav";
import { useTheme } from "@/context/ThemeContext";

type Method = "email" | "phone";

export default function LoginPage() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [method, setMethod]     = useState<Method>("email");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

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

  const handlePhoneLogin = async () => {
    setError("");
    if (!phone.trim())          return setError("Please enter your phone number.");
    if (!phone.startsWith("+")) return setError("Include your country code, e.g. +91 9876543210");
    setLoading(true);
    try {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const confirmationResult = await signInWithPhoneNumber(auth, phone, recaptchaVerifierRef.current);
      (window as unknown as Record<string, unknown>).confirmationResult = confirmationResult;
      router.push("/verify");
    } catch (e: unknown) {
      if (recaptchaVerifierRef.current) { recaptchaVerifierRef.current.clear(); recaptchaVerifierRef.current = null; }
      const msg = (e as { message?: string })?.message ?? "";
      if (msg.includes("invalid-phone"))  setError("Invalid phone number. Include country code.");
      else if (msg.includes("too-many"))  setError("Too many attempts. Please wait and try again.");
      else                                setError("Could not send OTP. Please try again.");
    } finally { setLoading(false); }
  };

  const handleSubmit = () => method === "email" ? handleEmailLogin() : handlePhoneLogin();

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

      {/* Aurora blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)" : "radial-gradient(circle, rgba(79,70,229,0.1) 0%, transparent 70%)", animation: "blob1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-10%", left: "-10%", width: "450px", height: "450px", borderRadius: "50%", background: isDark ? "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)" : "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)", animation: "blob2 15s ease-in-out infinite" }} />
      </div>

      <div id="recaptcha-container" />

      {/* Card */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "440px", background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: "24px", padding: "40px 36px", backdropFilter: "blur(24px)", boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 8px 40px rgba(109,40,217,0.1)", transition: "background 0.3s, border-color 0.3s" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", overflow: "hidden", boxShadow: "0 0 16px rgba(124,58,237,0.5)", flexShrink: 0 }}>
            <Image src="/voxsense_logo.png" alt="Voxsense" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Voxsense
          </span>
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", margin: "0 0 6px", color: headCol }}>
          Welcome back
        </h1>
        <p style={{ fontSize: "14px", color: subCol, margin: "0 0 28px" }}>
          Sign in to continue to Voxsense
        </p>

        {/* Method toggle */}
        <div style={{ display: "flex", gap: "8px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(109,40,217,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(109,40,217,0.12)"}`, borderRadius: "12px", padding: "4px", marginBottom: "24px" }}>
          {(["email", "phone"] as Method[]).map((m) => (
            <button key={m} onClick={() => { setMethod(m); setError(""); }} style={{ flex: 1, padding: "9px", borderRadius: "9px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, fontFamily: "'Inter', sans-serif", transition: "all 0.2s", background: method === m ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "transparent", color: method === m ? "white" : (isDark ? "rgba(255,255,255,0.4)" : "#6b7280"), boxShadow: method === m ? "0 0 16px rgba(124,58,237,0.4)" : "none" }}>
              {m === "email" ? "📧 Email" : "📱 Phone"}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {method === "email" && (
            <>
              <div>
                <label style={{ fontSize: "13px", color: labCol, display: "block", marginBottom: "6px" }}>Email Address</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "13px", color: labCol, display: "block", marginBottom: "6px" }}>Password</label>
                <input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
              </div>
            </>
          )}
          {method === "phone" && (
            <div>
              <label style={{ fontSize: "13px", color: labCol, display: "block", marginBottom: "6px" }}>Phone Number</label>
              <input type="tel" placeholder="+91 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
              <p style={{ fontSize: "12px", color: isDark ? "rgba(255,255,255,0.3)" : "#9ca3af", marginTop: "6px" }}>Include your country code (e.g. +91 for India)</p>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: "16px", padding: "12px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "10px", fontSize: "13px", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", marginTop: "22px", padding: "13px", borderRadius: "12px", border: "none", background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", fontSize: "15px", fontWeight: 700, fontFamily: "'Syne', sans-serif", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 24px rgba(124,58,237,0.5)", transition: "all 0.2s" }}>
          {loading ? "Please wait…" : method === "email" ? "Sign In" : "Send OTP →"}
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
        #recaptcha-container { position:fixed; bottom:0; right:0; z-index:-1; opacity:0; pointer-events:none; }
      `}</style>
    </div>
  );
}