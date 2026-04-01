"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";

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

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}

function ProfileContent() {
  const { user, profile, refreshProfile } = useAuth();
  const isDark = useIsDark();

  const [displayName, setDisplayName] = useState("");
  const [occupation,  setOccupation]  = useState("");
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [error,       setError]       = useState("");

  // View vs Edit mode — default to view if profile has a name
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setOccupation(profile.occupation ?? "");
      // If no name yet, start in edit mode
      if (!profile.displayName?.trim()) setEditMode(true);
    }
  }, [profile]);

  async function handleSave() {
    if (!user) return;
    setError(""); setSuccess(false);
    if (!displayName.trim()) return setError("Please enter your display name.");
    setSaving(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      await updateDoc(doc(db, "users", user.uid), {
        displayName: displayName.trim(),
        occupation: occupation.trim(),
        lastLoginAt: serverTimestamp(),
      });
      await refreshProfile();
      setSuccess(true);
      setEditMode(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    } finally { setSaving(false); }
  }

  const initials = displayName
    ? displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "V";

  const detectedGender = profile?.detectedGender || "";
  const detectedAge    = profile?.detectedAge || "";
  const hasDetectedData = !!(detectedGender || detectedAge);

  /* ── theme tokens ─────────────────────────────────────────────────── */
  const tk = {
    pageBg:       isDark ? "#030308"                      : "#f0eeff",
    heading:      isDark ? "#f0f0ff"                      : "#0f172a",
    subtext:      isDark ? "rgba(255,255,255,0.4)"        : "#4b5563",
    cardBg:       isDark ? "rgba(255,255,255,0.03)"       : "rgba(255,255,255,0.85)",
    cardBorder:   isDark ? "rgba(255,255,255,0.08)"       : "rgba(109,40,217,0.15)",
    sectionLabel: isDark ? "rgba(255,255,255,0.6)"        : "#374151",
    labelColor:   isDark ? "rgba(255,255,255,0.5)"        : "#4b5563",
    inputBg:      isDark ? "rgba(255,255,255,0.05)"       : "rgba(255,255,255,0.9)",
    inputBorder:  isDark ? "rgba(255,255,255,0.1)"        : "rgba(109,40,217,0.2)",
    inputColor:   isDark ? "white"                        : "#0f172a",
    inputPlaceholder: isDark ? "rgba(255,255,255,0.2)"   : "#9ca3af",
    divider:      isDark ? "rgba(255,255,255,0.06)"       : "rgba(109,40,217,0.1)",
    readonlyColor:isDark ? "rgba(255,255,255,0.35)"       : "#6b7280",
    avatarName:   isDark ? "white"                        : "#0f172a",
    avatarEmail:  isDark ? "rgba(255,255,255,0.4)"        : "#6b7280",
    blob1:        isDark ? "rgba(124,58,237,0.12)"        : "rgba(124,58,237,0.08)",
    blob2:        isDark ? "rgba(192,38,211,0.10)"        : "rgba(192,38,211,0.07)",
    valueTxt:     isDark ? "#f0f0ff"                      : "#0f172a",
    chipBg:       isDark ? "rgba(124,58,237,0.12)"        : "rgba(124,58,237,0.08)",
    chipBorder:   isDark ? "rgba(124,58,237,0.25)"        : "rgba(124,58,237,0.2)",
    chipTxt:      isDark ? "#c4b5fd"                      : "#7c3aed",
    successBg:    isDark ? "rgba(52,211,153,0.1)"         : "rgba(52,211,153,0.08)",
    successBdr:   isDark ? "rgba(52,211,153,0.3)"         : "rgba(52,211,153,0.25)",
    errorBg:      isDark ? "rgba(248,113,113,0.1)"        : "rgba(248,113,113,0.06)",
    errorBdr:     isDark ? "rgba(248,113,113,0.3)"        : "rgba(248,113,113,0.25)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: `1px solid ${tk.inputBorder}`, background: tk.inputBg,
    color: tk.inputColor, fontSize: "14px",
    fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px", color: tk.labelColor,
    display: "block", marginBottom: "6px", fontWeight: 500,
  };

  // ── Info row for view mode ──
  function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0",
        borderBottom: `1px solid ${tk.divider}` }}>
        {icon && <span style={{ fontSize: "18px", width: "24px", textAlign: "center" }}>{icon}</span>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
            color: tk.labelColor, marginBottom: "2px" }}>{label}</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: tk.valueTxt,
            fontFamily: "'Inter', sans-serif" }}>{value || "—"}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: tk.pageBg, fontFamily: "'Inter', sans-serif", transition: "background 0.3s ease, color 0.3s ease" }}>
      <Navbar />

      {/* Aurora blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-10%", right: "-5%",
          width: "500px", height: "500px", borderRadius: "50%",
          background: `radial-gradient(circle, ${tk.blob1} 0%, transparent 70%)`,
          animation: "blob1 14s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", left: "-5%",
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
            backgroundImage: "linear-gradient(rgba(124,58,237,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "600px", margin: "0 auto", padding: "100px 24px 80px" }}>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "30px", margin: "0 0 6px", color: tk.heading, transition: "color 0.3s" }}>
          Your Profile
        </h1>
        <p style={{ fontSize: "14px", color: tk.subtext, margin: "0 0 36px", transition: "color 0.3s" }}>
          {editMode ? "Edit your personal information" : "Your personal information at a glance"}
        </p>

        {/* Avatar Header — always visible */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "36px" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #c026d3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", color: "white",
            boxShadow: "0 0 24px rgba(124,58,237,0.5)", border: "3px solid rgba(124,58,237,0.4)", flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "18px", color: tk.avatarName, transition: "color 0.3s" }}>
              {displayName || "Voxsense User"}
            </div>
            <div style={{ fontSize: "13px", color: tk.avatarEmail, marginTop: "3px", transition: "color 0.3s" }}>
              {user?.email || user?.phoneNumber || ""}
            </div>
          </div>
          {/* Edit / Cancel button */}
          {!editMode && (
            <button onClick={() => setEditMode(true)} style={{
              padding: "8px 18px", borderRadius: "10px",
              border: `1px solid ${tk.chipBorder}`, background: tk.chipBg,
              color: tk.chipTxt, fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "'Inter', sans-serif",
              display: "flex", alignItems: "center", gap: "6px", flexShrink: 0,
              transition: "all 0.2s",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>

        {/* ═══════════════════════ VIEW MODE ═══════════════════════ */}
        {!editMode && (
          <div style={{
            background: tk.cardBg, border: `1px solid ${tk.cardBorder}`,
            borderRadius: "20px", padding: "28px 32px", backdropFilter: "blur(20px)",
            boxShadow: isDark ? "none" : "0 8px 40px rgba(109,40,217,0.08)",
            transition: "background 0.3s, border-color 0.3s",
          }}>
            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
              color: isDark ? "rgba(255,255,255,0.5)" : "#7c3aed",
              margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>Personal Details</h2>

            <InfoRow icon="👤" label="Display Name" value={displayName} />
            <InfoRow icon="💼" label="Occupation" value={profile?.occupation || ""} />
            <InfoRow icon="📧" label="Email" value={user?.email || ""} />
            {user?.phoneNumber && <InfoRow icon="📱" label="Phone" value={user.phoneNumber} />}

            {/* Voice-Detected Profile Section */}
            {hasDetectedData && (
              <>
                <div style={{ height: "1px", background: tk.divider, margin: "20px 0" }} />
                <h2 style={{
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
                  color: isDark ? "rgba(255,255,255,0.5)" : "#7c3aed",
                  margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#7c3aed" }}>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  Voice-Detected Profile
                </h2>
                <div style={{
                  padding: "14px 16px", borderRadius: "12px", marginTop: "8px",
                  background: isDark ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.05)",
                  border: `1px solid ${isDark ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.12)"}`,
                }}>
                  <div style={{ fontSize: "11px", color: tk.labelColor, marginBottom: "8px", fontStyle: "italic" }}>
                    Detected from your voice analysis sessions
                  </div>
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    {detectedGender && (
                      <div style={{
                        padding: "6px 14px", borderRadius: "8px",
                        background: detectedGender === "Male" ? "rgba(96,165,250,0.12)" : "rgba(249,168,212,0.12)",
                        border: `1px solid ${detectedGender === "Male" ? "rgba(96,165,250,0.3)" : "rgba(249,168,212,0.3)"}`,
                        display: "flex", alignItems: "center", gap: "6px",
                      }}>
                        <span>{detectedGender === "Male" ? "👨" : "👩"}</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: detectedGender === "Male" ? "#60a5fa" : "#f9a8d4" }}>
                          {detectedGender}
                        </span>
                      </div>
                    )}
                    {detectedAge && (
                      <div style={{
                        padding: "6px 14px", borderRadius: "8px",
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.3)",
                        display: "flex", alignItems: "center", gap: "6px",
                      }}>
                        <span>🎂</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#fbbf24" }}>
                          {detectedAge}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════ EDIT MODE ═══════════════════════ */}
        {editMode && (
          <div style={{
            background: tk.cardBg, border: `1px solid ${tk.cardBorder}`,
            borderRadius: "20px", padding: "32px", backdropFilter: "blur(20px)",
            boxShadow: isDark ? "none" : "0 8px 40px rgba(109,40,217,0.08)",
            transition: "background 0.3s, border-color 0.3s",
          }}>

            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
              color: isDark ? "rgba(255,255,255,0.5)" : "#7c3aed",
              margin: "0 0 24px", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>Edit Profile</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input type="text" placeholder="Your full name" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Occupation</label>
                <input type="text" placeholder="e.g. Software Engineer, Student..." value={occupation}
                  onChange={(e) => setOccupation(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {/* Read-only model-detected fields */}
            {hasDetectedData && (
              <>
                <div style={{ height: "1px", background: tk.divider, margin: "24px 0" }} />
                <div style={{ marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tk.labelColor }}>
                    Voice-Detected (Read Only)
                  </span>
                </div>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {detectedGender && (
                    <div style={{
                      ...inputStyle, flex: "1", cursor: "not-allowed", opacity: 0.7,
                      display: "flex", alignItems: "center", gap: "8px", minWidth: "140px",
                    }}>
                      <span>{detectedGender === "Male" ? "👨" : "👩"}</span>
                      <div>
                        <div style={{ fontSize: "10px", color: tk.labelColor }}>Gender</div>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{detectedGender}</div>
                      </div>
                    </div>
                  )}
                  {detectedAge && (
                    <div style={{
                      ...inputStyle, flex: "1", cursor: "not-allowed", opacity: 0.7,
                      display: "flex", alignItems: "center", gap: "8px", minWidth: "140px",
                    }}>
                      <span>🎂</span>
                      <div>
                        <div style={{ fontSize: "10px", color: tk.labelColor }}>Age Group</div>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{detectedAge}</div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ height: "1px", background: tk.divider, margin: "28px 0" }} />

            {/* Account info (read-only) */}
            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "13px",
              color: isDark ? "rgba(255,255,255,0.5)" : "#7c3aed",
              margin: "0 0 20px", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>Account Info</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {user?.email && (
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <div style={{ ...inputStyle, color: tk.readonlyColor, cursor: "not-allowed", display: "flex", alignItems: "center" }}>
                    {user.email}
                    <span style={{
                      marginLeft: "auto", fontSize: "11px",
                      background: "rgba(52,211,153,0.15)", color: "#34d399",
                      border: "1px solid rgba(52,211,153,0.3)", borderRadius: "6px", padding: "2px 8px",
                    }}>verified</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{ marginTop: "20px", padding: "12px 14px", background: tk.errorBg, border: `1px solid ${tk.errorBdr}`, borderRadius: "10px", fontSize: "13px", color: "#fca5a5" }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ marginTop: "20px", padding: "12px 14px", background: tk.successBg, border: `1px solid ${tk.successBdr}`, borderRadius: "10px", fontSize: "13px", color: "#6ee7b7" }}>
                Profile saved successfully!
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: "13px", borderRadius: "12px", border: "none",
                background: saving ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: "white", fontSize: "15px", fontWeight: 700, fontFamily: "'Syne', sans-serif",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: saving ? "none" : "0 0 24px rgba(124,58,237,0.4)", transition: "all 0.2s",
              }}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {profile?.displayName?.trim() && (
                <button onClick={() => { setEditMode(false); setDisplayName(profile.displayName ?? ""); setOccupation(profile.occupation ?? ""); }}
                  style={{
                    padding: "13px 24px", borderRadius: "12px",
                    border: `1px solid ${tk.cardBorder}`, background: tk.cardBg,
                    color: tk.labelColor, fontSize: "14px", fontWeight: 600,
                    cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.2s",
                  }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,20px) scale(1.08)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,30px) scale(0.95)} }
        input::placeholder { color: ${tk.inputPlaceholder}; }
        input:focus, select:focus { outline:none; border-color:rgba(124,58,237,0.6)!important; box-shadow:0 0 0 3px rgba(124,58,237,0.15); }
        input[type=number]::-webkit-inner-spin-button { opacity:0.3; }
      `}</style>
    </div>
  );
}