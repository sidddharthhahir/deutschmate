"use client";

/**
 * YouTube IFrame Player API — one shared declaration.
 *
 * Both the video block and the segment editor drive the player, and two
 * separate `declare global` blocks for window.YT collide (TS2717). This is the
 * single source for the type and the loader.
 *
 * Embedding through the official player is the legitimate way to use these
 * videos, and it is also the only way to get seek / loop / playback-rate
 * control — which is the entire feature.
 */

export type YTPlayer = {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Accepts a full URL in any common shape, or a bare 11-character id. */
export function extractVideoId(input: string): string {
  const s = input.trim();
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    s.match(/embed\/([A-Za-z0-9_-]{11})/) ??
    s.match(/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
}

/** YT.PlayerState.PLAYING */
export const PLAYING = 1;
