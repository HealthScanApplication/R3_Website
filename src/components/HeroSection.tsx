"use client";

import { useState, useEffect } from "react";
import { UniversalWaitlist } from "./UniversalWaitlist";
import { ReferralInvitationBanner } from "./ReferralInvitationBanner";
import { FlutedGlassBackground } from "./FlutedGlassBackground";
import { projectId, publicAnonKey } from "../utils/supabase/info";
import { APP_STORE_URL } from "../config/appLinks";
import { GOAL_WORDS } from "../config/goalWords";
import heroPoster from "../assets/5f38caf68dd6b8af22362056b70854ea4cf4b933.png";
import {
  ed,
  GRO,
  DISPLAY,
  coverStyle,
  deckStyle,
  folioStyle,
} from "../config/editorialTheme";

// Stylish Apple glyph for the "Try" CTA
function AppleMark({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" style={{ marginBottom: -2 }}>
      <path d="M17.05 12.54c-.02-2.06 1.68-3.05 1.76-3.1-.96-1.4-2.46-1.6-3-1.62-1.27-.13-2.49.75-3.14.75-.65 0-1.65-.73-2.71-.71-1.39.02-2.68.81-3.4 2.06-1.45 2.52-.37 6.25 1.04 8.3.69 1 1.51 2.13 2.58 2.09 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.71.65 1.12-.02 1.83-1.02 2.51-2.03.79-1.16 1.12-2.29 1.13-2.35-.02-.01-2.17-.83-2.19-3.3zM15 5.88c.57-.69.96-1.65.85-2.61-.83.03-1.83.55-2.42 1.24-.53.61-.99 1.59-.87 2.53.93.07 1.87-.47 2.44-1.16z" />
    </svg>
  );
}

// Strava brandmark (in the ROUTINE³ terracotta accent) for the integrations strip.
function StravaMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#B05A36" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.172" />
    </svg>
  );
}

// Ōura ring glyph (a band) for the integrations strip.
function OuraRing({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="#B05A36" strokeWidth="3.4" />
    </svg>
  );
}

// Apple Health heart (in the ROUTINE³ terracotta accent) for the integrations strip.
function AppleHealthMark({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#B05A36" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

const syncName: React.CSSProperties = { fontFamily: GRO, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: ed.ink };
const syncDivider: React.CSSProperties = { width: 1, height: 13, background: ed.hair };

interface HeroSectionProps {
  hasReferral?: boolean;
  isActive?: boolean;
  referralCode?: string | null;
}

const overline: React.CSSProperties = {
  fontFamily: GRO,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: ed.inkSoft,
  margin: 0,
};

export function HeroSection({ hasReferral, isActive, referralCode }: HeroSectionProps = {}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [allowVideo, setAllowVideo] = useState(false);
  const [backgroundVideos, setBackgroundVideos] = useState<string[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [posterLoaded, setPosterLoaded] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    const narrowMq = window.matchMedia("(max-width: 768px)");
    const applyNarrow = () => setIsNarrow(narrowMq.matches);
    applyNarrow();
    narrowMq.addEventListener?.("change", applyNarrow);
    const conn = (navigator as any).connection;
    const eff = conn?.effectiveType || "";
    const slow = conn?.saveData === true || /(^|-)2g$/.test(eff) || (typeof conn?.downlink === "number" && conn.downlink < 1.5);
    let videoTimer: ReturnType<typeof setTimeout> | undefined;
    if (!reduce && !conn?.saveData && !(window.matchMedia("(max-width: 600px)").matches && slow) && !/(^|-)2g$/.test(eff)) {
      // Fetch the produce clips shortly after paint — they feed the fluted-glass shader.
      videoTimer = setTimeout(() => setAllowVideo(true), 600);
    }
    return () => {
      narrowMq.removeEventListener?.("change", applyNarrow);
      if (videoTimer) clearTimeout(videoTimer);
    };
  }, []);

  useEffect(() => {
    if (!allowVideo) return;
    const fetchVideos = async () => {
      try {
        const base = `https://${projectId}.supabase.co/rest/v1`;
        const headers = { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` };
        // Only fruit & vegetable footage in the hero — fresh produce, not nuts/grains/animal.
        const res = await fetch(
          `${base}/catalog_ingredients?select=video_url&video_url=not.is.null&video_url=neq.&or=(category.ilike.*fruit*,category.ilike.*veget*)&limit=80`,
          { headers },
        );
        const rows = res.ok ? await res.json() : [];
        const all = rows.map((r: any) => r.video_url).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 10);
        if (all.length > 0) setBackgroundVideos(all);
      } catch {
        /* poster remains */
      }
    };
    fetchVideos();
  }, [allowVideo]);

  useEffect(() => {
    const t = setInterval(() => {
      setWordVisible(false);
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % GOAL_WORDS.length);
        setWordVisible(true);
      }, 320);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      id="hero-section"
      style={{ position: "relative", minHeight: "100svh", background: ed.paper, overflow: "hidden" }}
    >
      {/* Cover stock — the hero image rendered through a WebGL fluted-glass shader
          (a port of Function Health's "fluting" hero). The plain <img> sits behind
          as a fallback for no-WebGL / reduced-motion. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: ed.paperAlt }} aria-hidden="true">
        <img
          src={heroPoster}
          alt=""
          {...({ fetchpriority: "high" } as any)}
          decoding="async"
          ref={(el) => { if (el?.complete) setPosterLoaded(true); }}
          onLoad={() => setPosterLoaded(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "saturate(0.95) contrast(1.03)", opacity: posterLoaded ? 1 : 0, transition: "opacity 1.1s ease" }}
        />
        {!reduceMotion && (
          <FlutedGlassBackground videos={backgroundVideos} poster={heroPoster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
        )}

        {/* Warm tint — very subtle soft-light warmth so the fluted video sits in
            the editorial palette without recoloring the produce. */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, rgba(197,106,58,0.16) 0%, rgba(224,169,106,0.06) 55%, rgba(176,90,54,0.14) 100%)", mixBlendMode: "soft-light" }} />

        {/* Paper tint — lighter up top so the fluted glass reads; heavier toward
            the lower-left where the headline sits, so the dark type stays legible */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(158deg, rgba(250,245,236,0.30) 0%, rgba(250,245,236,0.40) 40%, rgba(250,245,236,0.72) 78%, rgba(250,245,236,0.88) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(250,245,236,0.55) 0%, rgba(250,245,236,0.12) 42%, rgba(250,245,236,0) 70%)" }} />
        {/* warm vignette for depth — darker toward the edges/corners */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(110% 100% at 50% 42%, rgba(40,24,14,0) 46%, rgba(40,24,14,0.14) 78%, rgba(30,17,9,0.34) 100%)" }} />
        {/* terracotta pool at the bottom-left — grounds the white headline */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 70% at 0% 100%, rgba(176,90,54,0.72) 0%, rgba(176,90,54,0.38) 40%, rgba(176,90,54,0) 74%)" }} />
        {/* fine grain */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.05, mixBlendMode: "multiply", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "180px 180px" }} />
      </div>

      {/* Cover content on the grid */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          maxWidth: 1440,
          margin: "0 auto",
          paddingLeft: "clamp(20px, 5vw, 72px)",
          paddingRight: "clamp(20px, 5vw, 72px)",
          paddingTop: "clamp(88px, 9vh, 104px)",
          paddingBottom: "clamp(32px, 5vh, 56px)",
        }}
      >
        {/* Top: issue line + folio — inset to line up under the header logo/nav/buttons */}
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${ed.hair}`, paddingTop: 14, paddingLeft: "clamp(16px, 2vw, 28px)", paddingRight: "clamp(16px, 2vw, 28px)" }}>
          <p style={overline}>Set · Track · Adapt</p>
          <p style={{ ...overline, position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)", opacity: 0.5 }}>Health · Beauty · Fitness</p>
          <p style={folioStyle}>Out now on iOS · Android coming soon</p>
        </div>

        <div style={{ flex: 1, minHeight: "clamp(40px, 8vh, 120px)" }} />

        {/* Cover line + deck, lower-left */}
        <div style={{ width: "100%" }}>
          <h1 style={{ ...coverStyle, color: "#FFFFFF", textShadow: "0 4px 24px rgba(0,0,0,0.38)" }}>
            <span style={{ display: "block" }}>Build a routine</span>
            <span style={{ display: "block" }}>
              for{" "}
              <span
                style={{
                  fontStyle: "italic",
                  color: ed.ink,
                  textShadow: "none",
                  transition: reduceMotion ? undefined : "opacity 320ms ease",
                  opacity: wordVisible ? 1 : 0,
                }}
              >
                {GOAL_WORDS[wordIndex]}
              </span>
            </span>
          </h1>
          <p style={{ ...deckStyle, color: ed.ink, marginTop: "clamp(20px, 3vw, 36px)", maxWidth: "34ch" }}>
            Daily to-dos, activity tracking, and a food scanner — set for whatever you want to achieve.
          </p>

          {/* Integrations — syncs with Apple Health, Ōura Ring & Strava */}
          <div style={{ marginTop: "clamp(22px, 3vw, 34px)", display: "flex", alignItems: "center", gap: "10px 16px", flexWrap: "wrap" }}>
            <span style={{ ...overline, color: ed.inkSoft }}>Syncs</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <AppleHealthMark size={15} />
              <span style={syncName}>Apple Health</span>
            </span>
            <span aria-hidden="true" style={syncDivider} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <OuraRing size={14} />
              <span style={syncName}>Ōura Ring</span>
            </span>
            <span aria-hidden="true" style={syncDivider} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <StravaMark size={15} />
              <span style={syncName}>Strava</span>
            </span>
          </div>
        </div>

        {/* Bottom: waitlist (left) + cover credit (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 28, marginTop: "clamp(44px, 7vh, 88px)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <a
                href={APP_STORE_URL || undefined}
                target={APP_STORE_URL ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="ed-cta"
                style={{ height: 42, boxSizing: "border-box", padding: "0 16px", background: "#FFFFFF", color: "#16140F", border: "1px solid #FFFFFF", borderRadius: 2, fontFamily: '"Archivo", "Inter", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", boxShadow: "none" }}
              >
                <AppleMark />Try&nbsp;→
              </a>
              <span style={{ fontFamily: GRO, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 11, color: "rgba(255,255,255,0.75)" }}>or</span>
              <UniversalWaitlist variant="editorial" submitLabel="Subscribe →" placeholder="you@email.com" />
            </div>
          </div>
        </div>
      </div>

      <ReferralInvitationBanner hasReferral={hasReferral || false} isActive={isActive || false} referralCode={referralCode || null} />
    </section>
  );
}
