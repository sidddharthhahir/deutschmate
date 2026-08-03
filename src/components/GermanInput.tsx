"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";

/**
 * German text entry on a keyboard that has no German on it.
 *
 * Four blocks now ask you to type German (Lücken, Hören, Schreiben, Gespräch),
 * and on a UK/US layout ä ö ü ß need alt codes nobody remembers. Left alone,
 * that friction gets blamed on German rather than on the keyboard.
 *
 * Two ways in, deliberately both:
 *
 *   Alt + a/o/u/s      for the keyboard. Explicit, so it can never fire by
 *                      accident. Alt+Shift+a gives Ä.
 *   A row of buttons   for the phone, where there is no Alt key at all.
 *
 * What this does NOT do is silently rewrite "ae" to "ä" as you type. That
 * looks clever for one demo and then mangles Museum, Adresse, Gruppe, aktuell
 * and every English loanword — turning a typing aid into a source of wrong
 * answers in the one place where wrong answers are recorded against you.
 */

const KEYS: Record<string, [lower: string, upper: string]> = {
  a: ["ä", "Ä"],
  o: ["ö", "Ö"],
  u: ["ü", "Ü"],
  s: ["ß", "ẞ"],
};

/** The buttons, in the order a German keyboard has them. */
const CHARS = ["ä", "ö", "ü", "ß"] as const;

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Insert text at the caret, keeping undo history intact where the browser
 * supports it. `execCommand` is deprecated but it is still the only way to
 * write into a field without destroying the native undo stack; the manual
 * path below is the fallback.
 */
function insertAtCaret(el: Field, ch: string, onChange: (v: string) => void) {
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;

  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, ch);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    const next = el.value.slice(0, start) + ch + el.value.slice(end);
    el.value = next;
    el.setSelectionRange(start + ch.length, start + ch.length);
  }
  onChange(el.value);
}

/**
 * Alt + a/o/u/s → ä/ö/ü/ß. Returns a keydown handler to spread onto a field.
 *
 * Only fires with Alt held and no Ctrl/Meta, so it cannot collide with browser
 * or OS shortcuts, and never intercepts a plain keystroke.
 */
export function useUmlautKeys(onChange: (v: string) => void) {
  return useCallback(
    (e: React.KeyboardEvent<Field>) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const pair = KEYS[e.key.toLowerCase()];
      if (!pair) return;
      e.preventDefault();
      insertAtCaret(e.currentTarget, e.shiftKey ? pair[1] : pair[0], onChange);
    },
    [onChange],
  );
}

export type GermanFieldHandle = { focus: () => void };

type Common = {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Hide the button row where space is tight and a keyboard is certain. */
  keys?: boolean;
};

/**
 * The button row. Always rendered for touch, and it doubles as the discovery
 * mechanism for the Alt shortcuts — nobody reads a shortcuts list first.
 *
 * Exported so a layout that can't take the row directly under its field (the
 * chat composer, where the mic and send buttons sit alongside) can place it
 * itself rather than go without.
 */
export function UmlautBar({
  onInsert,
  disabled,
}: {
  onInsert: (ch: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5">
      {CHARS.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          // Keeps focus in the field, so the caret position survives the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(c)}
          className="border-line text-secondary hover:border-line-strong hover:text-fg font-serif min-w-[42px] rounded-lg border py-1.5 text-[17px] transition-colors disabled:opacity-30"
        >
          {c}
        </button>
      ))}
      <span className="font-mono text-muted/60 ml-1.5 hidden text-[10.5px] sm:inline">
        oder Alt + a o u s
      </span>
    </div>
  );
}

export const GermanInput = forwardRef<GermanFieldHandle, Common>(function GermanInput(
  { value, onChange, onEnter, disabled, placeholder, className, ariaLabel, keys = true },
  ref,
) {
  const el = useRef<HTMLInputElement>(null);
  const onKey = useUmlautKeys(onChange);
  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }), []);

  return (
    <>
      <input
        ref={el}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKey(e);
          if (e.key === "Enter" && onEnter && !e.defaultPrevented) {
            e.preventDefault();
            onEnter();
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        lang="de"
        className={className}
      />
      {keys && (
        <UmlautBar
          disabled={disabled}
          onInsert={(c) => el.current && insertAtCaret(el.current, c, onChange)}
        />
      )}
    </>
  );
});

export const GermanTextarea = forwardRef<GermanFieldHandle, Common & { rows?: number }>(
  function GermanTextarea(
    { value, onChange, disabled, placeholder, className, ariaLabel, rows = 7, keys = true },
    ref,
  ) {
    const el = useRef<HTMLTextAreaElement>(null);
    const onKey = useUmlautKeys(onChange);
    useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }), []);

    return (
      <>
        <textarea
          ref={el}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={rows}
          spellCheck={false}
          lang="de"
          className={className}
        />
        {keys && (
          <UmlautBar
            disabled={disabled}
            onInsert={(c) => el.current && insertAtCaret(el.current, c, onChange)}
          />
        )}
      </>
    );
  },
);

/** Shown once next to a field the first time someone meets it. */
export function UmlautHint() {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button
      onClick={() => setGone(true)}
      className="font-mono text-muted/70 hover:text-secondary mt-1.5 block w-full text-center text-[10.5px] transition-colors"
    >
      Alt + a o u s für ä ö ü ß · tippen zum Ausblenden
    </button>
  );
}
