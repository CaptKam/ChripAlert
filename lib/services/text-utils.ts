export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(normalize(a).split(' '));
  const B = new Set(normalize(b).split(' '));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return inter / uni;
}
