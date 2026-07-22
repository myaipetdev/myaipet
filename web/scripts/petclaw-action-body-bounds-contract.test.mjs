import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${webRoot}${path}`, "utf8");

const demo = read("src/app/api/petclaw/demo-chat/route.ts");
const interact = read("src/app/api/pets/[petId]/interact/route.ts");

for (const [name, route, cap] of [
  ["public synthetic demo", demo, /DEMO_CHAT_BODY_MAX_BYTES = 2 \* 1024/],
  ["paid pet interaction", interact, /INTERACT_BODY_MAX_BYTES = 1024/],
]) {
  assert.match(route, /readBoundedJsonBody\(req,/,
    `${name} must stream-parse within a fixed byte ceiling`);
  assert.match(route, cap, `${name} must declare a small explicit body ceiling`);
  assert.match(route, /reason === "too_large"[\s\S]*?status:[\s\S]*?413/,
    `${name} must report oversized requests truthfully`);
  assert.doesNotMatch(route, /req\.json\(/,
    `${name} must not materialize an unbounded request body`);
}

const demoRateLimit = demo.indexOf("rateLimit(req");
const demoBodyRead = demo.indexOf("readBoundedJsonBody(req");
assert.ok(demoRateLimit >= 0 && demoBodyRead > demoRateLimit,
  "public demo traffic must be rate-limited before parsing its body");

const interactAuth = interact.indexOf("await getUser(req)");
const interactBodyRead = interact.indexOf("readBoundedJsonBody(req");
const paidAction = interact.indexOf("executePetActionWithPaywall<");
assert.ok(interactAuth >= 0 && interactBodyRead > interactAuth,
  "interaction callers must authenticate before the server reads a body");
assert.ok(paidAction > interactBodyRead,
  "the bounded, validated body must precede any paid side effect");

console.log("petclaw_action_body_bounds_contract=PASS");
