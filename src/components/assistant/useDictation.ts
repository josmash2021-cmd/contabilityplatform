// Speaking instead of typing in the Asistente (the browser turns the voice into text).
import { useEffect, useRef, useState } from "react";

// ── Dictation ──
type RecResult = { isFinal: boolean; 0: { transcript: string } };
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
const recognition = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Speaking instead of typing: the browser turns the voice into text (Chrome, Edge, Safari; not Firefox).
 * `onText` gets what's settled so far and what's still being heard; `onError` the browser's reason.
 */
export function useDictation(lang: string, onText: (settled: string, hearing: string) => void, onError: (code: string) => void) {
  const [supported] = useState(() => !!recognition());
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef({ onText, onError });
  useEffect(() => { cb.current = { onText, onError }; });
  useEffect(() => () => rec.current?.abort(), []);
  const start = () => {
    const Ctor = recognition();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    let settled = "";
    r.onresult = (e) => {
      let hearing = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) settled += res[0].transcript;
        else hearing += res[0].transcript;
      }
      cb.current.onText(settled, hearing);
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") cb.current.onError(e.error); };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    try { r.start(); setListening(true); } catch { rec.current = null; setListening(false); }
  };
  const stop = () => rec.current?.stop();
  return { supported, listening, start, stop };
}
