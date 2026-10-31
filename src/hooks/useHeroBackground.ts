import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "../utils/supabase/info";

/** Mirrors HeroSection.tsx: reduced-motion detection, video gating and the delayed produce-clip fetch. */
export function useHeroBackground(): { reduceMotion: boolean; backgroundVideos: string[] } {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [allowVideo, setAllowVideo] = useState(false);
  const [backgroundVideos, setBackgroundVideos] = useState<string[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    const conn = (navigator as any).connection;
    const eff = conn?.effectiveType || "";
    const slow = conn?.saveData === true || /(^|-)2g$/.test(eff) || (typeof conn?.downlink === "number" && conn.downlink < 1.5);
    let videoTimer: ReturnType<typeof setTimeout> | undefined;
    if (!reduce && !conn?.saveData && !(window.matchMedia("(max-width: 600px)").matches && slow) && !/(^|-)2g$/.test(eff)) {
      videoTimer = setTimeout(() => setAllowVideo(true), 600);
    }
    return () => { if (videoTimer) clearTimeout(videoTimer); };
  }, []);

  useEffect(() => {
    if (!allowVideo) return;
    let cancelled = false;
    (async () => {
      try {
        const base = `https://${projectId}.supabase.co/rest/v1`;
        const headers = { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` };
        const res = await fetch(
          `${base}/catalog_ingredients?select=video_url&video_url=not.is.null&video_url=neq.&or=(category.ilike.*fruit*,category.ilike.*veget*)&limit=80`,
          { headers },
        );
        const rows = res.ok ? await res.json() : [];
        const all = rows.map((r: any) => r.video_url).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 10);
        if (!cancelled && all.length > 0) setBackgroundVideos(all);
      } catch {
        /* poster remains */
      }
    })();
    return () => { cancelled = true; };
  }, [allowVideo]);

  return { reduceMotion, backgroundVideos };
}
