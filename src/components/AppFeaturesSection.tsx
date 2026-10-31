import React from "react";
// The real app screenshots are the optimised files in config/homeImages (need = Vitamin A, risk = Phthalate, meal = Bulgar salad).
import { OptimizedImage } from "./OptimizedImage";
import { APP_SHOTS, type HomeImage } from "../config/homeImages";
import { ed, GRO, DISPLAY, kickerStyle, folioStyle, h2Style, deckStyle } from "../config/editorialTheme";
import { Reveal } from "./motion/Reveal";
import { ScannerMockup } from "./mockups/ScannerMockup";
import { PhoneFrame } from "./mockups/PhoneFrame";

interface Bullet {
  title: string;
  desc: string;
}
interface Feature {
  no: string;
  label: string;
  titleLead: string;
  titleEm: string;
  body: string;
  bullets: Bullet[];
  image?: HomeImage;
  alt?: string;
  fig: string;
}

const FEATURES: Feature[] = [
  {
    no: "01",
    label: "Smart scanning",
    titleLead: "Point, shoot, ",
    titleEm: "know",
    body: "Aim your camera at any meal or packaged product. ROUTINE³ reads it in seconds — a health score, the nutrients that matter, and the ingredients worth watching — then logs it against your goal.",
    bullets: [
      { title: "Visual food recognition", desc: "AI identifies the dish, ingredients and portions straight from a photo." },
      { title: "Health-score rating", desc: "An instant 0–100 score with the why behind it, tuned to your goal." },
      { title: "Ingredient detection", desc: "Sees the specific ingredients inside and what each one does." },
    ],
    fig: "Fig. 01 — Live scan & result",
  },
  {
    no: "02",
    label: "Nutrition intelligence",
    titleLead: "The nutrients you're ",
    titleEm: "actually getting",
    body: "ROUTINE³ reads meals and products down to the ingredient, tracks what you take in over time, and surfaces where you run short — so your routine fills the gaps instead of guessing.",
    bullets: [
      { title: "Ingredient-level tracking", desc: "See which ingredients supply which nutrients, and how much." },
      { title: "Intake over time", desc: "Spot patterns and deficiencies across days and weeks." },
      { title: "Smart food pairing", desc: "Suggestions that help your body absorb more of what it needs." },
    ],
    image: APP_SHOTS.need,
    alt: "ROUTINE³ nutrition analysis screen",
    fig: "Fig. 02 — Nutrient breakdown",
  },
  {
    no: "03",
    label: "Things to watch",
    titleLead: "A quiet eye on the ",
    titleEm: "fine print",
    body: "Additives, certain preservatives, heavy metals — flagged from public food-safety data. See what to keep an eye on, how it trends over time, and make calmer choices for your routine.",
    bullets: [
      { title: "Ingredient-level detection", desc: "Identify exactly which ingredients carry the flag." },
      { title: "Exposure over time", desc: "Track cumulative exposure rather than one-off scares." },
      { title: "Your personal watch-list", desc: "Informational, built from your preferences and what you scan." },
    ],
    image: APP_SHOTS.risk,
    alt: "ROUTINE³ risk detection screen",
    fig: "Fig. 03 — Watch-list",
  },
  {
    no: "04",
    label: "Recipe engine",
    titleLead: "Meals the whole ",
    titleEm: "table will eat",
    body: "Build plans around everyone at once. ROUTINE³ weighs each person's needs, preferences and goals, then suggests recipes that satisfy the table while keeping nutrition high and additives low.",
    bullets: [
      { title: "Family profiles", desc: "Needs, allergies and preferences tracked per person." },
      { title: "Smart recipe matching", desc: "Dishes that meet everyone's nutrition and taste at once." },
      { title: "Personalised plans", desc: "Weekly planning tuned to your household's goals." },
    ],
    image: APP_SHOTS.meal,
    alt: "ROUTINE³ recipe analysis",
    fig: "Fig. 04 — Recipe match",
  },
];

function BulletList({ bullets }: { bullets: Bullet[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 26 }}>
      {bullets.map((b) => (
        <div key={b.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ width: 14, height: 1, background: ed.accent, marginTop: 11, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: GRO, fontSize: 15, fontWeight: 600, color: ed.ink, marginBottom: 3 }}>{b.title}</div>
            <div style={{ fontFamily: GRO, fontSize: 14.5, lineHeight: 1.55, color: ed.inkSoft }}>{b.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NumberKicker({ no, label }: { no: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: "2.2rem", fontWeight: 380, color: ed.accent, lineHeight: 0.9, letterSpacing: "-0.02em" }}>{no}</span>
      <span style={{ ...kickerStyle, color: ed.inkSoft }}>{label}</span>
    </div>
  );
}

function Plate({ image, alt, fig }: { image: HomeImage; alt: string; fig: string }) {
  // Real app screenshot inside the same phone frame as the built mockups.
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <PhoneFrame notch={false} screenBg="#FFFFFF">
        <OptimizedImage
          src={image.src}
          srcSet={image.srcSet}
          sizes="318px"
          alt={alt}
          placeholderSrc={image.lqip}
          placeholderColor={image.color}
          style={{ position: "absolute", inset: 0 }}
        />
      </PhoneFrame>
      <figcaption style={{ fontFamily: GRO, fontSize: 11, fontStyle: "italic", color: ed.inkSoft, marginTop: 18, letterSpacing: "0.02em", textAlign: "center" }}>{fig}</figcaption>
    </figure>
  );
}

function ScanFigure() {
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <ScannerMockup />
      <figcaption style={{ fontFamily: GRO, fontSize: 11, fontStyle: "italic", color: ed.inkSoft, marginTop: 18, letterSpacing: "0.02em", textAlign: "center" }}>
        Fig. 01 — Point &amp; scan
      </figcaption>
    </figure>
  );
}

export function AppFeaturesSection() {
  return (
    <section id="features" style={{ background: ed.paper, width: "100%" }}>
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          paddingLeft: "clamp(20px, 5vw, 72px)",
          paddingRight: "clamp(20px, 5vw, 72px)",
          paddingTop: "clamp(80px, 11vw, 168px)",
          paddingBottom: "clamp(80px, 11vw, 168px)",
        }}
      >
        {/* Section header */}
        <div style={{ borderTop: `1px solid ${ed.hair}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <p style={kickerStyle}>The Scanner</p>
          <p style={folioStyle}>04 / 08</p>
        </div>
        <div style={{ marginTop: "clamp(28px, 4vw, 52px)", maxWidth: 920 }}>
          <Reveal>
            <h2 style={h2Style}>
              The camera that <span style={{ fontStyle: "italic", color: ed.accent }}>reads your food</span>.
            </h2>
          </Reveal>
          <Reveal as="p" delay={0.1} style={{ ...deckStyle, marginTop: 22, maxWidth: "44ch" }}>
            Every routine runs on what you actually eat. Aim the camera; ROUTINE³ checks it against your goal and logs it in seconds.
          </Reveal>
        </div>

        {/* Feature rows */}
        {FEATURES.map((f, i) => {
          const figureFirst = i % 2 === 0; // 01 & 03 lead with the figure
          const figure = f.image ? <Plate image={f.image} alt={f.alt!} fig={f.fig} /> : <ScanFigure />;
          const copy = (
            <Reveal>
              <NumberKicker no={f.no} label={f.label} />
              <h3 style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: "clamp(1.7rem, 3vw, 2.5rem)", lineHeight: 1.08, letterSpacing: "-0.02em", color: ed.ink, margin: 0 }}>
                {f.titleLead}
                <span style={{ fontStyle: "italic" }}>{f.titleEm}</span>
              </h3>
              <p style={{ fontFamily: GRO, fontSize: 17, lineHeight: 1.6, color: ed.ink, marginTop: 18, maxWidth: "46ch" }}>{f.body}</p>
              <BulletList bullets={f.bullets} />
            </Reveal>
          );

          return (
            <div
              key={f.no}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "48px 64px",
                marginTop: i === 0 ? "clamp(56px, 8vw, 104px)" : "clamp(64px, 9vw, 120px)",
                paddingTop: i === 0 ? 0 : "clamp(48px, 6vw, 80px)",
                borderTop: i === 0 ? "none" : `1px solid ${ed.hair}`,
              }}
            >
              <div style={{ flex: "1 1 340px", minWidth: 280, order: figureFirst ? 0 : 1, display: "flex", justifyContent: "center" }}>{figure}</div>
              <div style={{ flex: "1 1 380px", minWidth: 300, order: figureFirst ? 1 : 0 }}>{copy}</div>
            </div>
          );
        })}

        {/* Disclaimer colophon */}
        <div style={{ maxWidth: 680, marginTop: "clamp(64px, 8vw, 110px)", paddingTop: 24, borderTop: `1px solid ${ed.hair}` }}>
          <p style={{ fontFamily: GRO, fontSize: 12, lineHeight: 1.6, color: ed.inkSoft, margin: 0 }}>
            ROUTINE³ provides informational estimates based on public food and nutrition data to help you make everyday choices. It is not a medical device and does not diagnose, treat, cure or prevent any disease. Always consult a qualified healthcare professional for medical advice.
          </p>
        </div>
      </div>
    </section>
  );
}
