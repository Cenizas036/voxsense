"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated floating particles on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: { x: number; y: number; r: number; dx: number; dy: number; alpha: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height,
        r:     Math.random() * 2 + 0.5,
        dx:    (Math.random() - 0.5) * 0.4,
        dy:    (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }

    let animId: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,139,250,${p.alpha})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    const handleResize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const features = [
    {
      icon: "⚧",
      title: "Gender Detection",
      desc: "Identifies vocal gender patterns with high accuracy using deep neural networks trained on diverse voice datasets.",
      color: "#7c3aed",
    },
    {
      icon: "🎂",
      title: "Age Analysis",
      desc: "Estimates speaker age range from subtle acoustic features — pitch, resonance, and vocal tract characteristics.",
      color: "#4f46e5",
    },
    {
      icon: "🎭",
      title: "Emotion Recognition",
      desc: "Detects 7 emotions in real time — happiness, sadness, anger, fear, disgust, surprise, and neutral.",
      color: "#c026d3",
    },
    {
      icon: "🔇",
      title: "Noise Filtering",
      desc: "Classifies background environment and separates speech from ambient noise for cleaner analysis.",
      color: "#0891b2",
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030308",
      color: "white",
      fontFamily: "'Inter', sans-serif",
      overflowX: "hidden",
    }}>

      {/* Floating particles canvas */}
      <canvas ref={canvasRef} style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Aurora blobs */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: "600px", height: "600px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)",
          animation: "blob1 12s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "30%", right: "-15%",
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(192,38,211,0.14) 0%, transparent 70%)",
          animation: "blob2 15s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", left: "30%",
          width: "550px", height: "550px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)",
          animation: "blob3 18s ease-in-out infinite",
        }} />
      </div>

      {/* Simple top bar with logo */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0,
        height: "64px", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        backdropFilter: "blur(20px)",
        background: "rgba(3,3,8,0.7)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "10px",
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
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px",
            background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Voxsense
          </span>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <Link href="/login" style={{
            padding: "8px 20px", borderRadius: "8px", fontSize: "14px",
            color: "rgba(255,255,255,0.7)", textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            fontFamily: "'Inter', sans-serif",
            transition: "all 0.2s",
          }}>
            Login
          </Link>
          <Link href="/signup" style={{
            padding: "8px 20px", borderRadius: "8px", fontSize: "14px",
            color: "white", textDecoration: "none",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            fontFamily: "'Inter', sans-serif",
            boxShadow: "0 0 16px rgba(124,58,237,0.4)",
          }}>
            Get Started
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section style={{
        position: "relative", zIndex: 1,
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center",
        padding: "100px 24px 60px",
      }}>

        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "6px 16px", borderRadius: "100px",
          background: "rgba(124,58,237,0.12)",
          border: "1px solid rgba(124,58,237,0.3)",
          marginBottom: "32px",
        }}>
          <span style={{ fontSize: "12px", color: "#a78bfa", fontWeight: 600, letterSpacing: "0.08em" }}>
            ✦ 7 ML MODELS RUNNING SIMULTANEOUSLY
          </span>
        </div>

        {/* Glowing mic icon */}
        <div style={{
          width: "80px", height: "80px", borderRadius: "24px",
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "32px",
          boxShadow: "0 0 40px rgba(124,58,237,0.6), 0 0 80px rgba(124,58,237,0.3)",
          animation: "pulse 3s ease-in-out infinite",
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z"/>
          </svg>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(40px, 7vw, 80px)",
          fontWeight: 800,
          lineHeight: 1.1,
          margin: "0 0 24px",
          maxWidth: "800px",
        }}>
          Voice Intelligence,{" "}
          <span style={{
            background: "linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Redefined
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: "clamp(16px, 2vw, 20px)",
          color: "rgba(255,255,255,0.55)",
          maxWidth: "560px",
          lineHeight: 1.7,
          margin: "0 0 48px",
        }}>
          Upload any audio and instantly analyze gender, age, emotion, and background noise using 7 state-of-the-art machine learning models — all at once.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/signup" style={{
            padding: "14px 36px", borderRadius: "12px",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "white", textDecoration: "none",
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px",
            boxShadow: "0 0 32px rgba(124,58,237,0.5)",
            transition: "all 0.2s",
          }}>
            Get Started — it's free
          </Link>
          <Link href="/login" style={{
            padding: "14px 36px", borderRadius: "12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.8)", textDecoration: "none",
            fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: "16px",
            transition: "all 0.2s",
          }}>
            Login
          </Link>
        </div>

        {/* Waveform decoration */}
        <div style={{
          display: "flex", alignItems: "center", gap: "4px",
          marginTop: "64px", opacity: 0.3,
        }}>
          {[4,8,14,20,28,34,28,20,34,20,14,8,4,8,14,20,14,8,4].map((h, i) => (
            <div key={i} style={{
              width: "3px", height: `${h}px`, borderRadius: "2px",
              background: "linear-gradient(to top, #7c3aed, #c084fc)",
              animation: `wave ${0.8 + (i % 5) * 0.15}s ease-in-out infinite alternate`,
            }} />
          ))}
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section style={{
        position: "relative", zIndex: 1,
        padding: "80px 24px 120px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(28px, 4vw, 42px)",
          fontWeight: 800,
          textAlign: "center",
          marginBottom: "16px",
        }}>
          Everything your voice reveals
        </h2>
        <p style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.45)",
          fontSize: "16px",
          marginBottom: "56px",
        }}>
          Four powerful analysis dimensions, running in parallel
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px",
              padding: "32px 28px",
              backdropFilter: "blur(20px)",
              transition: "transform 0.2s, border-color 0.2s",
              cursor: "default",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLDivElement).style.borderColor = `${f.color}44`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
              }}
            >
              <div style={{
                width: "52px", height: "52px", borderRadius: "14px",
                background: `${f.color}22`,
                border: `1px solid ${f.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "24px", marginBottom: "20px",
              }}>
                {f.icon}
              </div>
              <h3 style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700, fontSize: "18px",
                marginBottom: "10px", color: "white",
              }}>
                {f.title}
              </h3>
              <p style={{
                fontSize: "14px", color: "rgba(255,255,255,0.5)",
                lineHeight: 1.7, margin: 0,
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Animations */}
      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(40px, 30px) scale(1.1); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(-30px, 40px) scale(0.95); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(20px, -30px) scale(1.05); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(124,58,237,0.6), 0 0 80px rgba(124,58,237,0.3); }
          50%       { box-shadow: 0 0 60px rgba(124,58,237,0.8), 0 0 120px rgba(124,58,237,0.4); }
        }
        @keyframes wave {
          from { transform: scaleY(1); }
          to   { transform: scaleY(1.8); }
        }
      `}</style>
    </div>
  );
}