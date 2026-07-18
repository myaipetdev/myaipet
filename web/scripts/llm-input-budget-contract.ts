import assert from "node:assert/strict";
import { callLLM, LLMInputError } from "../src/lib/llm/router";

async function main() {
  await assert.rejects(
    callLLM({
      task: "chat",
      budgetUserId: 1,
      messages: [{ role: "user", content: "x".repeat(65 * 1024) }],
    }),
    (error: unknown) => error instanceof LLMInputError,
  );

  await assert.rejects(
    callLLM({ task: "chat", messages: [{ role: "user", content: "hello" }] }),
    /authenticated budget user id/,
  );

  await assert.rejects(
    callLLM({
      task: "chat",
      budgetUserId: 1,
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 2_001,
    }),
    (error: unknown) => error instanceof LLMInputError,
  );

  process.stdout.write("PASS LLM input byte/output caps and pet-less budget identity\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "LLM input contract failed"}\n`);
  process.exitCode = 1;
});
