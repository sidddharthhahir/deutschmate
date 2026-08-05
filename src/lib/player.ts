"use client";

import { loadYouTubeApi, PLAYING, type YTPlayer } from "./youtube";

/**
 * One player interface over two very different players.
 *
 * WHY THIS EXISTS
 *
 * The course videos are Deutsche Welle's "Nicos Weg", and DW publishes the
 * complete 226-episode course as direct MP4s on their own CDN via an official
 * podcast feed. YouTube only exposed 14 of them without going through a consent
 * wall — so the MP4s are now the main source, and a plain <video> element plays
 * them. A handful of things DW does not put in the feed (the full-length films,
 * the Rückblick recaps) stay on YouTube.
 *
 * Both the session's video block and the segment editor need exactly six
 * operations, and neither should care which player it got. Without this they
 * would each grow the same `if (src) … else …` in five places.
 *
 * The MP4 path is the better one for this app beyond just coverage: no Google
 * script, no cookie, nothing reporting back what a learner watched. It is also
 * far less code — half of `youtube.ts` exists to load an external API that a
 * <video> element does not need.
 */
export type Playable = {
  currentTime(): number;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  playing(): boolean;
  rate(r: number): void;
  destroy(): void;
};

/** What a video row can be. Exactly one of these is set. */
export type Source = { kind: "youtube"; youtubeId: string } | { kind: "file"; src: string };

export function sourceOf(v: { youtube_id?: string | null; src_url?: string | null }): Source | null {
  /* src_url wins when both are present: a row can carry a YouTube id from an
     older import and a DW mp4 from the new one, and the mp4 is the one that
     does not need a third party. */
  if (v.src_url) return { kind: "file", src: v.src_url };
  if (v.youtube_id) return { kind: "youtube", youtubeId: v.youtube_id };
  return null;
}

/**
 * Mount a player into `holder` and resolve once it can be driven.
 *
 * Resolves null if the holder went away first — a component that unmounts
 * during the YouTube API's async load, which is a real race on a slow network
 * and used to leave an orphan player running audio behind a closed block.
 */
export async function mount(
  holder: HTMLElement,
  source: Source,
  onReady: () => void,
): Promise<Playable | null> {
  if (source.kind === "file") {
    const el = document.createElement("video");
    el.src = source.src;
    el.controls = true;
    el.playsInline = true;
    el.preload = "metadata";
    el.className = "h-full w-full";
    /* No `crossOrigin`. Setting it would make the browser demand CORS headers
       that DW's CDN does not send, and the video would refuse to load — plain
       cross-origin playback needs no CORS at all. It is only needed to read
       pixels, which nothing here does. */
    holder.replaceChildren(el);
    // Metadata is enough to seek; waiting for canplay would delay the segment
    // list on a slow connection for no benefit.
    if (el.readyState >= 1) onReady();
    else el.addEventListener("loadedmetadata", onReady, { once: true });
    return fromVideo(el);
  }

  await loadYouTubeApi();
  if (!holder.isConnected || !window.YT) return null;
  const yt = new window.YT.Player(holder, {
    videoId: source.youtubeId,
    playerVars: { rel: 0, modestbranding: 1, cc_lang_pref: "de" },
    events: { onReady },
  });
  return fromYouTube(yt);
}

function fromVideo(el: HTMLVideoElement): Playable {
  return {
    currentTime: () => el.currentTime,
    seek: (s) => {
      el.currentTime = s;
    },
    play: () => void el.play().catch(() => {}), // autoplay policy, not an error
    pause: () => el.pause(),
    playing: () => !el.paused && !el.ended,
    rate: (r) => {
      el.playbackRate = r;
    },
    destroy: () => {
      el.pause();
      el.removeAttribute("src");
      el.load(); // drops the connection; without it the download continues
      el.remove();
    },
  };
}

function fromYouTube(p: YTPlayer): Playable {
  return {
    currentTime: () => p.getCurrentTime(),
    seek: (s) => p.seekTo(s, true),
    play: () => p.playVideo(),
    pause: () => p.pauseVideo(),
    /* getCurrentTime() > 0 is not "is playing" — a paused video mid-way still
       reports a positive time. Ask the player for its state. */
    playing: () => p.getPlayerState() === PLAYING,
    rate: (r) => p.setPlaybackRate(r),
    destroy: () => p.destroy(),
  };
}
