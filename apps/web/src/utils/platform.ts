import {
  Globe,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
  MessageCircle,
  AtSign,
  Cloud,
  Pin,
  type LucideIcon,
} from 'lucide-react';

export interface PlatformMeta {
  label: string;
  icon: LucideIcon;
  /** Solid chip background (works on top of images) */
  chip: string;
  /** Two-stop gradient used for generated covers */
  gradient: [string, string];
  /** Typical media shape, used to size cards before the image loads */
  aspect: 'portrait' | 'landscape';
}

const PLATFORMS: Record<string, PlatformMeta> = {
  instagram: { label: 'Instagram', icon: Instagram, chip: 'bg-gradient-to-r from-[#7c3aed] via-[#db2777] to-[#f59e0b] text-white', gradient: ['#7c3aed', '#db2777'], aspect: 'portrait' },
  tiktok: { label: 'TikTok', icon: Music2, chip: 'bg-black text-white', gradient: ['#0f172a', '#14b8a6'], aspect: 'portrait' },
  x: { label: 'X', icon: Twitter, chip: 'bg-black text-white', gradient: ['#111827', '#475569'], aspect: 'landscape' },
  youtube: { label: 'YouTube', icon: Youtube, chip: 'bg-[#ff0033] text-white', gradient: ['#7f1d1d', '#ef4444'], aspect: 'landscape' },
  reddit: { label: 'Reddit', icon: MessageCircle, chip: 'bg-[#ff4500] text-white', gradient: ['#7c2d12', '#f97316'], aspect: 'landscape' },
  pinterest: { label: 'Pinterest', icon: Pin, chip: 'bg-[#e60023] text-white', gradient: ['#881337', '#f43f5e'], aspect: 'portrait' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, chip: 'bg-[#0a66c2] text-white', gradient: ['#0c4a6e', '#0ea5e9'], aspect: 'landscape' },
  threads: { label: 'Threads', icon: AtSign, chip: 'bg-black text-white', gradient: ['#18181b', '#52525b'], aspect: 'landscape' },
  bluesky: { label: 'Bluesky', icon: Cloud, chip: 'bg-[#0085ff] text-white', gradient: ['#1e3a8a', '#38bdf8'], aspect: 'landscape' },
  generic: { label: 'Web', icon: Globe, chip: 'bg-white/90 text-black', gradient: ['#312e81', '#7c3aed'], aspect: 'landscape' },
};

export function platformMeta(platform: string | null | undefined): PlatformMeta {
  return PLATFORMS[platform ?? 'generic'] ?? PLATFORMS.generic;
}

export function hostnameOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Stable 0-359 hue from any string, so a save keeps the same cover colours. */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}
