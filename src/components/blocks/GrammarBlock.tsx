"use client";

import { useState } from "react";
import {
  Card,
  Eyebrow,
  Progress,
  Option,
  Verdict,
  record,
  type BlockProps,
} from "./shared";

type Drill = { q: string; options: string[]; a: number; why: string };
type Example = { de: string; en: string };
type Payload = {
  grammar: { id: string; title: string; explain_md: string };
  examples: Example[];
  drills: Drill[];
};

/** Grammar: short and visual, never a wall of text. */
function renderMd(md: string) {
  const out: React.ReactNode[] = [];
  const lines = md.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```"))
        buf.push(lines[i++]);
      i++;
      out.push(
        <pre
          key={key++}
          className="bg-bg border-line-sub font-mono text-der my-4 overflow-x-auto rounded-xl border p-4 text-[13px] leading-relaxed"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c) || c === "")) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-line border-b">
                {head.map((h, n) => (
                  <th
                    key={n}
                    className="font-mono text-muted px-3 py-2 text-left text-[11.5px] font-normal tracking-[0.08em] uppercase"
                  >
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, n) => (
                <tr key={n} className="border-line-sub border-b">
                  {r.map((c, m) => (
                    <td key={m} className="text-secondary px-3 py-2">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- "))
        items.push(lines[i++].slice(2));
      out.push(
        <ul key={key++} className="my-3 space-y-1 pl-5">
          {items.map((t, n) => (
            <li key={n} className="text-secondary list-disc">
              {inline(t)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    out.push(
      <p key={key++} className="text-secondary my-3 leading-relaxed">
        {inline(line)}
      </p>,
    );
    i++;
  }
  return out;
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="text-fg font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code
          key={i}
          className="bg-raised font-mono text-der rounded px-1.5 py-0.5 text-[13px]"
        >
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

export default function GrammarBlock({ payload, onDone }: BlockProps<Payload>) {
  const [phase, setPhase] = useState<"learn" | "drill">("learn");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const drills = payload.drills ?? [];
  const d = drills[i];

  if (phase === "learn") {
    return (
      <div>
        <Eyebrow>Grammatik</Eyebrow>
        <Card>
          <h2 className="font-serif mb-5 text-[26px] font-semibold">
            {payload.grammar.title}
          </h2>
          <div className="max-w-[62ch] text-[15px]">
            {renderMd(payload.grammar.explain_md)}
          </div>

          {payload.examples?.length > 0 && (
            <div className="border-line-sub mt-6 space-y-2 border-t pt-5">
              {payload.examples.map((e, n) => (
                <div
                  key={n}
                  className="bg-bg border-line-sub rounded-xl border px-4 py-3"
                >
                  <p className="font-serif text-fg text-[18px]">{e.de}</p>
                  <p className="text-muted mt-0.5 text-[14px]">{e.en}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <button
          onClick={() => (drills.length ? setPhase("drill") : onDone())}
          className="bg-fg mt-4 w-full rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          {drills.length ? `Üben (${drills.length})` : "Weiter"}
        </button>
      </div>
    );
  }

  if (!d) {
    onDone();
    return null;
  }

  async function choose(n: number) {
    setPicked(n);
    const correct = n === d.a;
    await record({
      kind: "new-grammar",
      refId: payload.grammar.id,
      correct,
      answer: d.options[n],
      expected: d.options[d.a],
    });
    setTimeout(
      () => {
        setPicked(null);
        setI((x) => x + 1);
      },
      correct ? 700 : 2400,
    );
  }

  return (
    <div>
      <Progress done={i} total={drills.length} />
      <Eyebrow>{payload.grammar.title}</Eyebrow>
      <Card>
        <p className="font-serif mb-6 text-center text-[22px]">{d.q}</p>
        <div className="space-y-2">
          {d.options.map((o, n) => (
            <Option
              key={n}
              onClick={() => void choose(n)}
              state={
                picked === null
                  ? "idle"
                  : n === d.a
                    ? "correct"
                    : picked === n
                      ? "wrong"
                      : "dimmed"
              }
            >
              {o}
            </Option>
          ))}
        </div>
        {picked !== null && <Verdict ok={picked === d.a} why={d.why} />}
      </Card>
    </div>
  );
}
