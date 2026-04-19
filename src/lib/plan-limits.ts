export type Tier = "free" | "pro" | "premium";

export const PLAN_LIMITS: Record<Tier, {
  pages: number;
  acts: number;
  episodes: number;
  words: number;
  dailyGenerations: number; // Infinity for unlimited
  allowSeries: boolean;
  label: string;
}> = {
  free:    { pages: 12,  acts: 2,  episodes: 2,  words: 6000,  dailyGenerations: 5,        allowSeries: false, label: "Free" },
  pro:     { pages: 60,  acts: 10, episodes: 6,  words: 30000, dailyGenerations: 20,       allowSeries: true,  label: "Pro" },
  premium: { pages: 150, acts: 50, episodes: 12, words: 50000, dailyGenerations: Infinity, allowSeries: true,  label: "Premium" },
};

// Rough industry standard: 1 screenplay page ≈ 230 words
export const WORDS_PER_PAGE = 230;
export const wordsToPages = (words: number) => Math.max(0, Math.round((words / WORDS_PER_PAGE) * 10) / 10);
export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

// Word-count options offered to users, capped per tier
export const WORD_OPTIONS = [1500, 3000, 6000, 10000, 15000, 20000, 30000, 40000, 50000];
export const wordOptionsForTier = (tier: Tier) => {
  const max = PLAN_LIMITS[tier].words;
  const opts = WORD_OPTIONS.filter((w) => w <= max);
  if (!opts.includes(max)) opts.push(max);
  return opts;
};
