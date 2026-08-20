/** IMU 8x8 Challenge rubric from content/8x8/*.pdf */

export const EIGHT_BY_EIGHT_VERSION = "8x8-v1";

export type CriterionGroup = "tips" | "knaller";
export type CriterionKind = "layout" | "presence" | "copy";

export type RubricCriterion = {
  id: string;
  label: string;
  group: CriterionGroup;
  kind: CriterionKind;
  weight: number;
  hint: string;
};

export const EIGHT_BY_EIGHT_CRITERIA: RubricCriterion[] = [
  {
    id: "tips_tempt",
    label: "Tempt — hero",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Pakkende headline, beeld of video, pijn/behoefte/resultaat, USPs.",
  },
  {
    id: "tips_influence",
    label: "Influence — vertrouwen",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Verhaal of autoriteit, plus social proof.",
  },
  {
    id: "tips_persuade",
    label: "Persuade — voordelen",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Voordelen i.p.v. specs, bullets, wat de klant misloopt.",
  },
  {
    id: "tips_sell",
    label: "Sell — aanbod + CTA",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Product, prijs, opvallende knop, FAQ/garantie, CTA onderaan.",
  },
  {
    id: "one_cta",
    label: "1. Eén call-to-action",
    group: "knaller",
    kind: "presence",
    weight: 10,
    hint: "Geen extra menu, zijbalk, footer-links of links in de tekst.",
  },
  {
    id: "steady_target",
    label: "2. Steady → target",
    group: "knaller",
    kind: "copy",
    weight: 8,
    hint: "Huidige pijn vs gewenste situatie, liefst contrast (voor/na).",
  },
  {
    id: "emotion_over_specs",
    label: "3. Emotie boven specs",
    group: "knaller",
    kind: "copy",
    weight: 7,
    hint: "Eindresultaat en gevoel, geen technische eigenschappen.",
  },
  {
    id: "bite_size",
    label: "4. Hapklare blokken",
    group: "knaller",
    kind: "presence",
    weight: 7,
    hint: "Korte titels, beeld bij tekst, geen lappen tekst.",
  },
  {
    id: "start_with_end",
    label: "5. Start with the end",
    group: "knaller",
    kind: "presence",
    weight: 5,
    hint: "Sterke open + close (CTA onderaan), of progress.",
  },
  {
    id: "specific_proof",
    label: "6. Specifieke proof in groepen",
    group: "knaller",
    kind: "presence",
    weight: 8,
    hint: "Testimonials in groepen van 3+, met naam/detail, gekoppeld aan voordelen.",
  },
  {
    id: "urgency",
    label: "7. Urgentie",
    group: "knaller",
    kind: "presence",
    weight: 8,
    hint: "Timer, schaarste, deadline of tijdelijke bonus.",
  },
  {
    id: "aftercare",
    label: "8. Garantie / bezwaren weg",
    group: "knaller",
    kind: "presence",
    weight: 7,
    hint: "FAQ, garantie of money-back op de salespage (bedanktpagina is apart).",
  },
];
