/**
 * Add the scripted fallback to the six survival scenarios.
 *
 * A one-shot content edit, written as a script rather than done by hand so the
 * shape is validated as it is written: every `next` has to point at a real turn
 * or at -1, every turn needs at least one correct option, and the whole thing
 * has to survive the same parse the app does. Editing 500 lines of JSON by hand
 * and finding out at runtime is the alternative.
 *
 *   node scripts/add-survival-dialogue.mts
 *
 * Idempotent: re-running replaces the dialogue rather than appending to it.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Option = { say: string; ok: boolean; why?: string; next: number };
type Turn = { them: string; options: Option[] };

/* The `why` lines carry the actual advice. A wrong answer here is rarely bad
   grammar — it is the sentence that costs you the appointment, and that is the
   thing worth knowing before you are standing there. */
const DIALOGUES: Record<string, Turn[]> = {
  "surv-anmeldung": [
    {
      them: "Haben Sie einen Termin?",
      options: [
        { say: "Ja, um zehn Uhr. Ich möchte mich anmelden.", ok: true, next: 1 },
        {
          say: "Ich bin am ersten März eingezogen.",
          ok: false,
          why: "True, and she will ask that in a moment — but she asked whether you have an appointment. Answer the question that was asked.",
          next: 1,
        },
      ],
    },
    {
      them: "Ihren Pass bitte. Und haben Sie die Wohnungsgeberbestätigung dabei?",
      options: [
        { say: "Ja, hier ist meine Wohnungsgeberbestätigung.", ok: true, next: 2 },
        {
          say: "Nein, brauche ich die?",
          ok: false,
          why: "Yes — and without it the appointment ends here. It is the one paper your landlord has to sign, and no Amt will register you without it.",
          next: 2,
        },
      ],
    },
    {
      them: "Seit wann wohnen Sie dort?",
      options: [
        { say: "Ich bin am ersten März eingezogen.", ok: true, next: 3 },
        {
          say: "Seit ein paar Monaten, glaube ich.",
          ok: false,
          why: "„Seit wann“ wants a date. Vague is a bad idea here: registering more than two weeks late can carry a fine, and the date is what decides it.",
          next: 3,
        },
      ],
    },
    {
      them: "Bitte unterschreiben Sie hier.",
      options: [
        { say: "Gern. Brauche ich noch etwas?", ok: true, next: 4 },
        {
          say: "Können Sie das bitte wiederholen?",
          ok: true,
          why: "Also fine — asking her to repeat is never the wrong move at an Amt.",
          next: 4,
        },
      ],
    },
    {
      them: "Sie bekommen die Meldebescheinigung gleich mit. Die Steuer-ID kommt in zwei Wochen per Post.",
      options: [
        { say: "Vielen Dank. Auf Wiedersehen.", ok: true, next: -1 },
        {
          say: "Wann bekomme ich die Steuer-ID?",
          ok: false,
          why: "She just said: two weeks, by post. Hearing the end of the sentence is the whole skill this scenario trains.",
          next: -1,
        },
      ],
    },
  ],

  "surv-wg": [
    {
      them: "Erzähl mal was von dir.",
      options: [
        { say: "Ich studiere Informatik im zweiten Semester.", ok: true, next: 1 },
        {
          say: "Wie hoch sind die Nebenkosten?",
          ok: false,
          why: "Money comes later, and it will. They asked about you — a WG viewing is an audition, and the first question is whether they want to live with you.",
          next: 1,
        },
      ],
    },
    {
      them: "Kochst du gern?",
      options: [
        { say: "Ja, sehr gern. Ich koche fast jeden Abend.", ok: true, next: 2 },
        {
          say: "Nein.",
          ok: false,
          why: "Not wrong German. But a one-word answer in a WG interview reads as no interest — and the kitchen is the room they are really asking about.",
          next: 2,
        },
      ],
    },
    {
      them: "Hast du noch Fragen?",
      options: [
        { say: "Ja — ist die Miete warm oder kalt?", ok: true, next: 3 },
        {
          say: "Nein, alles klar.",
          ok: false,
          why: "This is the moment. Warm or kalt decides whether the rent is the number they told you or that number plus a hundred euros.",
          next: 3,
        },
      ],
    },
    {
      them: "Kalt. Die Nebenkosten sind achtzig Euro extra.",
      options: [
        { say: "Und gibt es eine Kaution?", ok: true, next: 4 },
        {
          say: "Okay, das ist günstig.",
          ok: false,
          why: "Pleasant, and you still do not know about the deposit — usually two or three months' rent, up front, which is the number that actually decides whether you can take the room.",
          next: 4,
        },
      ],
    },
    {
      them: "Zwei Kaltmieten. Wann könntest du einziehen?",
      options: [
        { say: "Ab dem ersten. Wann würdet ihr Bescheid geben?", ok: true, next: -1 },
        {
          say: "Weiß ich noch nicht.",
          ok: false,
          why: "A vague date is a reason to pick the other applicant. Give one even if it is approximate — „ab Anfang nächsten Monats“ is enough.",
          next: -1,
        },
      ],
    },
  ],

  "surv-arzt": [
    {
      them: "Waren Sie schon mal bei uns? Ihre Versichertenkarte bitte.",
      options: [
        { say: "Nein, das erste Mal. Hier ist meine Karte.", ok: true, next: 1 },
        {
          say: "Ich habe seit drei Tagen Halsschmerzen.",
          ok: false,
          why: "That is the next question and she will ask it. First the card — no card, no appointment.",
          next: 1,
        },
      ],
    },
    {
      them: "Was führt Sie zu mir?",
      options: [
        { say: "Ich habe seit drei Tagen Halsschmerzen.", ok: true, next: 2 },
        {
          say: "Mir geht es nicht gut.",
          ok: false,
          why: "True and unusable. Name the symptom and how long it has lasted — those two facts are most of a German consultation.",
          next: 2,
        },
      ],
    },
    {
      them: "Haben Sie Fieber gemessen?",
      options: [
        { say: "Ja, achtunddreißig Grad. Und mir ist schlecht.", ok: true, next: 3 },
        {
          say: "Ein bisschen Fieber, glaube ich.",
          ok: false,
          why: "„Ein bisschen“ is not a number, and the number is what she is asking for. If you have not measured it, say that instead.",
          next: 3,
        },
      ],
    },
    {
      them: "Nehmen Sie regelmäßig Medikamente?",
      options: [
        { say: "Nein. Aber ich bin gegen Penizillin allergisch.", ok: true, next: 4 },
        {
          say: "Nein.",
          ok: false,
          why: "Honest, and it leaves out the one thing she must know before writing a prescription. Allergies are not medication — say them anyway, unprompted.",
          next: 4,
        },
      ],
    },
    {
      them: "Gut, dass Sie das sagen. Ich verschreibe Ihnen etwas anderes und schreibe Sie für drei Tage krank.",
      options: [
        { say: "Danke. Wie oft soll ich das nehmen?", ok: true, next: -1 },
        {
          say: "Brauche ich eine Krankschreibung?",
          ok: false,
          why: "She just gave you one, for three days. Same lesson as the Amt: the answer is usually already in the sentence.",
          next: -1,
        },
      ],
    },
  ],

  "surv-bank": [
    {
      them: "Möchten Sie ein Girokonto eröffnen?",
      options: [
        { say: "Ja, ein Girokonto. Ist das für Studenten kostenlos?", ok: true, next: 1 },
        {
          say: "Ja, ein Sparkonto bitte.",
          ok: false,
          why: "A Sparkonto is a savings account — you cannot pay rent or get a salary into it. The everyday account is the Girokonto.",
          next: 1,
        },
      ],
    },
    {
      them: "Sind Sie Student oder berufstätig?",
      options: [
        { say: "Student, im zweiten Semester.", ok: true, next: 2 },
        {
          say: "Ja.",
          ok: false,
          why: "„A oder B“ is an either/or question, and „ja“ answers neither. German uses this shape constantly at counters — listen for the „oder“.",
          next: 2,
        },
      ],
    },
    {
      them: "Haben Sie eine Meldebescheinigung dabei?",
      options: [
        { say: "Ja, hier. Und meinen Ausweis.", ok: true, next: 3 },
        {
          say: "Nein, brauche ich die?",
          ok: false,
          why: "Yes. No German bank opens an account without a registered address — which is why the Bürgeramt comes before the bank.",
          next: 3,
        },
      ],
    },
    {
      them: "Das Konto ist für Studenten kostenlos.",
      options: [
        { say: "Fallen später Gebühren an? Und bekomme ich eine EC-Karte?", ok: true, next: 4 },
        {
          say: "Gut, danke.",
          ok: false,
          why: "Free usually means free while you are enrolled. Ask what happens after you graduate — that is when the monthly fee appears.",
          next: 4,
        },
      ],
    },
    {
      them: "Die Karte kommt in etwa einer Woche per Post. Die PIN schicken wir Ihnen getrennt.",
      options: [
        { say: "Das habe ich nicht ganz verstanden — die PIN kommt separat?", ok: true, next: -1 },
        {
          say: "Alles klar, danke.",
          ok: false,
          why: "Two envelopes arrive on different days and the second looks like junk mail. People throw the PIN away. If you did not catch it, say so.",
          next: -1,
        },
      ],
    },
  ],

  "surv-vertrag": [
    {
      them: "Ihre Kundennummer bitte.",
      options: [
        { say: "Die habe ich hier: vier acht eins fünf.", ok: true, next: 1 },
        {
          say: "Ich möchte meinen Vertrag kündigen.",
          ok: false,
          why: "You will get to say it, and he already knows. Without the number he cannot open your file, so nothing you say before it is recorded anywhere.",
          next: 1,
        },
      ],
    },
    {
      them: "Danke. Warum möchten Sie kündigen?",
      options: [
        { say: "Ich ziehe um. Zum nächstmöglichen Zeitpunkt, bitte.", ok: true, next: 2 },
        {
          say: "Das geht Sie nichts an.",
          ok: false,
          why: "You genuinely do not have to justify it. But he types a reason into a box either way, and a short one costs you nothing and keeps the call short.",
          next: 2,
        },
      ],
    },
    {
      them: "Wir können Ihnen ein besseres Angebot machen — zwei Monate gratis.",
      options: [
        { say: "Nein danke, ich möchte kein neues Angebot.", ok: true, next: 3 },
        {
          say: "Vielleicht — erzählen Sie mal.",
          ok: false,
          why: "This is the entire purpose of the call from his side. The moment you engage with the offer, the cancellation becomes something to come back to later.",
          next: 3,
        },
      ],
    },
    {
      them: "Die Kündigungsfrist beträgt drei Monate. Der Vertrag läuft noch bis Ende des Jahres.",
      options: [
        { say: "Verstanden. Ich bestehe auf der Kündigung zum nächstmöglichen Zeitpunkt.", ok: true, next: 4 },
        {
          say: "Dann rufe ich nochmal an, wenn es näher dran ist.",
          ok: false,
          why: "Never. Calling later restarts nothing and loses months — cancel now, effective at the earliest date allowed. The notice period runs from today.",
          next: 4,
        },
      ],
    },
    {
      them: "In Ordnung, ich habe die Kündigung aufgenommen.",
      options: [
        { say: "Bitte schicken Sie mir eine schriftliche Bestätigung.", ok: true, next: -1 },
        {
          say: "Danke, tschüss.",
          ok: false,
          why: "The single most important sentence in this conversation is the one you just skipped. Without written confirmation you have no evidence the call happened.",
          next: -1,
        },
      ],
    },
  ],

  "surv-uni": [
    {
      them: "Um welche Prüfung geht es?",
      options: [
        { say: "Um Analysis zwei. Ich konnte mich nicht rechtzeitig anmelden.", ok: true, next: 1 },
        {
          say: "Um eine Prüfung im Sommer.",
          ok: false,
          why: "Name it. „A summer exam“ does not identify a record, and she cannot start looking until it does.",
          next: 1,
        },
      ],
    },
    {
      them: "Die Frist war leider letzte Woche.",
      options: [
        { say: "Ich war krank, hier ist mein Attest.", ok: true, next: 2 },
        {
          say: "Das ist unfair.",
          ok: false,
          why: "Possibly, and she did not set the deadline. The Attest is the only thing in this room that changes the answer — lead with it.",
          next: 2,
        },
      ],
    },
    {
      them: "Mit Attest geht es. Das müssen Sie aber schriftlich beantragen.",
      options: [
        { say: "Kann ich die Prüfung nachholen? Wo bekomme ich das Formular?", ok: true, next: 3 },
        {
          say: "Können Sie das für mich machen?",
          ok: false,
          why: "„Schriftlich beantragen“ means you write it. German administration is full of this: the person telling you the rule is not the person who can bend it.",
          next: 3,
        },
      ],
    },
    {
      them: "Füllen Sie bitte dieses Formular aus.",
      options: [
        { say: "Bis wann muss ich es abgeben? Könnten Sie mir das schriftlich geben?", ok: true, next: 4 },
        {
          say: "Alles klar, danke.",
          ok: false,
          why: "You are now holding a form with a deadline you did not ask about. Ask, and ask for it in writing — verbal deadlines are not deadlines.",
          next: 4,
        },
      ],
    },
    {
      them: "Steht oben rechts. Für die Rückmeldung ist übrigens das Sekretariat zuständig.",
      options: [
        { say: "An wen kann ich mich da wenden?", ok: true, next: -1 },
        {
          say: "Aber Sie sind doch das Prüfungsamt.",
          ok: false,
          why: "Arguing about who is responsible has never once worked. Ask for the name of the person who is — that is the answer you came for.",
          next: -1,
        },
      ],
    },
  ],
};

// ------------------------------------------------------------------ apply
const FILE = "data/scenarios-survival.json";
const data = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, unknown>[];

let problems = 0;
const fail = (m: string) => {
  console.error(`  ✗ ${m}`);
  problems++;
};

for (const [id, turns] of Object.entries(DIALOGUES)) {
  const target = data.find((s) => s.id === id);
  if (!target) {
    fail(`no scenario with id "${id}"`);
    continue;
  }
  turns.forEach((t, i) => {
    if (!t.them.trim()) fail(`${id} turn ${i}: empty prompt`);
    if (!t.options.some((o) => o.ok)) fail(`${id} turn ${i}: no correct option`);
    for (const o of t.options) {
      if (!o.say.trim()) fail(`${id} turn ${i}: empty option`);
      if (!o.ok && !o.why) fail(`${id} turn ${i}: wrong option "${o.say}" has no explanation`);
      // -1 ends the conversation; anything else must be a real turn, and must
      // move forward — a `next` pointing backwards is an infinite loop.
      if (o.next !== -1 && (o.next <= i || o.next >= turns.length)) {
        fail(`${id} turn ${i}: next=${o.next} is not a later turn or -1`);
      }
    }
  });
  if (!turns.some((t) => t.options.some((o) => o.next === -1))) {
    fail(`${id}: no option ends the conversation`);
  }
  target.dialogue = turns;
}

for (const s of data) {
  if (!s.dialogue) fail(`scenario "${s.id}" still has no dialogue`);
}

if (problems) {
  console.error(`\n  ${problems} problem(s) — nothing written.\n`);
  process.exit(1);
}

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
const turns = Object.values(DIALOGUES).reduce((n, d) => n + d.length, 0);
const options = Object.values(DIALOGUES).reduce(
  (n, d) => n + d.reduce((m, t) => m + t.options.length, 0),
  0,
);
console.log(
  `\n  ✓ ${Object.keys(DIALOGUES).length} scenarios · ${turns} turns · ${options} options → ${FILE}\n`,
);
