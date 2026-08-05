/**
 * An invisible ::after that stretches a link's hit area to ~44px without moving
 * anything. For the small controls — the header nav, every "← back", the tour's
 * 4px step rail — which are a miss on a phone at their drawn size.
 *
 * Vertical only, so a row of controls side by side is safe. NOT for two controls
 * stacked a few pixels apart: the overlays would overlap and one would take the
 * other's taps. Give those real padding instead.
 */
const AREA =
  "relative after:absolute after:inset-x-0 after:-inset-y-[13px] after:content-['']";

/** For a link in flowing text or alone on its line. */
export const TAP = `inline-block ${AREA}`;

/** For a control that is already a flex or grid child, where inline-block would break the layout. */
export const TAP_BLOCK = AREA;
