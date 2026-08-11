"use client";

/** Speech: browser APIs, not Python (spec §12). Pay that cost only against measured evidence. */

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

/** Say something. */
export function speak(text: string, rate = 0.9, lang: "de" | "en" = "de") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const tag = lang === "en" ? "en-GB" : "de-DE";
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  u.rate = rate;
  const match = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith(lang));
  if (match) u.voice = match;
  window.speechSynthesis.speak(u);
}

/* Ask for the voice list once so it is populated by the time anything speaks. */
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
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
  /** Discards whatever it has and releases the microphone at once. */
  abort(): void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
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

/** Stop anything this module is currently playing, immediately. */
export function stopPlayback() {
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && window.speechSynthesis)
    window.speechSynthesis.cancel();
}

/**
 * The one live recogniser. Chrome allows exactly one at a time, and a session
 * that ended in an error or a timeout is still holding the microphone unless
 * it was aborted — every later start() then ends instantly. That is the whole
 * "it worked once and never again" shape of this bug.
 */
let active: SpeechRecognitionLike | null = null;

/** Listen once and resolve with what the recogniser heard, in German. */
export function listenOnce(timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const R = Recognition();
    if (!R) return reject(new Error("unsupported"));

    /*
     * Recognition needs a secure context. Over plain http from another machine
     * — http://192.168.x.x:3000 — the browser refuses with a bare "not-allowed"
     * that reads exactly like a denied permission, and no amount of checking
     * the permission settings fixes it. Say so instead of letting it look like
     * something the learner did wrong. localhost counts as secure.
     */
    if (typeof window !== "undefined" && !window.isSecureContext)
      return reject(new Error("insecure-context"));

    /*
     * The natural order in Sprechen is "vorhören" and then the microphone.
     * Starting recognition while the speaker is still going makes Chrome end
     * the session at once — the mic opens for a fraction of a second and dies.
     * Nothing stopped the playback first, so the designed flow was the broken
     * one.
     */
    stopPlayback();
    active?.abort();

    const rec = new R();
    active = rec;
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    let settled = false;
    /* One exit, so the timer, the handlers and the module-level `active` are
       always cleared together — the previous version left all three behind. */
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      if (active === rec) active = null;
      fn();
    };

    const timer = setTimeout(
      () =>
        finish(() => {
          /* abort(), not stop(): stop() asks the service to return whatever it
             has and can sit there waiting, holding the microphone open. */
          rec.abort();
          reject(new Error("timeout"));
        }),
      timeoutMs,
    );

    rec.onresult = (e) =>
      finish(() => resolve(e.results[0][0].transcript ?? ""));
    rec.onerror = (e) =>
      finish(() => {
        rec.abort();
        reject(new Error(e.error || "unknown"));
      });
    /* Only reached when `end` arrives with no result and no error before it. */
    rec.onend = () => finish(() => reject(new Error("no-speech")));

    try {
      rec.start();
    } catch {
      /* start() throws synchronously if one is already running. Without this
         the promise never settled and the button stayed disabled. */
      finish(() => reject(new Error("already-running")));
    }
  });
}

/**
 * What actually went wrong, in words that point at the fix.
 *
 * Every failure used to collapse into "Nichts gehört" unless it was a denied
 * permission — so a missing microphone, a blocked speech service and no
 * internet all read as "say it again", and saying it again never helped.
 */
export function micProblem(code: string): string {
  switch (code) {
    case "unsupported":
      return "Dieser Browser kann keine Spracherkennung. · This browser has no speech recognition — use Chrome, Edge or Safari.";
    case "insecure-context":
      return "Über http von einem anderen Rechner erlaubt der Browser kein Mikrofon. · The browser only allows the microphone on localhost or https, not over plain http from another machine.";
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofon nicht erlaubt. · Microphone blocked. Allow it for this site — and if the setting already says allowed, the block is coming from the operating system or a workplace policy rather than the browser.";
    case "audio-capture":
      return "Kein Mikrofon gefunden. · No microphone found — check that one is connected and selected as the input device.";
    case "network":
      return "Keine Verbindung. · Chrome sends the audio to Google to transcribe it, so this one exercise needs internet even though the rest of the app does not.";
    case "already-running":
      return "Die Aufnahme lief noch. · A recording was still running — try once more.";
    case "aborted":
      return "Abgebrochen. · The recording was interrupted before it finished.";
    case "timeout":
      return "Nichts gehört. · Nothing heard for eight seconds — tap and speak straight away.";
    default:
      return "Nichts gehört. · Nothing was recognised. Try again?";
  }
}

/**
 * Compare what was said to the target, word by word.
 *
 * Matching is case- and punctuation-insensitive, because a recogniser's idea
 * of either means nothing. The word handed back is the original one, though:
 * this is displayed, and the block was showing a learner "tschüss" and
 * "morgen" in lower case — in a language where capitalisation is a rule the
 * course teaches and an error tag it tracks.
 */
export function diffWords(target: string, heard: string) {
  const fold = (s: string) => s.toLowerCase().replace(/[.,!?;:]/g, "");
  const t = target.trim().split(/\s+/).filter(Boolean);
  const h = new Set(
    heard
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => fold(w)),
  );
  return t.map((w) => ({
    word: w.replace(/[.,!?;:]/g, ""),
    ok: h.has(fold(w)),
  }));
}
