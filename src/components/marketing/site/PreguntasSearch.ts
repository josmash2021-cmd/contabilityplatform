// Search for the /preguntas page: accent- and case-insensitive, every word must match.
// "camara" finds "cámara", "w2" finds "W-2" through the item's extra keywords.
import type { PreguntasCategory, PreguntasItem } from "@/i18n/copy/site/preguntas";

/** Above this many matches, answers stay closed (opening them all would be a wall of text). */
export const AUTO_OPEN_MAX = 8;

/** Lowercase without accents, plus where each folded character came from in the original text. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    // The copy uses non-breaking hyphens ("W‑2"); people type a plain one.
    const ch = text[i] === "‑" ? "-" : text[i];
    const f = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const piece = f.length > 0 ? f : ch;
    for (let j = 0; j < piece.length; j++) {
      folded += piece[j];
      map.push(i);
    }
  }
  return { folded, map };
}

export function fold(text: string): string {
  return foldWithMap(text).folded;
}

/** The words of a query, folded; punctuation like ¿? « » is ignored. */
export function searchTerms(query: string): string[] {
  return fold(query)
    .replace(/[¿?¡!.,;:«»"“”'()[\]{}]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function itemText(item: PreguntasItem, categoryTitle: string): string {
  return [item.q, ...item.a.flat(), item.k ?? "", categoryTitle].join(" ");
}

export type PreguntasMatch = { item: PreguntasItem; id: string };
export type PreguntasResult = { category: PreguntasCategory; matches: PreguntasMatch[] };

/** Every category with the items that match all the terms (all items when there are no terms). */
export function filterCategories(categories: PreguntasCategory[], terms: string[]): PreguntasResult[] {
  return categories
    .map((category) => ({
      category,
      matches: category.items
        .map((item, i) => ({ item, id: `${category.id}-${i}` }))
        .filter(({ item }) => {
          if (terms.length === 0) return true;
          const hay = fold(itemText(item, category.title));
          return terms.every((t) => hay.includes(t));
        }),
    }))
    .filter((r) => r.matches.length > 0);
}

export type PreguntasSegment = { text: string; hit: boolean };

/** Splits text into plain and matching pieces, to highlight the search terms. */
export function highlightSegments(text: string, terms: string[]): PreguntasSegment[] {
  if (terms.length === 0) return [{ text, hit: false }];
  const { folded, map } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const t of terms) {
    let from = folded.indexOf(t);
    while (from !== -1) {
      ranges.push([map[from], map[from + t.length - 1] + 1]);
      from = folded.indexOf(t, from + t.length);
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: PreguntasSegment[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: text.slice(at, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}
