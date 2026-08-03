"use client";

/**
 * Speech: browser APIs, not Python (spec §12).
 *
 * Web Speech + SpeechSynthesis need no server, cost nothing, work on a phone,
 * and keep the app deployable anywhere. faster-whisper would be more accurate
 * but means a Python sidecar — no Vercel, no phone. Pay that cost only against
 * measured evidence.
 */

let current: HTMLAudioElement | null = null;

export function playAudio(url: string | null, fallbackText?: string) {
  if (url) {
    current?.pause();
    const a = new Audio(url);
    current = a;
    void a.play().catch(() => fallbackText && speak(fallbackText));
    return;
  }
  if (fallbackText) speak(fallbackText);
}

export function speak(text: string, rate = 0.9) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  u.rate = rate;
  const de = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("de"));
  if (de) u.voice = de;
  window.speechSynthesis.speak(u);
}

export function playAt(url: string | null, text: string, rate: number) {
  if (url) {
    current?.pause();
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    void a.play().catch(() => speak(text, rate));
  } else {
    speak(text, rate);
  }
}

// ---------------------------------------------------------------- recognition

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function Recognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported() {
  return Recognition() !== null;
}

/** Listen once and resolve with what the recogniser heard, in German. */
export function listenOnce(timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const R = Recognition();
    if (!R) return reject(new Error("Speech recognition not supported in this browser"));
    const rec = new R();
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      rec.stop();
      reject(new Error("timeout"));
    }, timeoutMs);

    rec.onresult = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(e.error));
    };
    rec.onend = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("no-speech"));
    };
    rec.start();
  });
}

/**
 * Compare what was said to the target, word by word.
 *
 * This is the honest pronunciation signal (spec §18): we report which WORDS the
 * recogniser misheard, because that is what the data actually supports. No
 * invented percentage, no fabricated phoneme scores.
 */
export function diffWords(target: string, heard: string) {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[.,!?;:]/g, "").replace(/\s+/g, " ").trim();
  const t = norm(target).split(" ");
  const h = new Set(norm(heard).split(" "));
  return t.map((w) => ({ word: w, ok: h.has(w) }));
}
