import assert from "node:assert/strict";
import {
  buildOfficeTextMessages,
  isOfficeDeliverableText,
  validateAndFormatOfficeDeliverable,
} from "../src/lib/petclaw/agent/office-text-tools";

const summary = validateAndFormatOfficeDeliverable(
  "office-summarize",
  JSON.stringify({
    summary: "The launch review found one blocking dependency and a clear owner decision.",
    keyFacts: [
      "The production switch remains disabled.",
      "The team cannot launch until the signed artifact passes smoke checks.",
    ],
    riskOrUnknown: "The final provider smoke result is still unknown.",
    nextStep: "Run the signed-artifact preflight and record its receipt.",
  }),
);
assert.ok(summary);
assert.match(summary.reply, /Key facts:/);
assert.match(summary.reply, /team cannot launch/);

assert.equal(
  validateAndFormatOfficeDeliverable(
    "office-summarize",
    "Here is a summary instead of the required JSON.",
  ),
  null,
);
assert.equal(
  validateAndFormatOfficeDeliverable(
    "office-review",
    JSON.stringify({
      issue: "I can't help with that request.",
      why: "The model returned a refusal instead of a useful review.",
      revision: "A complete revised version would normally appear in this field.",
    }),
  ),
  null,
);
assert.equal(
  validateAndFormatOfficeDeliverable(
    "office-draft",
    JSON.stringify({ draft: "안녕하세요. This output crosses the English-only boundary." }),
  ),
  null,
);
assert.ok(
  validateAndFormatOfficeDeliverable(
    "office-review",
    JSON.stringify({
      issue: "The main request is buried beneath background detail.",
      why: "A reader cannot quickly identify the decision that is needed.",
      revision: "Please approve the signed release after the preflight and smoke checks pass.",
    }),
  ),
);
assert.ok(
  validateAndFormatOfficeDeliverable(
    "office-draft",
    JSON.stringify({
      draft: "Please review the attached launch checklist and reply with any blocking issue by noon.",
    }),
  ),
);

assert.equal(isOfficeDeliverableText("I can't help with that."), false);
assert.equal(isOfficeDeliverableText("I can't wait to share the launch update with the team."), true);
assert.equal(isOfficeDeliverableText("I can't find a recorded decision after Tuesday."), true);
assert.equal(
  isOfficeDeliverableText("We cannot launch until the signed artifact passes every smoke check."),
  true,
);
assert.equal(isOfficeDeliverableText("A valid grounded recall answer."), true);
assert.equal(isOfficeDeliverableText("기억을 찾았습니다."), false);

const developerText = '<button aria-label="Save">Save</button>\n<script>const total = 2 < 3;</script>';
const providerEnvelope = buildOfficeTextMessages("office-review", { text: developerText });
const parsedProviderEnvelope = JSON.parse(providerEnvelope.user);
assert.equal(parsedProviderEnvelope.dataClassification, "untrusted_owner_input");
assert.equal(parsedProviderEnvelope.taskFrame, "review_text");
assert.equal(
  parsedProviderEnvelope.content,
  developerText,
  "provider framing must preserve developer HTML/JSX/XML/code characters exactly",
);
assert.doesNotMatch(providerEnvelope.user, /‹|›/);

console.log("office_deliverable_contract=PASS");
