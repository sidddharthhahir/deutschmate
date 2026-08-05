import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import {
  readJson,
  badRequest,
  str,
  int,
  bool,
  arr,
  unauthorized,
} from "@/lib/http";
import { buildExam, saveExamRun, type SectionScore } from "@/lib/exam";
import { logAttempt } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — assemble a test. The only person who could exploit it is the learner, against their own
 * private stats.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await activeUser(req);
  if (!user) return unauthorized();
  const level = url.searchParams.get("level") ?? user.level;
  return NextResponse.json(buildExam(level));
}

/** POST — record a finished run, plus one attempt row per question. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  /* arr() rather than `?? []`: a `sections` of "nope" is truthy, has a
     .length, and then blew up on .reduce inside saveExamRun. */
  const sections = arr<SectionScore>(raw.sections).filter(
    (s) =>
      s &&
      typeof s.title === "string" &&
      Number.isFinite(s.correct) &&
      Number.isFinite(s.total),
  );
  if (!sections.length) return badRequest("sections required");

  type Answer = {
    section: string;
    prompt: string;
    picked: string;
    expected: string;
    correct: boolean;
  };

  // Every question becomes an attempt, so exam mistakes feed the same Fix block
  // and error tally as everything else. An exam you can't learn from is a quiz.
  for (const a of arr<Answer>(raw.answers)) {
    if (!a || typeof a !== "object") continue;
    logAttempt({
      userId: user.id,
      kind: `exam-${str(a.section, 20) || "unbekannt"}`,
      correct: bool(a.correct),
      answer: str(a.picked, 300),
      expected: str(a.expected, 300),
    });
  }

  const { correct, total } = saveExamRun({
    userId: user.id,
    level: str(raw.level, 10) || user.level,
    sections,
    minutes: Math.max(0, int(raw.minutes, 0, 24 * 60) ?? 0),
  });

  return NextResponse.json({ ok: true, correct, total });
}
