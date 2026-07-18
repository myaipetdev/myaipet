/** Live end-to-end router probe. Uses synthetic text only and never prints it. */
import { callLLM } from "../src/lib/llm/router";

async function main() {
  const result = await callLLM({
    task: "chat",
    // Operational smoke calls have no pet. Use a reserved non-user identity so
    // they remain inside the persistent global and per-caller spend guards.
    budgetUserId: 2_147_483_647,
    messages: [
      { role: "system", content: "PetClaw synthetic production router check." },
      { role: "user", content: "Reply with a short acknowledgement." },
    ],
    temperature: 0,
    max_tokens: 24,
  });
  if (result.source !== "platform" || !result.text.trim()) {
    throw new Error("router returned an invalid synthetic result");
  }
  console.log(`router_provider=${result.provider} model=${result.model} source=${result.source} text_nonempty=true`);
}

main().catch((error) => {
  console.error(`router_smoke_failed=${error instanceof Error ? error.name : "unknown"}`);
  process.exit(1);
});
