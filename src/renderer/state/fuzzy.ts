export interface FuzzyMatch {
  score: number;
  /** Indices into the original text that matched, for highlighting. */
  indices: number[];
}

const isWordChar = (c: string) => /[a-z0-9]/i.test(c);

/** Subsequence matcher that favours consecutive runs and word starts. Returns null when `query` doesn't match. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  let best: FuzzyMatch | null = null;

  for (let start = t.indexOf(q[0]!); start !== -1; start = t.indexOf(q[0]!, start + 1)) {
    const indices: number[] = [];
    let score = 0;
    let pos = start;
    let prev = -2;
    let ok = true;
    for (const ch of q) {
      const at = t.indexOf(ch, pos);
      if (at === -1) {
        ok = false;
        break;
      }
      indices.push(at);
      score += 10;
      if (at === prev + 1) score += 16;
      if (at === 0 || !isWordChar(text[at - 1]!)) score += 12;
      score -= Math.min(6, at - pos); // gaps cost a little
      prev = at;
      pos = at + 1;
    }
    if (!ok) break; // later starts can only match less
    score -= start * 0.4;
    if (t.includes(q)) score += 20;
    if (!best || score > best.score) best = { score, indices };
  }
  // Reject scattered matches (e.g. "oled" inside "Toggle Developer Tools").
  return best && best.score >= q.length * 18 ? best : null;
}
