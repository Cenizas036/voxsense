"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteUser, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential,
} from "firebase/auth";
import { doc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import SessionLog from "@/components/SessionLog";

const ADMIN_EMAIL = "admin@voxsense.com";

/* ── tiny theme hook ─────────────────────────────────────────────────── */
function useIsDark() {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export default function SettingsPage() {
  return <AuthGuard><SettingsContent /></AuthGuard>;
}

function SettingsContent() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { toggleTheme, isDark: themeIsDark }        = useTheme();
  const router                                      = useRouter();
  const isDark                                      = useIsDark();

  const isAdmin = user?.email === ADMIN_EMAIL;

  const [newName,            setNewName]            = useState(profile?.displayName ?? "");
  const [nameSaving,         setNameSaving]         = useState(false);
  const [nameSuccess,        setNameSuccess]        = useState(false);
  const [nameError,          setNameError]          = useState("");
  const [showDeleteConfirm,  setShowDeleteConfirm]  = useState(false);
  const [deletePassword,     setDeletePassword]     = useState("");
  const [deleteLoading,      setDeleteLoading]      = useState(false);
  const [deleteError,        setDeleteError]        = useState("");
  const [signingOut,         setSigningOut]         = useState(false);

  async function handleSaveName() {
    if (!user) return;
    setNameError("");
    if (!newName.trim()) return setNameError("Name cannot be empty.");
    setNameSaving(true);
    try {
      await updateProfile(user, { displayName: newName.trim() });
      await refreshProfile();
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch { setNameError("Failed to update name. Please try again."); }
    finally   { setNameSaving(false); }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
  }

  async function handleDeleteAccount() {
    if (!user) return;
    setDeleteError(""); setDeleteLoading(true);
    try {
      if (user.email && deletePassword) {
        const cred = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(user, cred);
      }
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
      router.push("/");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential"))
        setDeleteError("Incorrect password. Please try again.");
      else if (msg.includes("requires-recent-login"))
        setDeleteError("Please sign out and sign back in before deleting your account.");
      else
        setDeleteError("Failed to delete account. Please try again.");
    } finally { setDeleteLoading(false); }
  }

  /* ── theme tokens ──────────────────────────────────────────────────── */
  const tk = {
    pageBg:         isDark ? "#030308"                    : "#f0eeff",
    heading:        isDark ? "#f0f0ff"                    : "#0f172a",
    subtext:        isDark ? "rgba(255,255,255,0.4)"      : "#4b5563",
    sectionTitle:   isDark ? "rgba(255,255,255,0.4)"      : "#7c3aed",
    cardBg:         isDark ? "rgba(255,255,255,0.03)"     : "rgba(255,255,255,0.85)",
    cardBorder:     isDark ? "rgba(255,255,255,0.08)"     : "rgba(109,40,217,0.15)",
    cardShadow:     isDark ? "none"                       : "0 4px 24px rgba(109,40,217,0.08)",
    dangerCardBg:   isDark ? "rgba(248,113,113,0.04)"     : "rgba(254,242,242,0.9)",
    dangerCardBorder:isDark ? "rgba(248,113,113,0.15)"   : "rgba(248,113,113,0.2)",
    labelColor:     isDark ? "rgba(255,255,255,0.5)"      : "#4b5563",
    inputBg:        isDark ? "rgba(255,255,255,0.05)"     : "rgba(255,255,255,0.9)",
    inputBorder:    isDark ? "rgba(255,255,255,0.1)"      : "rgba(109,40,217,0.2)",
    inputColor:     isDark ? "white"                      : "#0f172a",
    inputPlaceholder:isDark ? "rgba(255,255,255,0.2)"    : "#9ca3af",
    divider:        isDark ? "rgba(255,255,255,0.06)"     : "rgba(109,40,217,0.1)",
    textPrimary:    isDark ? "white"                      : "#0f172a",
    textSub:        isDark ? "rgba(255,255,255,0.4)"      : "#6b7280",
    toggleBg:       isDark ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(0,0,0,0.06)",
    toggleBorder:   isDark ? "rgba(255,255,255,0.15)"     : "rgba(109,40,217,0.2)",
    signOutBg:      isDark ? "rgba(255,255,255,0.05)"     : "rgba(109,40,217,0.06)",
    signOutBorder:  isDark ? "rgba(255,255,255,0.12)"     : "rgba(109,40,217,0.2)",
    signOutColor:   isDark ? "rgba(255,255,255,0.75)"     : "#374151",
    blob1:          isDark ? "rgba(124,58,237,0.12)"      : "rgba(124,58,237,0.08)",
    blob2:          isDark ? "rgba(192,38,211,0.10)"      : "rgba(192,38,211,0.07)",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: "11px 14px", borderRadius: "10px",
    border: `1px solid ${tk.inputBorder}`, background: tk.inputBg,
    color: tk.inputColor, fontSize: "14px",
    fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px", color: tk.labelColor,
    display: "block", marginBottom: "6px", fontWeight: 500,
  };

  return (
    <div style={{ minHeight: "100vh", background: tk.pageBg, fontFamily: "'Inter', sans-serif", transition: "background 0.3s ease" }}>
      <Navbar />

      {/* Decorative background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-15%", left: "-10%",
          width: "450px", height: "450px", borderRadius: "50%",
          background: `radial-gradient(circle, ${tk.blob1} 0%, transparent 70%)`,
          animation: "blob1 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", right: "-5%",
          width: "400px", height: "400px", borderRadius: "50%",
          background: `radial-gradient(circle, ${tk.blob2} 0%, transparent 70%)`,
          animation: "blob2 18s ease-in-out infinite",
        }} />
        {!isDark && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(109,40,217,0.12) 1px, transparent 1px)",
            backgroundSize: "28px 28px", opacity: 0.5,
          }} />
        )}
        {isDark && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "linear-gradient(rgba(124,58,237,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.03) 1px,transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "680px", margin: "0 auto", padding: "100px 24px 100px" }}>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "30px", margin: "0 0 6px", color: tk.heading, transition: "color 0.3s" }}>
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: tk.subtext, margin: "0 0 36px", transition: "color 0.3s" }}>
          Manage your preferences and account
        </p>

        {/* ── APPEARANCE ───────────────────────────────────────────────── */}
        <Section title="Appearance" tk={tk}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 500, color: tk.textPrimary, transition: "color 0.3s" }}>
                {themeIsDark ? "🌙 Dark Mode" : "☀️ Light Mode"}
              </div>
              <div style={{ fontSize: "13px", color: tk.textSub, marginTop: "3px", transition: "color 0.3s" }}>
                {themeIsDark ? "Switch to light mode" : "Switch to dark mode"}
              </div>
            </div>
            <div onClick={toggleTheme} style={{
              width: "52px", height: "28px", borderRadius: "100px",
              background: themeIsDark ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(109,40,217,0.15)",
              border: `1px solid ${themeIsDark ? "rgba(255,255,255,0.15)" : "rgba(109,40,217,0.3)"}`,
              cursor: "pointer", position: "relative", transition: "all 0.3s", flexShrink: 0,
            }}>
              <div style={{
                position: "absolute", top: "3px",
                left: themeIsDark ? "26px" : "3px",
                width: "20px", height: "20px", borderRadius: "50%",
                background: "white", transition: "left 0.3s",
                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              }} />
            </div>
          </div>
        </Section>

        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <Section title="Account" tk={tk}>
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Display Name</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input type="text" placeholder="Your display name" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                style={inputStyle} />
              <button onClick={handleSaveName} disabled={nameSaving} style={{
                padding: "0 20px", borderRadius: "10px", border: "none",
                background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                color: "white", fontSize: "14px", fontWeight: 600,
                cursor: nameSaving ? "not-allowed" : "pointer",
                opacity: nameSaving ? 0.6 : 1, fontFamily: "'Inter', sans-serif",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {nameSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {nameError && <p style={{ fontSize: "12px", color: "#fca5a5", marginTop: "6px" }}>{nameError}</p>}
            {nameSuccess && <p style={{ fontSize: "12px", color: "#34d399", marginTop: "6px" }}>✓ Name updated!</p>}
          </div>

          <div style={{ paddingTop: "16px", borderTop: `1px solid ${tk.divider}` }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px", color: tk.textPrimary, transition: "color 0.3s" }}>
              Sign Out
            </div>
            <div style={{ fontSize: "13px", color: tk.textSub, marginBottom: "14px", transition: "color 0.3s" }}>
              You'll be taken back to the login page.
            </div>
            <button onClick={handleSignOut} disabled={signingOut} style={{
              padding: "10px 24px", borderRadius: "10px",
              border: `1px solid ${tk.signOutBorder}`,
              background: tk.signOutBg, color: tk.signOutColor,
              fontSize: "14px", fontWeight: 600, cursor: "pointer",
              fontFamily: "'Inter', sans-serif", transition: "all 0.2s",
            }}>
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </Section>

        {/* ── ADMIN (if applicable) ─────────────────────────────────────── */}
        {isAdmin && (
          <Section title="🛡️ Admin Panel — All Sessions" tk={tk}>
            <p style={{ fontSize: "13px", color: tk.textSub, marginBottom: "20px" }}>
              You are logged in as root admin.
            </p>
            <SessionLog />
          </Section>
        )}

        {/* ── DANGER ZONE ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
            color: "rgba(248,113,113,0.7)", margin: "0 0 10px",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>Danger Zone</h2>
          <div style={{
            background: tk.dangerCardBg, border: `1px solid ${tk.dangerCardBorder}`,
            borderRadius: "20px", padding: "24px", backdropFilter: "blur(20px)",
            boxShadow: tk.cardShadow, transition: "background 0.3s, border-color 0.3s",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px", color: "#f87171" }}>
              Delete Account
            </div>
            <div style={{ fontSize: "13px", color: tk.textSub, marginBottom: "16px", transition: "color 0.3s" }}>
              Permanently deletes your account and all your data. This cannot be undone.
            </div>

            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={{
                padding: "10px 24px", borderRadius: "10px",
                border: "1px solid rgba(248,113,113,0.35)",
                background: "rgba(248,113,113,0.08)",
                color: "#f87171", fontSize: "14px", fontWeight: 600,
                cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.2s",
              }}>Delete My Account</button>
            ) : (
              <div style={{
                background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: "14px", padding: "20px",
              }}>
                <p style={{ fontSize: "14px", color: "#fca5a5", margin: "0 0 14px", fontWeight: 500 }}>
                  ⚠️ Are you absolutely sure? This will delete everything.
                </p>
                {user?.email && (
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ ...labelStyle, color: "rgba(255,100,100,0.7)" }}>
                      Confirm your password to continue
                    </label>
                    <input type="password" placeholder="Enter your password"
                      value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                      style={{ ...inputStyle, borderColor: "rgba(248,113,113,0.3)", flex: "unset", width: "100%" }} />
                  </div>
                )}
                {deleteError && <p style={{ fontSize: "13px", color: "#fca5a5", marginBottom: "12px" }}>{deleteError}</p>}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={handleDeleteAccount} disabled={deleteLoading} style={{
                    padding: "10px 20px", borderRadius: "10px", border: "none",
                    background: deleteLoading ? "rgba(248,113,113,0.3)" : "#dc2626",
                    color: "white", fontSize: "14px", fontWeight: 700,
                    cursor: deleteLoading ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif",
                  }}>
                    {deleteLoading ? "Deleting…" : "Yes, Delete Everything"}
                  </button>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeleteError(""); }}
                    style={{
                      padding: "10px 20px", borderRadius: "10px",
                      border: `1px solid ${tk.cardBorder}`,
                      background: tk.cardBg, color: tk.textSub,
                      fontSize: "14px", cursor: "pointer", fontFamily: "'Inter', sans-serif",
                    }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,20px) scale(1.08)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,30px) scale(0.95)} }
        input::placeholder { color: ${tk.inputPlaceholder}; }
        input:focus { outline:none; border-color:rgba(124,58,237,0.6)!important; box-shadow:0 0 0 3px rgba(124,58,237,0.15); }
      `}</style>
    </div>
  );
}

/* ── Reusable section ──────────────────────────────────────────────── */
function Section({ title, children, tk }: {
  title: string;
  children: React.ReactNode;
  tk: { sectionTitle: string; cardBg: string; cardBorder: string; cardShadow: string };
}) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h2 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
        color: tk.sectionTitle, margin: "0 0 10px",
        textTransform: "uppercase", letterSpacing: "0.08em",
        transition: "color 0.3s",
      }}>
        {title}
      </h2>
      <div style={{
        background: tk.cardBg, border: `1px solid ${tk.cardBorder}`,
        borderRadius: "20px", padding: "24px", backdropFilter: "blur(20px)",
        boxShadow: tk.cardShadow, transition: "background 0.3s, border-color 0.3s",
      }}>
        {children}
      </div>
    </div>
  );
}