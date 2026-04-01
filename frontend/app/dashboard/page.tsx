"use client";

import { useRef, useCallback } from "react";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import VoiceAnalyzer from "@/components/VoiceAnalyzer";
import SessionLog from "@/components/SessionLog";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user, refreshProfile } = useAuth();
  // Track keys so we never double-save the same result
  const savedRef = useRef<Set<string>>(new Set());

  const handleResult = useCallback(async (result: {
    gender?: string;
    age?: string;
    emotion?: string;
    noise?: string;
    rawAnalysis?: any;
    audioUrl?: string;
    audioDurationSec?: number;
    audioFileName?: string;
    audioBlob?: Blob;
    transcript?: { text: string; start: number; end: number; emotion?: string; confidence?: number }[];
  }) => {
    if (!user) return;

    const { gender = "", age = "", emotion = "", noise = "" } = result;

    // Allow saving if ANY data is present (including noise-only results)
    if (!gender && !age && !emotion && !noise) {
      console.warn("[session-save] Skipped: no data to save", result);
      return;
    }

    // Deduplicate
    const key = `${gender}|${age}|${emotion}|${noise}|${Date.now()}`;
    if (savedRef.current.has(key)) return;
    savedRef.current.add(key);

    // ── Truncate rawAnalysis to stay under Firestore 1MB limit ────────
    let safeRawAnalysis = result.rawAnalysis ?? null;
    if (safeRawAnalysis) {
      try {
        const jsonSize = JSON.stringify(safeRawAnalysis).length;
        if (jsonSize > 500000) {
          const { model_comparison, ...rest } = safeRawAnalysis;
          safeRawAnalysis = rest;
          console.warn("[session-save] Stripped model_comparison (doc too large:", jsonSize, "bytes)");
        }
      } catch { /* ignore */ }
    }

    // ── STEP 1: Write session to Firestore IMMEDIATELY ────────────────
    // This ensures the session appears in the history list right away,
    // even before the (slow) audio upload finishes.
    let sessionDocRef: any = null;
    try {
      sessionDocRef = await addDoc(collection(db, "users", user.uid, "sessions"), {
        gender,
        age,
        emotion,
        noise,
        createdAt:       serverTimestamp(),
        audioUrl:        null,   // will be updated after upload
        storagePath:     null,
        audioDurationSec: result.audioDurationSec ?? null,
        audioFileName:   result.audioFileName ?? null,
        rawAnalysis:     safeRawAnalysis,
        transcript:      result.transcript ?? null,
      });
      console.log("[session-save] Session saved immediately:", sessionDocRef.id);
    } catch (err) {
      console.error("[session-save] Failed to save session:", err);
      return; // bail out — no point uploading if we can't save
    }

    // ── STEP 2: Upload audio in background, then update the doc ───────
    if (result.audioBlob && sessionDocRef) {
      (async () => {
        try {
          const ext  = result.audioFileName?.split(".").pop() ?? "webm";
          const path = `users/${user.uid}/audio/${Date.now()}.${ext}`;
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, result.audioBlob!, {
            contentType: result.audioBlob!.type || "audio/webm",
          });
          const downloadUrl = await getDownloadURL(sRef);
          // Update the already-saved session doc with the audio URL
          const { updateDoc: updateDocFn } = await import("firebase/firestore");
          await updateDocFn(sessionDocRef, {
            audioUrl:    downloadUrl,
            storagePath: path,
          });
          console.log("[session-save] Audio uploaded & doc updated:", path);
        } catch (uploadErr) {
          console.warn("[session-save] Audio upload failed (non-fatal):", uploadErr);
        }
      })();
    }
  }, [user]);

  // ── Save detected gender/age to user profile ───────────────────────
  const handleSaveProfile = useCallback(async (detectedGender: string, detectedAge: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        detectedGender,
        detectedAge,
        lastLoginAt: serverTimestamp(),
      });
      await refreshProfile();
      console.log("[profile-save] Voice profile saved:", detectedGender, detectedAge);
    } catch (err) {
      console.error("[profile-save] Failed to save voice profile:", err);
    }
  }, [user, refreshProfile]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "'Inter', sans-serif" }}>
      <Navbar />
      <div style={{ paddingTop: "64px" }}>
        {/* Voice Analyzer — passes full result + blob back */}
        <VoiceAnalyzer onResult={handleResult} onSaveProfile={handleSaveProfile} />

        {/* Session history */}
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 100px" }}>
          <SessionLog />
        </div>
      </div>
    </div>
  );
}