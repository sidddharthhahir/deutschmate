/**
 * An invisible ::after that stretches a link's hit area to ~44px without moving
 * anything. For the small mono links — the header nav, every "← back" — which
 * measure 18-23px tall and are a miss on a phone.
 *
 * Only for a link that sits alone on its line. Two of these stacked 8px apart
 * would overlap and one would steal the other's taps; give those real padding.
 */
export const TAP =
  "relative inline-block after:absolute after:inset-x-0 after:-inset-y-[13px] after:content-['']";
