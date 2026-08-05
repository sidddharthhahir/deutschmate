/** Six more Alltag scenarios. */
import { readFileSync, writeFileSync } from "node:fs";

type Line = { de: string; en: string };
type Option = { say: string; ok: boolean; why?: string; next: number };
type Turn = { them: string; options: Option[] };
type Scenario = {
  id: string;
  level: string;
  ord: number;
  title: string;
  why: string;
  bring: string[];
  scenario: { role: string; goal: string; opener: string };
  phrases: Line[];
  hear: Line[];
  dialogue: Turn[];
};

const NEW: Scenario[] = [
  {
    id: "surv-apotheke",
    level: "A1.2",
    ord: 7,
    title: "In der Apotheke",
    why: "German pharmacies keep most things behind the counter, so you have to ask out loud for what you want. Doing it once badly is how everyone learns.",
    bring: [
      "Rezept, falls du eins hast",
      "Versichertenkarte bei Rezepten",
      "Bargeld oder Karte",
    ],
    scenario: {
      role: "an Apothekerin, friendly and quick, used to explaining dosages",
      goal: "Describe what is wrong and leave with the right thing and the dose",
      opener: "Guten Tag, was kann ich für Sie tun?",
    },
    phrases: [
      { de: "Ich habe Kopfschmerzen.", en: "I have a headache." },
      {
        de: "Haben Sie etwas gegen Husten?",
        en: "Do you have something for a cough?",
      },
      { de: "Ich habe kein Rezept.", en: "I do not have a prescription." },
      { de: "Wie oft soll ich das nehmen?", en: "How often should I take it?" },
      { de: "Gibt es das auch günstiger?", en: "Is there a cheaper version?" },
      {
        de: "Ich bin gegen Penizillin allergisch.",
        en: "I am allergic to penicillin.",
      },
    ],
    hear: [
      { de: "Haben Sie ein Rezept?", en: "Do you have a prescription?" },
      { de: "Für Sie selbst?", en: "For yourself?" },
      { de: "Seit wann haben Sie das?", en: "Since when have you had this?" },
      {
        de: "Dreimal täglich nach dem Essen.",
        en: "Three times a day after meals.",
      },
      {
        de: "Nehmen Sie sonst noch Medikamente?",
        en: "Are you taking any other medication?",
      },
      {
        de: "Das bekommen Sie nur auf Rezept.",
        en: "That is prescription-only.",
      },
    ],
    dialogue: [
      {
        them: "Guten Tag, was kann ich für Sie tun?",
        options: [
          { say: "Ich habe seit zwei Tagen Halsschmerzen.", ok: true, next: 1 },
          {
            say: "Haben Sie Aspirin?",
            ok: false,
            why: "You can ask for a product, but naming the symptom gets better advice — she knows what works and you do not.",
            next: 1,
          },
        ],
      },
      {
        them: "Für Sie selbst? Und haben Sie ein Rezept?",
        options: [
          { say: "Ja, für mich. Ich habe kein Rezept.", ok: true, next: 2 },
          {
            say: "Ja.",
            ok: false,
            why: "Two questions, one answer. She now has to ask again, and the queue behind you grows.",
            next: 2,
          },
        ],
      },
      {
        them: "Kein Problem, dagegen gibt es etwas rezeptfrei. Nehmen Sie sonst noch Medikamente?",
        options: [
          {
            say: "Nein. Aber ich bin gegen Penizillin allergisch.",
            ok: true,
            next: 3,
          },
          {
            say: "Nein.",
            ok: false,
            why: "An allergy is not a medication, so the honest 'nein' hides it. Say it unprompted — this is the one place it matters most.",
            next: 3,
          },
        ],
      },
      {
        them: "Gut zu wissen. Diese Lutschtabletten helfen, achtmal täglich, maximal.",
        options: [
          { say: "Alle wie viele Stunden ungefähr?", ok: true, next: 4 },
          {
            say: "Alles klar, danke.",
            ok: false,
            why: "'Maximal achtmal' is a ceiling, not a schedule. You still do not know the gap between them.",
            next: 4,
          },
        ],
      },
      {
        them: "Etwa alle zwei Stunden. Das macht 8,95 Euro.",
        options: [
          { say: "Kann ich mit Karte zahlen?", ok: true, next: -1 },
          {
            say: "Gibt es das auch günstiger?",
            ok: false,
            why: "Fair question, but ask it before she rings it up — after the price is in the till it is a bigger favour than it sounds.",
            next: -1,
          },
        ],
      },
    ],
  },

  {
    id: "surv-krankenkasse",
    level: "A2.1",
    ord: 8,
    title: "Krankenkasse anmelden",
    why: "Health insurance is compulsory, and a university will not enrol you without proof of it. It is also the paperwork most people do in their first fortnight, in German, before they are ready.",
    bring: [
      "Personalausweis oder Reisepass",
      "Meldebescheinigung",
      "Immatrikulationsbescheinigung oder Arbeitsvertrag",
      "Bankverbindung (IBAN)",
    ],
    scenario: {
      role: "a Kundenberater at a Krankenkasse, patient but working through a form",
      goal: "Get insured as a student and leave knowing when the card arrives",
      opener:
        "Guten Tag. Sie möchten sich versichern? Sind Sie Student oder berufstätig?",
    },
    phrases: [
      {
        de: "Ich möchte mich versichern.",
        en: "I would like to take out insurance.",
      },
      { de: "Ich bin Student.", en: "I am a student." },
      { de: "Was kostet das im Monat?", en: "What does that cost per month?" },
      { de: "Ab wann bin ich versichert?", en: "From when am I insured?" },
      {
        de: "Brauchen Sie noch etwas von mir?",
        en: "Do you need anything else from me?",
      },
      {
        de: "Ich brauche eine Bescheinigung für die Uni.",
        en: "I need a certificate for the university.",
      },
    ],
    hear: [
      {
        de: "Sind Sie schon in Deutschland versichert?",
        en: "Are you already insured in Germany?",
      },
      { de: "Wie alt sind Sie?", en: "How old are you?" },
      {
        de: "Wir brauchen Ihre Meldebescheinigung.",
        en: "We need your registration certificate.",
      },
      {
        de: "Die Karte kommt in etwa zwei Wochen.",
        en: "The card arrives in about two weeks.",
      },
      { de: "Bitte unterschreiben Sie hier.", en: "Please sign here." },
      {
        de: "Die Bescheinigung schicken wir direkt an die Uni.",
        en: "We send the certificate straight to the university.",
      },
    ],
    dialogue: [
      {
        them: "Guten Tag. Sind Sie Student oder berufstätig?",
        options: [
          { say: "Student. Ich möchte mich versichern.", ok: true, next: 1 },
          {
            say: "Ja, genau.",
            ok: false,
            why: "An either/or question again. German counters use this shape constantly — listen for the 'oder'.",
            next: 1,
          },
        ],
      },
      {
        them: "Sind Sie in Deutschland schon irgendwo versichert?",
        options: [
          { say: "Nein, ich bin gerade erst angekommen.", ok: true, next: 2 },
          {
            say: "Ich weiß nicht.",
            ok: false,
            why: "Being insured twice is expensive and being insured nowhere is illegal, so this is the one answer worth checking before you come.",
            next: 2,
          },
        ],
      },
      {
        them: "Dann brauche ich Ihre Meldebescheinigung und die Immatrikulation.",
        options: [
          { say: "Hier, beides. Und mein Ausweis.", ok: true, next: 3 },
          {
            say: "Die Immatrikulation habe ich noch nicht.",
            ok: false,
            why: "This is the loop everyone hits: the Uni wants insurance, the Kasse wants enrolment. The way out is asking for a Vorabbescheinigung — say so rather than going home.",
            next: 3,
          },
        ],
      },
      {
        them: "Alles da. Der Beitrag liegt bei etwa 130 Euro im Monat.",
        options: [
          { say: "Ab wann bin ich versichert?", ok: true, next: 4 },
          {
            say: "Okay.",
            ok: false,
            why: "The start date decides whether a doctor's visit next week is covered. It is the single most useful thing to leave with.",
            next: 4,
          },
        ],
      },
      {
        them: "Ab dem Ersten. Die Karte kommt in zwei Wochen per Post.",
        options: [
          {
            say: "Ich brauche eine Bescheinigung für die Uni — geht das heute?",
            ok: true,
            next: -1,
          },
          {
            say: "Danke, dann warte ich auf die Karte.",
            ok: false,
            why: "The card is not the proof the university wants, and enrolment deadlines do not wait two weeks. Ask for the paper now.",
            next: -1,
          },
        ],
      },
    ],
  },

  {
    id: "surv-auslaenderbehoerde",
    level: "A2.2",
    ord: 9,
    title: "Aufenthaltstitel verlängern",
    why: "The appointment with the highest stakes and the longest waiting time. Book it months early: an expired permit is a problem no amount of good German fixes afterwards.",
    bring: [
      "Reisepass",
      "aktuelles biometrisches Foto",
      "Meldebescheinigung",
      "Immatrikulations- oder Arbeitsbescheinigung",
      "Nachweis über Krankenversicherung",
      "Finanzierungsnachweis (Sperrkonto oder Verdienstbescheinigung)",
    ],
    scenario: {
      role: "a Sachbearbeiter at the Ausländerbehörde, correct and unhurried, going strictly by the checklist",
      goal: "Extend the permit, or leave knowing exactly which paper is missing and by when",
      opener: "Guten Tag. Ihren Pass bitte. Worum geht es?",
    },
    phrases: [
      {
        de: "Ich möchte meinen Aufenthaltstitel verlängern.",
        en: "I would like to extend my residence permit.",
      },
      { de: "Mein Titel läuft im März ab.", en: "My permit expires in March." },
      {
        de: "Ich studiere seit zwei Jahren hier.",
        en: "I have been studying here for two years.",
      },
      {
        de: "Welche Unterlagen fehlen noch?",
        en: "Which documents are still missing?",
      },
      {
        de: "Bis wann muss ich das nachreichen?",
        en: "By when do I have to submit that?",
      },
      {
        de: "Bekomme ich eine Bescheinigung für die Zwischenzeit?",
        en: "Do I get a certificate for the interim?",
      },
    ],
    hear: [
      { de: "Haben Sie einen Termin?", en: "Do you have an appointment?" },
      { de: "Wann läuft Ihr Titel ab?", en: "When does your permit expire?" },
      {
        de: "Wie finanzieren Sie Ihren Aufenthalt?",
        en: "How are you financing your stay?",
      },
      { de: "Das reicht so nicht aus.", en: "That is not sufficient." },
      {
        de: "Sie müssen das nachreichen.",
        en: "You will have to submit that later.",
      },
      {
        de: "Die Gebühr beträgt hundert Euro.",
        en: "The fee is one hundred euros.",
      },
    ],
    dialogue: [
      {
        them: "Guten Tag. Ihren Pass bitte. Worum geht es?",
        options: [
          {
            say: "Hier, bitte. Ich möchte meinen Aufenthaltstitel verlängern.",
            ok: true,
            next: 1,
          },
          {
            say: "Ich glaube, mein Visum ist abgelaufen.",
            ok: false,
            why: "Never open with a guess about your own status. Say what you came to do; he can read the date himself.",
            next: 1,
          },
        ],
      },
      {
        them: "Wann läuft er ab?",
        options: [
          { say: "Am einunddreißigsten März.", ok: true, next: 2 },
          {
            say: "Bald, glaube ich.",
            ok: false,
            why: "The date decides whether this is routine or a problem. Know it to the day before you sit down.",
            next: 2,
          },
        ],
      },
      {
        them: "Wie finanzieren Sie Ihren Aufenthalt?",
        options: [
          {
            say: "Über ein Sperrkonto. Hier ist der Nachweis.",
            ok: true,
            next: 3,
          },
          {
            say: "Meine Eltern schicken mir Geld.",
            ok: false,
            why: "True and unusable — this office runs on documents, not arrangements. The paper is the answer.",
            next: 3,
          },
        ],
      },
      {
        them: "Ihre Krankenversicherung fehlt. Das reicht so nicht aus.",
        options: [
          {
            say: "Verstanden. Bis wann muss ich das nachreichen?",
            ok: true,
            next: 4,
          },
          {
            say: "Kann ich das per E-Mail schicken?",
            ok: false,
            why: "Maybe — but the deadline matters more than the channel, and asking about email first often gets you a yes to the wrong question.",
            next: 4,
          },
        ],
      },
      {
        them: "Innerhalb von vier Wochen. Ihr Titel läuft vorher ab.",
        options: [
          {
            say: "Bekomme ich eine Fiktionsbescheinigung für die Zwischenzeit?",
            ok: true,
            next: -1,
          },
          {
            say: "Dann komme ich wieder, wenn ich alles habe.",
            ok: false,
            why: "Leaving without cover means a gap where you have no legal status — which affects work, travel and the next renewal. The word for the interim paper is Fiktionsbescheinigung, and it is worth learning.",
            next: -1,
          },
        ],
      },
    ],
  },

  {
    id: "surv-paket",
    level: "A1.2",
    ord: 10,
    title: "Paket abholen",
    why: "Deliveries in Germany go to a neighbour, a shop, or a Filiale, and the slip in your letterbox is in German. Small, frequent, and it teaches the vocabulary of every counter.",
    bring: ["Benachrichtigungskarte", "Personalausweis oder Reisepass"],
    scenario: {
      role: "a Postmitarbeiterin behind the counter, brisk, a queue behind you",
      goal: "Collect the parcel with the slip and your ID",
      opener: "Der Nächste bitte. Was kann ich für Sie tun?",
    },
    phrases: [
      {
        de: "Ich möchte ein Paket abholen.",
        en: "I would like to collect a parcel.",
      },
      {
        de: "Hier ist meine Benachrichtigungskarte.",
        en: "Here is my notification slip.",
      },
      { de: "Mein Name ist …", en: "My name is …" },
      { de: "Ich habe meinen Ausweis dabei.", en: "I have my ID with me." },
      {
        de: "Können Sie das bitte wiederholen?",
        en: "Could you repeat that, please?",
      },
      {
        de: "Wie lange liegt das Paket noch hier?",
        en: "How long will the parcel stay here?",
      },
    ],
    hear: [
      {
        de: "Haben Sie die Karte dabei?",
        en: "Do you have the slip with you?",
      },
      { de: "Ihren Ausweis bitte.", en: "Your ID, please." },
      { de: "Bitte hier unterschreiben.", en: "Please sign here." },
      {
        de: "Das Paket ist für jemand anderen.",
        en: "The parcel is for somebody else.",
      },
      { de: "Einen Moment, ich hole es.", en: "One moment, I will fetch it." },
      {
        de: "Da ist eine Nachgebühr fällig.",
        en: "There is a charge due on this.",
      },
    ],
    dialogue: [
      {
        them: "Der Nächste bitte. Was kann ich für Sie tun?",
        options: [
          { say: "Ich möchte ein Paket abholen.", ok: true, next: 1 },
          {
            say: "Ich habe eine Karte bekommen.",
            ok: false,
            why: "Understandable, but she gets forty of those a day. Say what you want first, show the card second.",
            next: 1,
          },
        ],
      },
      {
        them: "Haben Sie die Benachrichtigungskarte dabei?",
        options: [
          { say: "Ja, hier. Und mein Ausweis.", ok: true, next: 2 },
          {
            say: "Nein, die habe ich zu Hause.",
            ok: false,
            why: "Sometimes they will look it up by name and ID. Often they will not. The card is the whole point of the card.",
            next: 2,
          },
        ],
      },
      {
        them: "Danke. Einen Moment, ich hole es.",
        options: [
          { say: "Kein Problem.", ok: true, next: 3 },
          {
            say: "Beeilen Sie sich bitte.",
            ok: false,
            why: "Never. The queue is not her fault and this is a very small country for burning goodwill at a counter you will use again.",
            next: 3,
          },
        ],
      },
      {
        them: "So, hier ist es. Da ist noch eine Nachgebühr von vier Euro fällig.",
        options: [
          { say: "Wofür ist die Gebühr?", ok: true, next: 4 },
          {
            say: "Das war nicht angekündigt.",
            ok: false,
            why: "It usually was, on the slip. Ask what it is for — customs on a parcel from outside the EU is the common answer, and then it is simply true.",
            next: 4,
          },
        ],
      },
      {
        them: "Zoll, das Paket kommt aus Großbritannien. Bitte hier unterschreiben.",
        options: [
          { say: "Alles klar. Kann ich mit Karte zahlen?", ok: true, next: -1 },
          {
            say: "Ich habe kein Bargeld dabei.",
            ok: false,
            why: "Same thing, framed as a problem instead of a question. Ask what is possible rather than announcing what is not.",
            next: -1,
          },
        ],
      },
    ],
  },

  {
    id: "surv-handwerker",
    level: "B1.1",
    ord: 11,
    title: "Handwerker anrufen",
    why: "Describing a broken thing down a phone line, to someone who cannot see it, with no face to read. The hardest everyday German there is, and unavoidable the first winter your heating dies.",
    bring: [
      "Adresse und Etage",
      "Name des Vermieters oder der Hausverwaltung",
      "wann du zu Hause bist",
    ],
    scenario: {
      role: "a Handwerker taking the call between jobs, quick, slightly impatient, no video",
      goal: "Explain what is broken, and agree a time you can actually be there",
      opener: "Sanitär Berger, guten Tag?",
    },
    phrases: [
      {
        de: "Bei mir ist die Heizung ausgefallen.",
        en: "My heating has stopped working.",
      },
      {
        de: "Es tropft unter der Spüle.",
        en: "It is dripping under the sink.",
      },
      { de: "Seit gestern Abend.", en: "Since yesterday evening." },
      { de: "Wann könnten Sie kommen?", en: "When could you come?" },
      {
        de: "Ich bin ab sechzehn Uhr zu Hause.",
        en: "I am home from four o'clock.",
      },
      {
        de: "Die Hausverwaltung zahlt das.",
        en: "The property management pays for it.",
      },
    ],
    hear: [
      { de: "Was genau ist das Problem?", en: "What exactly is the problem?" },
      {
        de: "Seit wann geht das schon so?",
        en: "How long has it been like that?",
      },
      {
        de: "Sind Sie Mieter oder Eigentümer?",
        en: "Are you a tenant or the owner?",
      },
      { de: "Diese Woche wird schwierig.", en: "This week will be difficult." },
      {
        de: "Passt Ihnen Donnerstag zwischen zehn und zwölf?",
        en: "Does Thursday between ten and twelve suit you?",
      },
      {
        de: "Geben Sie mir bitte Ihre Adresse.",
        en: "Give me your address, please.",
      },
    ],
    dialogue: [
      {
        them: "Sanitär Berger, guten Tag?",
        options: [
          {
            say: "Guten Tag, Ahir mein Name. Bei mir ist die Heizung ausgefallen.",
            ok: true,
            next: 1,
          },
          {
            say: "Hallo, ich habe ein Problem.",
            ok: false,
            why: "On the phone he cannot see you and does not know you. Name, then the problem, in the first sentence — that is the German phone opening.",
            next: 1,
          },
        ],
      },
      {
        them: "Was genau ist das Problem? Wird sie gar nicht warm?",
        options: [
          {
            say: "Gar nicht. Sie macht Geräusche, aber sie bleibt kalt.",
            ok: true,
            next: 2,
          },
          {
            say: "Sie funktioniert nicht.",
            ok: false,
            why: "He is deciding which parts to put in the van. 'Does not work' fits fifty faults; noise-but-cold fits about three.",
            next: 2,
          },
        ],
      },
      {
        them: "Seit wann geht das so? Und sind Sie Mieter oder Eigentümer?",
        options: [
          { say: "Seit gestern Abend. Ich bin Mieter.", ok: true, next: 3 },
          {
            say: "Seit gestern.",
            ok: false,
            why: "Half answered. Tenant or owner decides who he invoices, and skipping it means he asks again or bills the wrong person.",
            next: 3,
          },
        ],
      },
      {
        them: "Diese Woche wird schwierig. Passt Ihnen Donnerstag zwischen acht und zwölf?",
        options: [
          {
            say: "Vormittags geht bei mir leider nicht. Ginge auch nachmittags?",
            ok: true,
            next: 4,
          },
          {
            say: "Ja, passt.",
            ok: false,
            why: "Agreeing to a slot you cannot make costs you the appointment and the next one. German tradesmen give four-hour windows and expect you there for all of it.",
            next: 4,
          },
        ],
      },
      {
        them: "Dann Donnerstag zwischen sechzehn und achtzehn Uhr. Ihre Adresse?",
        options: [
          {
            say: "Hauptstraße zwölf, dritter Stock. Die Hausverwaltung zahlt das.",
            ok: true,
            next: -1,
          },
          {
            say: "Hauptstraße zwölf.",
            ok: false,
            why: "The floor saves him ten minutes and you a missed call from the street. And saying who pays now avoids the invoice arriving in your name.",
            next: -1,
          },
        ],
      },
    ],
  },

  {
    id: "surv-nebenkosten",
    level: "B1.2",
    ord: 12,
    title: "Nebenkostenabrechnung",
    why: "Once a year a letter arrives saying you owe several hundred euros. Roughly half of these statements contain an error, and you have twelve months to object — in writing, in German.",
    bring: [
      "die Abrechnung selbst",
      "den Mietvertrag",
      "Zählerstände, falls du sie notiert hast",
      "die Abrechnung vom Vorjahr zum Vergleich",
    ],
    scenario: {
      role: "someone from the Hausverwaltung, defensive, well practised at ending these calls",
      goal: "Get the calculation explained, and a correction or a written answer in return",
      opener: "Hausverwaltung Mehring, was kann ich für Sie tun?",
    },
    phrases: [
      {
        de: "Ich habe eine Frage zur Nebenkostenabrechnung.",
        en: "I have a question about the service-charge statement.",
      },
      {
        de: "Die Nachzahlung erscheint mir sehr hoch.",
        en: "The back payment seems very high to me.",
      },
      {
        de: "Wie wurden die Heizkosten umgelegt?",
        en: "How were the heating costs apportioned?",
      },
      {
        de: "Ich möchte Einsicht in die Belege nehmen.",
        en: "I would like to inspect the receipts.",
      },
      {
        de: "Bitte senden Sie mir das schriftlich.",
        en: "Please send me that in writing.",
      },
      {
        de: "Ich widerspreche der Abrechnung.",
        en: "I am objecting to the statement.",
      },
    ],
    hear: [
      { de: "Um welche Wohnung geht es?", en: "Which flat is this about?" },
      { de: "Die Abrechnung ist korrekt.", en: "The statement is correct." },
      {
        de: "Das wird nach Quadratmetern umgelegt.",
        en: "That is apportioned by square metres.",
      },
      {
        de: "Die Energiepreise sind gestiegen.",
        en: "Energy prices have risen.",
      },
      {
        de: "Sie können die Belege einsehen.",
        en: "You may inspect the receipts.",
      },
      {
        de: "Der Betrag ist bereits fällig.",
        en: "The amount is already due.",
      },
    ],
    dialogue: [
      {
        them: "Hausverwaltung Mehring, was kann ich für Sie tun?",
        options: [
          {
            say: "Ahir, Hauptstraße zwölf. Ich habe eine Frage zur Nebenkostenabrechnung.",
            ok: true,
            next: 1,
          },
          {
            say: "Ihre Abrechnung stimmt nicht.",
            ok: false,
            why: "Opening with an accusation makes the next ten minutes a defence. Open with the flat and a question; keep the accusation in reserve.",
            next: 1,
          },
        ],
      },
      {
        them: "Moment … ja, ich sehe sie. Die Abrechnung ist korrekt.",
        options: [
          {
            say: "Möglich. Wie wurden die Heizkosten umgelegt?",
            ok: true,
            next: 2,
          },
          {
            say: "Das glaube ich nicht.",
            ok: false,
            why: "He has said it is correct; arguing that is a stalemate. Asking HOW it was calculated is the question he has to answer, and where the errors live.",
            next: 2,
          },
        ],
      },
      {
        them: "Nach Quadratmetern. Und die Energiepreise sind stark gestiegen.",
        options: [
          {
            say: "Mein Vertrag sagt siebzig Prozent nach Verbrauch. Können Sie das prüfen?",
            ok: true,
            next: 3,
          },
          {
            say: "Ja, das habe ich gelesen.",
            ok: false,
            why: "Heating must be at least fifty per cent by actual consumption by law. Square metres alone is the single most common error in these statements — and you just let it pass.",
            next: 3,
          },
        ],
      },
      {
        them: "Das müsste ich nachsehen. Der Betrag ist aber bereits fällig.",
        options: [
          {
            say: "Ich möchte zuerst Einsicht in die Belege nehmen.",
            ok: true,
            next: 4,
          },
          {
            say: "Dann überweise ich erst mal.",
            ok: false,
            why: "Paying is not an admission, but it removes every reason for anyone to hurry. You have the right to see the receipts, and asking is free.",
            next: 4,
          },
        ],
      },
      {
        them: "Die können Sie im Büro einsehen. Sonst noch etwas?",
        options: [
          {
            say: "Ja — bitte bestätigen Sie mir das Gespräch schriftlich.",
            ok: true,
            next: -1,
          },
          {
            say: "Nein, danke. Bis dann.",
            ok: false,
            why: "The objection period is twelve months and runs on paper. A phone call nobody wrote down did not happen.",
            next: -1,
          },
        ],
      },
    ],
  },
];

// ------------------------------------------------------------------ validate
const FILE = "data/scenarios-survival.json";
const data = JSON.parse(readFileSync(FILE, "utf8")) as Scenario[];

let problems = 0;
const fail = (m: string) => {
  console.error(`  ✗ ${m}`);
  problems++;
};

const seen = new Set(data.map((s) => s.id));
const ords = new Set(data.map((s) => s.ord));

for (const s of NEW) {
  if (seen.has(s.id)) fail(`${s.id}: already exists`);
  if (ords.has(s.ord)) fail(`${s.id}: ord ${s.ord} is taken`);
  seen.add(s.id);
  ords.add(s.ord);

  if (!/^(A1\.[12]|A2\.[12]|B1\.[12])$/.test(s.level))
    fail(`${s.id}: odd level ${s.level}`);
  if (s.phrases.length < 4) fail(`${s.id}: too few phrases`);
  if (s.hear.length < 4) fail(`${s.id}: too few hear lines`);
  if (!s.bring.length) fail(`${s.id}: nothing to bring`);
  for (const l of [...s.phrases, ...s.hear]) {
    if (!l.de.trim() || !l.en.trim()) fail(`${s.id}: empty line`);
  }

  const d = s.dialogue;
  if (d.length < 3) fail(`${s.id}: dialogue too short`);
  d.forEach((t, i) => {
    if (!t.them.trim()) fail(`${s.id} turn ${i}: empty prompt`);
    if (!t.options.some((o) => o.ok))
      fail(`${s.id} turn ${i}: no right answer`);
    for (const o of t.options) {
      if (!o.say.trim()) fail(`${s.id} turn ${i}: empty option`);
      if (!o.ok && !o.why)
        fail(`${s.id} turn ${i}: wrong answer with no explanation`);
      if (o.next !== -1 && (o.next <= i || o.next >= d.length)) {
        fail(`${s.id} turn ${i}: next=${o.next} is not a later turn or -1`);
      }
    }
  });
  if (!d.some((t) => t.options.some((o) => o.next === -1))) {
    fail(`${s.id}: the conversation never ends`);
  }
}

if (problems) {
  console.error(`\n  ${problems} problem(s) — nothing written.\n`);
  process.exit(1);
}

data.push(...NEW);
data.sort((a, b) => a.ord - b.ord);
writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");

const turns = NEW.reduce((n, s) => n + s.dialogue.length, 0);
const lines = NEW.reduce((n, s) => n + s.phrases.length + s.hear.length, 0);
console.log(
  `\n  ✓ ${NEW.length} scenarios · ${turns} dialogue turns · ${lines} phrases → ${FILE}` +
    `\n    ${data.length} in total\n`,
);
