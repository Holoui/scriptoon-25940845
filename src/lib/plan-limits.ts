export type Tier = "free" | "pro" | "premium";

export const PLAN_LIMITS: Record<Tier, { pages: number; acts: number; episodes: number; allowSeries: boolean; label: string }> = {
  free:    { pages: 12,  acts: 2,  episodes: 2,  allowSeries: false, label: "Free" },
  pro:     { pages: 60,  acts: 10, episodes: 6,  allowSeries: true,  label: "Pro" },
  premium: { pages: 150, acts: 50, episodes: 12, allowSeries: true,  label: "Premium" },
};

// Rough industry standard: 1 screenplay page ≈ 230 words
export const WORDS_PER_PAGE = 230;
export const wordsToPages = (words: number) => Math.max(0, Math.round((words / WORDS_PER_PAGE) * 10) / 10);
export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
