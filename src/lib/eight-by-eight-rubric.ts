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
    hint: "Punchy headline, image or video, pain/desire/outcome, USPs.",
  },
  {
    id: "tips_influence",
    label: "Influence — trust",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Story or authority, plus social proof.",
  },
  {
    id: "tips_persuade",
    label: "Persuade — benefits",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Benefits not specs, bullets, and what they miss if they don't buy.",
  },
  {
    id: "tips_sell",
    label: "Sell — offer + CTA",
    group: "tips",
    kind: "layout",
    weight: 10,
    hint: "Product, price, a clear button, FAQ/guarantee, CTA at the bottom.",
  },
  {
    id: "one_cta",
    label: "1. One call-to-action",
    group: "knaller",
    kind: "presence",
    weight: 10,
    hint: "No extra menu, sidebar, footer links, or in-copy links.",
  },
  {
    id: "steady_target",
    label: "2. Steady → target",
    group: "knaller",
    kind: "copy",
    weight: 8,
    hint: "Current pain vs desired state, ideally with before/after contrast.",
  },
  {
    id: "emotion_over_specs",
    label: "3. Emotion over specs",
    group: "knaller",
    kind: "copy",
    weight: 7,
    hint: "End result and feeling — not technical features.",
  },
  {
    id: "bite_size",
    label: "4. Bite-sized blocks",
    group: "knaller",
    kind: "presence",
    weight: 7,
    hint: "Short titles, image with text, no walls of copy.",
  },
  {
    id: "start_with_end",
    label: "5. Start with the end",
    group: "knaller",
    kind: "presence",
    weight: 5,
    hint: "Strong open and close (CTA at the bottom), or a progress cue.",
  },
  {
    id: "specific_proof",
    label: "6. Specific proof in groups",
    group: "knaller",
    kind: "presence",
    weight: 8,
    hint: "Testimonials in groups of 3+, with name/detail, tied to benefits.",
  },
  {
    id: "urgency",
    label: "7. Urgency",
    group: "knaller",
    kind: "presence",
    weight: 8,
    hint: "Timer, scarcity, deadline, or a time-limited bonus.",
  },
  {
    id: "aftercare",
    label: "8. Guarantee / objections",
    group: "knaller",
    kind: "presence",
    weight: 7,
    hint: "FAQ, guarantee, or money-back on the sales page (thank-you is separate).",
  },
];
