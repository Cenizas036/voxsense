"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/profile",   label: "Profile"   },
    { href: "/settings",  label: "Settings"  },
  ];

  const initials = profile?.displayName
    ? profile.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "V";

  const bg = isDark ? "rgba(3,3,8,0.85)" : "rgba(255,255,255,0.85)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const linkColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
  const activeLinkColor = "#7c3aed";
  const activeLinkBg = "rgba(124,58,237,0.15)";
  const activeLinkBorder = "rgba(124,58,237,0.3)";
  const toggleBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const toggleBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const toggleColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
  const dropdownBg = isDark ? "rgba(15,10,30,0.97)" : "rgba(255,255,255,0.97)";
  const dropdownBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const dropdownText = isDark ? "white" : "#111";
  const dropdownSubtext = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const dropdownDivider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const dropdownLinkColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
  const dropdownLinkHover = isDark ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.08)";

  return (
    <nav style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 100,
      height: "64px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      background: bg,
      borderBottom: `1px solid ${border}`,
      transition: "background 0.3s ease, border-color 0.3s ease",
    }}>

      {/* Logo */}
      <Link href="/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "34px", height: "34px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 16px rgba(124,58,237,0.5)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
          </svg>
        </div>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: "20px",
          background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Voxsense
        </span>
      </Link>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

        {/* Nav links */}
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              textDecoration: "none",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: isActive ? 600 : 400,
              fontFamily: "'Inter', sans-serif",
              color: isActive ? activeLinkColor : linkColor,
              background: isActive ? activeLinkBg : "transparent",
              border: isActive ? `1px solid ${activeLinkBorder}` : "1px solid transparent",
              transition: "all 0.2s ease",
            }}>
              {link.label}
            </Link>
          );
        })}

        {/* Theme toggle — uses SVG icons, no emoji encoding issues */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: toggleBg,
            border: `1px solid ${toggleBorder}`,
            borderRadius: "8px",
            width: "36px", height: "36px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            color: toggleColor,
            transition: "all 0.2s ease",
            marginLeft: "4px",
          }}
        >
          {isDark ? (
            /* Sun icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            /* Moon icon */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Avatar + dropdown */}
        <div ref={dropdownRef} style={{ position: "relative", marginLeft: "4px" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: "36px", height: "36px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #7c3aed, #c026d3)",
              border: "2px solid rgba(124,58,237,0.5)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: "13px",
              color: "white",
              boxShadow: "0 0 12px rgba(124,58,237,0.4)",
            }}
          >
            {initials}
          </button>

          {dropdownOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              minWidth: "200px",
              background: dropdownBg,
              backdropFilter: "blur(20px)",
              border: `1px solid ${dropdownBorder}`,
              borderRadius: "12px",
              padding: "8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}>
              <div style={{
                padding: "10px 12px",
                borderBottom: `1px solid ${dropdownDivider}`,
                marginBottom: "6px",
              }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: "14px", color: dropdownText }}>
                  {profile?.displayName || "Voxsense User"}
                </div>
                <div style={{
                  fontSize: "12px", color: dropdownSubtext, marginTop: "2px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user?.email || user?.phoneNumber || ""}
                </div>
              </div>

              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: "block", padding: "9px 12px", borderRadius: "8px",
                    fontSize: "14px", color: dropdownLinkColor,
                    textDecoration: "none", fontFamily: "'Inter', sans-serif",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = dropdownLinkHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {link.label}
                </Link>
              ))}

              <button
                onClick={handleSignOut}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "12px 12px 9px", borderRadius: "8px",
                  fontSize: "14px", color: "#f87171",
                  background: "transparent", border: "none",
                  borderTop: `1px solid ${dropdownDivider}`,
                  cursor: "pointer", fontFamily: "'Inter', sans-serif",
                  marginTop: "4px", transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}