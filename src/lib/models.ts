import { readFileSync } from "node:fs";
import path from "node:path";

/** The model catalogue, loaded from data/models.json. */

export type Model = {
  id: string;
  label: string;
  in: number;
  out: number;
  context: number;
  note?: string;
};

export type Catalogue = {
  as_of: string;
  source: string;
  roles: { quality: string; cheap: string };
  cache: { read: number; write_5m: number; write_1h: number };
  models: Model[];
};

let _cat: Catalogue | null = null;

export function catalogue(): Catalogue {
  if (_cat) return _cat;
  const raw = readFileSync(
    path.join(process.cwd(), "data/models.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as Catalogue;

  /* Validated on load rather than trusted. A typo in a price is silent and
     permanent: every figure it produces looks like a number that was measured.
     Failing here is loud and happens once, at startup. */
  if (!parsed.models?.length) throw new Error("data/models.json has no models");
  for (const m of parsed.models) {
    if (!m.id || !(m.in > 0) || !(m.out > 0)) {
      throw new Error(
        `data/models.json: ${m.id ?? "a model"} has no usable price`,
      );
    }
  }
  const { read, write_5m, write_1h } = parsed.cache ?? {};
  if (!(read > 0) || !(write_5m > 0) || !(write_1h > 0)) {
    throw new Error("data/models.json: cache multipliers missing");
  }
  for (const role of ["quality", "cheap"] as const) {
    const id = parsed.roles?.[role];
    if (!id || !parsed.models.some((m) => m.id === id)) {
      throw new Error(
        `data/models.json: role "${role}" names an unlisted model`,
      );
    }
  }
  _cat = parsed;
  return parsed;
}

/** Which model does this kind of work. Changing it is a data edit. */
export function modelFor(role: "quality" | "cheap"): string {
  return catalogue().roles[role];
}

export function modelById(id: string): Model | undefined {
  return catalogue().models.find((m) => m.id === id);
}

/** Everything the cost page needs to say where its numbers came from. */
export function priceList() {
  const c = catalogue();
  return { asOf: c.as_of, source: c.source, models: c.models, cache: c.cache };
}
