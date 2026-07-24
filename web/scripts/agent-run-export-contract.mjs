import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidates = [];
    if (specifier.startsWith("@/")) {
      candidates.push(resolve(webRoot, "src", specifier.slice(2)));
    } else if (specifier === "@prisma/client/runtime/client") {
      candidates.push(resolve(webRoot, "node_modules/@prisma/client/runtime/client.js"));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidates.push(resolve(dirname(fileURLToPath(context.parentURL)), specifier));
    }
    for (const base of candidates) {
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

process.env.DATABASE_URL ||= [
  "postgresql",
  "://contract-test:contract-test",
  "@127.0.0.1:9/unused",
].join("");
process.env.JWT_SECRET ||= "agent-run-export-contract-secret-only";
process.env.NODE_ENV = "test";

const exporter = await import(pathToFileURL(resolve(
  webRoot,
  "src/lib/petclaw/agent-run-export.ts",
)));

const {
  AGENT_RUN_EXPORT_MAX_PAGE_BYTES,
  AGENT_RUN_EXPORT_MAX_RECORD_BYTES,
  AGENT_RUN_EXPORT_MAX_LIMIT,
  AGENT_RUN_EXPORT_SCHEMA,
  AgentRunExportError,
  computeAgentRunExportPageChecksum,
  exportOwnerAgentRunPageWithDb,
} = exporter;

const firstRunId = "10000000-0000-4000-8000-000000000003";
const scrubbedRunId = "10000000-0000-4000-8000-000000000002";
const thirdRunId = "10000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-07-24T10:00:00.000Z");
const row = (overrides = {}) => ({
  pet_id: 77,
  run_id: firstRunId,
  pet_name: "Contract Buddy",
  goal: "Summarize the decision while preserving <button> and code.",
  max_steps: 1,
  execution_contract: "office:summarize:v1:office-summarize",
  private_content_scrubbed: false,
  state: "terminal",
  completed: true,
  answer: "Decision summary",
  steps: [{
    id: "nested-db-id",
    skill: "office-summarize",
    input: {
      text: "<button>Ship</button>",
      api_key: "provider-secret",
      nested: {
        reservation_id: "reservation-secret",
        safe: "kept",
      },
    },
    output: {
      summary: "Ship",
      user_id: 999,
      internal_id: "internal-uuid-value",
      database_id: "database-uuid-value",
      dbPrimaryKey: "database-primary-key-value",
      request_id: "request-uuid-value",
      traceId: "trace-uuid-value",
      providerRunId: "provider-run-uuid-value",
      reservation: { reference: "reservation-object-value" },
      ...JSON.parse('{"__proto__":{"polluted":"must-not-export"}}'),
    },
  }],
  stopped_reason: "completed",
  billing: {
    outcome: "charged",
    creditsCharged: 5,
    reservationId: "reservation-secret",
    receipt: {
      safe: "kept",
      access_token: "provider-secret",
    },
  },
  credits_remaining: 95,
  created_at: createdAt,
  started_at: new Date("2026-07-24T10:00:01.000Z"),
  terminal_at: new Date("2026-07-24T10:00:02.000Z"),
  updated_at: new Date("2026-07-24T10:00:02.000Z"),
  ...overrides,
});

const rows = [
  row(),
  row({
    run_id: scrubbedRunId,
    pet_name: "Still-sensitive name",
    goal: "Still-sensitive goal",
    private_content_scrubbed: true,
    answer: "Still-sensitive answer",
    steps: [{ output: "Still-sensitive trace" }],
  }),
  row({
    run_id: thirdRunId,
    created_at: new Date("2026-07-24T09:00:00.000Z"),
  }),
];

const queries = [];
const ownershipQueries = [];
const fakeDatabase = {
  pet: {
    async findFirst(query) {
      ownershipQueries.push(query);
      return { name: "Contract Buddy" };
    },
  },
  petAgentRun: {
    async findMany(query) {
      queries.push(query);
      return queries.length === 1 ? rows : [rows[2]];
    },
  },
};

const firstPage = await exportOwnerAgentRunPageWithDb(fakeDatabase, 7, {
  petId: 77,
  limit: 2,
  exportedAt: new Date("2026-07-24T12:00:00.000Z"),
});

assert.deepEqual(
  ownershipQueries[0],
  {
    where: { id: 77, user_id: 7, is_active: true },
    select: { name: true },
  },
  "a requested pet scope must be independently proven against the authenticated owner",
);
assert.equal(queries[0].take, 3, "the query may read only one look-ahead row");
assert.deepEqual(queries[0].where, { user_id: 7, pet_id: 77 });
assert.deepEqual(
  queries[0].orderBy,
  [{ created_at: "desc" }, { run_id: "desc" }, { pet_id: "desc" }],
);
for (const field of ["id", "user_id", "reservation_id"]) {
  assert.equal(
    Object.hasOwn(queries[0].select, field),
    false,
    `the database projection must not select ${field}`,
  );
}
assert.equal(
  queries[0].select.pet_id,
  true,
  "the private pet-id tie-breaker is selected only for stable account pagination and receipt hashing",
);
assert.equal(queries[0].select.private_content_scrubbed, true);

assert.equal(firstPage.page.limit, 2);
assert.equal(firstPage.schema, "myaipet-owner-agent-run-history/v3");
assert.equal(firstPage.schema, AGENT_RUN_EXPORT_SCHEMA);
assert.equal(firstPage.page.count, 2);
assert.equal(firstPage.page.hasMore, true);
assert.match(firstPage.page.nextCursor, /^arc2\./);
assert.equal(
  firstPage.page.order,
  "createdAt:desc,reconciliationId:desc,privateTieBreaker:desc",
);
assert.equal(firstPage.page.byteBudget, AGENT_RUN_EXPORT_MAX_PAGE_BYTES);
assert.equal(firstPage.records.length, 2);
assert.equal(firstPage.records[0].reconciliationId, firstRunId);
assert.equal(firstPage.records[0].task.kind, "summarize");
assert.equal(firstPage.records[0].task.goal, "Summarize the decision while preserving <button> and code.");
assert.equal(firstPage.records[0].outcome.steps[0].input.text, "<button>Ship</button>");
assert.equal(firstPage.records[0].outcome.steps[0].input.nested.safe, "kept");
assert.equal(firstPage.records[0].billing.receipt.safe, "kept");

const firstRecordJson = JSON.stringify(firstPage.records[0]);
for (const forbidden of [
  "nested-db-id",
  "provider-secret",
  "reservation-secret",
  '"user_id"',
  '"reservationId"',
  '"__proto__"',
  "must-not-export",
  "internal-uuid-value",
  "database-uuid-value",
  "database-primary-key-value",
  "request-uuid-value",
  "trace-uuid-value",
  "provider-run-uuid-value",
  "reservation-object-value",
]) {
  assert.equal(
    firstRecordJson.includes(forbidden),
    false,
    `exported record must omit ${forbidden}`,
  );
}
for (const field of ["id", "runId", "userId", "petId", "reservationId"]) {
  assert.equal(Object.hasOwn(firstPage.records[0], field), false);
}
assert.equal(firstPage.records[0].receiptReference.length, 64);
assert.ok(firstPage.records[0].exportTreatment.redactedPrivateFields >= 5);

const scrubbed = firstPage.records[1];
assert.equal(scrubbed.contentRemoved, true);
assert.equal(scrubbed.petName, null);
assert.equal(scrubbed.task.goal, null);
assert.equal(scrubbed.outcome.answer, null);
assert.equal(scrubbed.outcome.steps, null);
assert.doesNotMatch(JSON.stringify(scrubbed), /Still-sensitive/);

const serializedFirstPage = JSON.parse(JSON.stringify(firstPage));
const { integrity, ...firstPageWithoutIntegrity } = serializedFirstPage;
assert.equal(
  integrity.sha256,
  computeAgentRunExportPageChecksum(firstPageWithoutIntegrity),
  "an independently parsed download must reproduce the documented checksum",
);
firstPageWithoutIntegrity.records[0].task.goal = "mutated after download";
assert.notEqual(
  integrity.sha256,
  computeAgentRunExportPageChecksum(firstPageWithoutIntegrity),
  "a nested payload mutation must invalidate the checksum",
);
const numericKeyChecksum = computeAgentRunExportPageChecksum({
  nested: { 2: "two", 10: "ten" },
});
assert.equal(
  numericKeyChecksum,
  createHash("sha256")
    .update('{"nested":{"10":"ten","2":"two"}}')
    .digest("hex"),
  "checksum canonicalization must use true lexicographic key order, including integer-like keys",
);

const packedCursorText = Buffer.from(
  firstPage.page.nextCursor.slice("arc2.".length),
  "base64url",
).toString("utf8");
assert.equal(
  packedCursorText.includes(scrubbedRunId),
  false,
  "the opaque cursor must not reveal the internal composite run boundary",
);

const secondPage = await exportOwnerAgentRunPageWithDb(fakeDatabase, 7, {
  petId: 77,
  limit: 2,
  cursor: firstPage.page.nextCursor,
  exportedAt: new Date("2026-07-24T12:01:00.000Z"),
});
assert.deepEqual(queries[1].where, {
  user_id: 7,
  pet_id: 77,
  OR: [
    { created_at: { lt: createdAt } },
    { created_at: createdAt, run_id: { lt: scrubbedRunId } },
    { created_at: createdAt, run_id: scrubbedRunId, pet_id: { lt: 77 } },
  ],
});
assert.equal(secondPage.page.hasMore, false);
assert.equal(secondPage.page.nextCursor, null);

await assert.rejects(
  exportOwnerAgentRunPageWithDb(fakeDatabase, 7, {
    petId: 78,
    cursor: firstPage.page.nextCursor,
  }),
  (error) => error instanceof AgentRunExportError && error.code === "invalid_cursor",
  "a cursor must be cryptographically bound to its pet scope",
);

await assert.rejects(
  exportOwnerAgentRunPageWithDb(fakeDatabase, 8, {
    petId: 77,
    cursor: firstPage.page.nextCursor,
  }),
  (error) => error instanceof AgentRunExportError && error.code === "invalid_cursor",
  "a cursor must be cryptographically bound to its authenticated owner",
);

const cursorChars = firstPage.page.nextCursor.split("");
const tamperIndex = Math.max("arc2.".length, cursorChars.length - 8);
cursorChars[tamperIndex] = cursorChars[tamperIndex] === "A" ? "B" : "A";
await assert.rejects(
  exportOwnerAgentRunPageWithDb(fakeDatabase, 7, {
    petId: 77,
    cursor: cursorChars.join(""),
  }),
  (error) => error instanceof AgentRunExportError && error.code === "invalid_cursor",
  "a one-byte cursor modification must fail authentication",
);
await assert.rejects(
  exportOwnerAgentRunPageWithDb(fakeDatabase, 7, {
    petId: 77,
    cursor: `${firstPage.page.nextCursor}!`,
  }),
  (error) => error instanceof AgentRunExportError && error.code === "invalid_cursor",
  "non-canonical base64url characters must invalidate an otherwise authentic cursor",
);

const cursorDatabase = {
  pet: { async findFirst() { return { name: "Contract Buddy" }; } },
  petAgentRun: { async findMany() { return rows; } },
};
const priorCursorSecret = process.env.AGENT_RUN_EXPORT_CURSOR_SECRET;
process.env.AGENT_RUN_EXPORT_CURSOR_SECRET = "cursor-secret-generation-a";
const secretBoundPage = await exportOwnerAgentRunPageWithDb(cursorDatabase, 7, { limit: 1 });
process.env.AGENT_RUN_EXPORT_CURSOR_SECRET = "cursor-secret-generation-b";
await assert.rejects(
  exportOwnerAgentRunPageWithDb(cursorDatabase, 7, {
    cursor: secretBoundPage.page.nextCursor,
    limit: 1,
  }),
  (error) => error instanceof AgentRunExportError && error.code === "invalid_cursor",
  "cursor-secret rotation must fail closed and require a page-one restart",
);
if (priorCursorSecret === undefined) delete process.env.AGENT_RUN_EXPORT_CURSOR_SECRET;
else process.env.AGENT_RUN_EXPORT_CURSOR_SECRET = priorCursorSecret;

let globalPetLookup = false;
let globalQuery;
await exportOwnerAgentRunPageWithDb({
  pet: {
    async findFirst() {
      globalPetLookup = true;
      return null;
    },
  },
  petAgentRun: {
    async findMany(query) {
      globalQuery = query;
      return [];
    },
  },
}, 7, { limit: AGENT_RUN_EXPORT_MAX_LIMIT + 900 });
assert.equal(globalPetLookup, false, "account-wide export must not require a live pet");
assert.equal(globalQuery.take, AGENT_RUN_EXPORT_MAX_LIMIT + 1);
assert.deepEqual(globalQuery.where, { user_id: 7 });

const scopeNameCredential = ["pck_", "scopeprivatevalue".repeat(2)].join("");
const scopedSecretPage = await exportOwnerAgentRunPageWithDb({
  pet: { async findFirst() { return { name: scopeNameCredential }; } },
  petAgentRun: { async findMany() { return []; } },
}, 7, { petId: 77, limit: 1 });
assert.equal(
  JSON.stringify(scopedSecretPage).includes(scopeNameCredential),
  false,
  "pet-scoped export metadata must sanitize a credential-shaped pet name",
);
assert.ok(scopedSecretPage.page.redactedCredentialValues >= 1);

await assert.rejects(
  exportOwnerAgentRunPageWithDb({
    pet: { async findFirst() { return null; } },
    petAgentRun: { async findMany() { throw new Error("must not query foreign runs"); } },
  }, 7, { petId: 999 }),
  (error) => error instanceof AgentRunExportError && error.code === "pet_not_owned",
);

const sentinelCollisionPage = await exportOwnerAgentRunPageWithDb({
  pet: { async findFirst() { throw new Error("account export must not look up a pet"); } },
  petAgentRun: {
    async findMany() {
      return [row({
        pet_name: "Deleted Pet",
        goal: "[deleted]",
        answer: "This is legitimate owner content, not a deletion sentinel.",
        private_content_scrubbed: false,
      })];
    },
  },
}, 7, { limit: 1 });
assert.equal(sentinelCollisionPage.records[0].contentRemoved, false);
assert.equal(sentinelCollisionPage.records[0].petName, "Deleted Pet");
assert.equal(sentinelCollisionPage.records[0].task.goal, "[deleted]");
assert.match(sentinelCollisionPage.records[0].outcome.answer, /legitimate owner content/);

function keysetDatabase(sourceRows) {
  const ordered = [...sourceRows].sort((left, right) => {
    const byDate = right.created_at.getTime() - left.created_at.getTime();
    const byRun = right.run_id.localeCompare(left.run_id);
    return byDate || byRun || right.pet_id - left.pet_id;
  });
  return {
    pet: { async findFirst() { throw new Error("account export must not look up a pet"); } },
    petAgentRun: {
      async findMany(query) {
        const boundaryDate = query.where.OR?.[0]?.created_at?.lt;
        const tieDate = query.where.OR?.[1]?.created_at;
        const boundaryRunId = query.where.OR?.[1]?.run_id?.lt;
        const privateTieDate = query.where.OR?.[2]?.created_at;
        const privateTieRunId = query.where.OR?.[2]?.run_id;
        const boundaryPetId = query.where.OR?.[2]?.pet_id?.lt;
        const filtered = boundaryDate
          && tieDate
          && boundaryRunId
          && privateTieDate
          && privateTieRunId
          && boundaryPetId
          ? ordered.filter((candidate) =>
              candidate.created_at < boundaryDate
              || (
                candidate.created_at.getTime() === tieDate.getTime()
                && candidate.run_id < boundaryRunId
              )
              || (
                candidate.created_at.getTime() === privateTieDate.getTime()
                && candidate.run_id === privateTieRunId
                && candidate.pet_id < boundaryPetId
              ))
          : ordered;
        return filtered.slice(0, query.take);
      },
    },
  };
}

const sameTimestamp = new Date("2026-07-24T13:00:00.000Z");
const sameTimestampRows = Array.from({ length: 201 }, (_unused, index) => row({
  run_id: `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
  created_at: sameTimestamp,
  started_at: sameTimestamp,
  terminal_at: sameTimestamp,
  updated_at: sameTimestamp,
}));
const walkedReconciliationIds = [];
let walkingCursor;
let walkedPages = 0;
do {
  const page = await exportOwnerAgentRunPageWithDb(keysetDatabase(sameTimestampRows), 7, {
    cursor: walkingCursor,
    limit: 37,
  });
  walkedPages += 1;
  walkedReconciliationIds.push(...page.records.map((record) => record.reconciliationId));
  walkingCursor = page.page.nextCursor || undefined;
  assert.ok(
    Buffer.byteLength(JSON.stringify(page), "utf8") <= AGENT_RUN_EXPORT_MAX_PAGE_BYTES,
    "every serialized page must remain inside its declared byte budget",
  );
} while (walkingCursor);
assert.equal(walkedPages, 6);
assert.equal(walkedReconciliationIds.length, 201);
assert.equal(new Set(walkedReconciliationIds).size, 201);
assert.deepEqual(
  [...walkedReconciliationIds].sort(),
  sameTimestampRows.map((candidate) => candidate.run_id).sort(),
  "same-timestamp keyset traversal must return every run exactly once",
);

const reusedRunId = "30000000-0000-4000-8000-000000000001";
const reusedRunRows = [
  row({ pet_id: 88, run_id: reusedRunId, pet_name: "Pet B", created_at: sameTimestamp }),
  row({ pet_id: 77, run_id: reusedRunId, pet_name: "Pet A", created_at: sameTimestamp }),
];
const reusedRunDatabase = keysetDatabase(reusedRunRows);
const reusedFirstPage = await exportOwnerAgentRunPageWithDb(reusedRunDatabase, 7, { limit: 1 });
const reusedSecondPage = await exportOwnerAgentRunPageWithDb(reusedRunDatabase, 7, {
  cursor: reusedFirstPage.page.nextCursor,
  limit: 1,
});
assert.equal(reusedFirstPage.records[0].reconciliationId, reusedRunId);
assert.equal(reusedSecondPage.records[0].reconciliationId, reusedRunId);
assert.notEqual(
  reusedFirstPage.records[0].receiptReference,
  reusedSecondPage.records[0].receiptReference,
  "same owner run UUID reused across two pets must retain two distinct receipt references",
);
assert.equal(
  new Set([
    reusedFirstPage.records[0].petName,
    reusedSecondPage.records[0].petName,
  ]).size,
  2,
  "the private tie-breaker must prevent same-time same-runId rows from being skipped",
);

let deepPayload = { leaf: "safe" };
for (let depth = 0; depth < 40; depth += 1) deepPayload = { child: deepPayload };
const concreteBearer = "Bearer abcdefghijklmnopqrstuvwxyz123456";
const concreteNpmToken = `npm_${"N".repeat(32)}`;
const concreteSignature = "signed-query-secret-value";
const concreteSasSignature = "azure-sas-signature-value";
const concreteCredential = ["AKIA", "IOSFODNN7EXAMPLE%2Fscope"].join("");
const concreteStoppedReasonSecret = "stopped-secret-value";
const credentialShapedPropertyKey = ["npm_", "M".repeat(32)].join("");
const multiCookie = [
  "Cookie: session=",
  "session-private-value",
  "; csrf=csrf-private-value; refresh=refresh-private-value",
].join("");
const mnemonicPhrase =
  "zephyr amber cobalt delta ember fjord galaxy harbor ivory juniper kestrel lantern";
const localizedOtp = "\uC778\uC99D\uCF54\uB4DC 87654321";
const legacyCredentialValues = [
  ["postgresql", "://legacy-owner:credential-pass", "@db.internal/run-history"].join(""),
  ["postgres", "://legacy-owner:credential-pass", "@db.internal/run-history"].join(""),
  ["mysql", "://legacy-owner:credential-pass", "@db.internal/run-history"].join(""),
  ["mongodb+srv", "://legacy-owner:credential-pass", "@db.internal/run-history"].join(""),
  ["AWS_SECRET_ACCESS_KEY", "=", "A".repeat(40)].join(""),
  ["ASIA", "B".repeat(16)].join(""),
  ["AIza", "C".repeat(35)].join(""),
  ["xoxb-", "D".repeat(32)].join(""),
  ["glpat-", "E".repeat(32)].join(""),
  ["hf_", "F".repeat(32)].join(""),
  ["ya29.", "G".repeat(32)].join(""),
  ["gho_", "H".repeat(32)].join(""),
  ["ghu_", "H".repeat(32)].join(""),
  ["ghs_", "H".repeat(32)].join(""),
  ["ghr_", "H".repeat(32)].join(""),
  ["github_pat_", "I".repeat(32)].join(""),
  ["pck_", "J".repeat(32)].join(""),
  ["pex_", "K".repeat(32)].join(""),
  ["Basic ", "L".repeat(32)].join(""),
  ["recovery_code=", "12345678"].join(""),
  ["-----BEGIN", "ENCRYPTED PRIVATE KEY-----\nlegacy-key-material"].join(" "),
  ["-----BEGIN", "DSA PRIVATE KEY-----\nlegacy-key-material"].join(" "),
  ["-----BEGIN", "PGP PRIVATE KEY BLOCK-----\nlegacy-key-material"].join(" "),
  "Authorization: Bearer shorttok",
  "Authorization: Basic dTpw",
  multiCookie,
  `mnemonic: ${mnemonicPhrase}`,
  ["AWS_SESSION_TOKEN", "=", "N".repeat(40)].join(""),
  ["STRIPE_SECRET_KEY", "=", "sk_live_", "O".repeat(32)].join(""),
  "password=P@ssw0rd!still-secret$tail",
  "OTP 12345678",
  localizedOtp,
  "recovery code 76543210",
  "backup code 65432109",
  "security code 54321098",
  "passcode 43210987",
  "2FA code 32109876",
  "\uBCF5\uAD6C\uCF54\uB4DC 21098765",
  "\uBC31\uC5C5 \uCF54\uB4DC 10987654",
  "\uBCF4\uC548 \uCF54\uB4DC 90876543",
];
const legacyCredentialAtoms = [
  "shorttok",
  "dTpw",
  "session-private-value",
  "csrf-private-value",
  "refresh-private-value",
  "lantern",
  "N".repeat(40),
  ["sk_live_", "O".repeat(32)].join(""),
  "still-secret$tail",
  "12345678",
  "87654321",
  "76543210",
  "65432109",
  "54321098",
  "43210987",
  "32109876",
  "21098765",
  "10987654",
  "90876543",
  credentialShapedPropertyKey,
];
const hostilePage = await exportOwnerAgentRunPageWithDb({
  pet: { async findFirst() { throw new Error("account export must not look up a pet"); } },
  petAgentRun: {
    async findMany() {
      return [row({
        goal: `${"G".repeat(8_180)} ${concreteNpmToken} ${"G".repeat(20_000)}`,
        answer: `Provider diagnostic ${concreteBearer} ${"A".repeat(100_000)}`,
        steps: [{
          output: {
            error: `request failed with ${concreteBearer}`,
            signedUrl:
              `https://objects.example/file?X-Amz-Credential=${concreteCredential}`
              + `&X-Amz-Signature=${concreteSignature}&sig=${concreteSasSignature}`,
            deep: deepPayload,
            many: Array.from({ length: 500 }, (_entry, index) => `entry-${index}`),
            wide: Object.fromEntries(
              Array.from({ length: 300 }, (_entry, index) => [`safe_field_${index}`, "safe"]),
            ),
            legacyDiagnostics: legacyCredentialValues,
            [credentialShapedPropertyKey]: "credential-shaped keys must be removed",
          },
        }],
        stopped_reason: `token=${concreteStoppedReasonSecret}`,
        billing: { outcome: "charged", providerDiagnostic: concreteNpmToken },
      })];
    },
  },
}, 7, { limit: 1 });
const hostileRecord = hostilePage.records[0];
const hostileJson = JSON.stringify(hostilePage);
for (const secret of [
  "abcdefghijklmnopqrstuvwxyz123456",
  concreteNpmToken,
  concreteSignature,
  concreteSasSignature,
  concreteCredential,
  concreteStoppedReasonSecret,
  ...legacyCredentialValues,
]) {
  assert.equal(hostileJson.includes(secret), false, `export must redact credential value ${secret}`);
}
for (const secretAtom of legacyCredentialAtoms) {
  assert.equal(
    hostileJson.includes(secretAtom),
    false,
    `export must remove the complete legacy credential atom ${secretAtom}`,
  );
}
assert.match(hostileJson, /\[REDACTED/);
assert.equal(
  hostileJson.includes("npm_"),
  false,
  "a credential crossing a truncation boundary must not leak even its token prefix",
);
assert.ok(
  hostileRecord.exportTreatment.redactedCredentialValues >= legacyCredentialValues.length + 4,
);
for (const reason of [
  "goal_length",
  "answer_length",
  "json_max_depth",
  "json_array_items",
  "json_object_keys",
]) {
  assert.ok(
    hostileRecord.exportTreatment.truncationReasons.includes(reason),
    `export treatment must disclose ${reason}`,
  );
}
assert.ok(
  Buffer.byteLength(JSON.stringify(hostileRecord), "utf8") <= AGENT_RUN_EXPORT_MAX_RECORD_BYTES,
);
assert.ok(
  Buffer.byteLength(hostileJson, "utf8") <= AGENT_RUN_EXPORT_MAX_PAGE_BYTES,
);

const byteHeavyRows = Array.from({ length: 40 }, (_unused, index) => row({
  run_id: `20000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
  goal: `Bounded page ${"G".repeat(20_000)}`,
  answer: `Bounded answer ${"A".repeat(100_000)}`,
  created_at: sameTimestamp,
  started_at: sameTimestamp,
  terminal_at: sameTimestamp,
  updated_at: sameTimestamp,
}));
const heavyDatabase = keysetDatabase(byteHeavyRows);
const heavyIds = [];
let heavyCursor;
let heavyPages = 0;
let firstHeavyCount = 0;
do {
  const page = await exportOwnerAgentRunPageWithDb(heavyDatabase, 7, {
    cursor: heavyCursor,
    limit: 100,
  });
  heavyPages += 1;
  if (heavyPages === 1) firstHeavyCount = page.page.count;
  heavyIds.push(...page.records.map((record) => record.reconciliationId));
  heavyCursor = page.page.nextCursor || undefined;
  assert.ok(Buffer.byteLength(JSON.stringify(page), "utf8") <= AGENT_RUN_EXPORT_MAX_PAGE_BYTES);
} while (heavyCursor);
assert.ok(firstHeavyCount < byteHeavyRows.length, "page bytes must bind before 40 oversized rows");
assert.ok(heavyPages > 1, "byte-bound traversal must continue through a dynamic cursor");
assert.equal(heavyIds.length, byteHeavyRows.length);
assert.equal(new Set(heavyIds).size, byteHeavyRows.length);

const route = readFileSync(resolve(
  webRoot,
  "src/app/api/account/agent-runs/export/route.ts",
), "utf8");
assert.match(route, /await getUser\(req\)/);
assert.match(route, /Cache-Control": "private, no-store"/);
assert.match(route, /X-Content-Type-Options": "nosniff"/);
assert.match(route, /limit > AGENT_RUN_EXPORT_MAX_LIMIT/);
assert.match(route, /pet_not_owned[\s\S]*status: 403/);
assert.match(route, /invalid_cursor[\s\S]*status: 400/);

const sovereignty = readFileSync(resolve(
  webRoot,
  "src/lib/petclaw/data-sovereignty.ts",
), "utf8");
const soulGeneration = sovereignty.slice(
  sovereignty.indexOf("export async function exportPetData"),
  sovereignty.indexOf("export async function importSoulData"),
);
assert.doesNotMatch(
  soulGeneration,
  /petAgentRun|agentRuns/,
  "normal SOUL generation must never read or embed unbounded paid-run history",
);
assert.match(
  sovereignty,
  /linkedData\.agentRuns[\s\S]*never creates runs or reservations[\s\S]*replays charges/,
  "legacy/custom SOUL imports must explicitly skip run and financial state",
);

const dashboard = readFileSync(resolve(webRoot, "src/components/SovereigntyDashboard.tsx"), "utf8");
assert.match(dashboard, /Start Account Run History Export/);
assert.match(dashboard, /error\?\.code === "invalid_cursor"[\s\S]*setRunHistoryCursor\(null\)/);
assert.match(dashboard, /the run-history export is complete/);
assert.match(dashboard, /at most 100 newest-first/);
assert.match(dashboard, /Continue until the receipt says complete/);
assert.match(dashboard, /api\.petclaw\.exportAgentRuns/);

const migration = readFileSync(resolve(
  webRoot,
  "prisma/migrations/20260724020000_pet_agent_run_scrub_marker/migration.sql",
), "utf8");
assert.match(migration, /ADD COLUMN "private_content_scrubbed" BOOLEAN NOT NULL DEFAULT false/);
assert.match(
  migration,
  /UPDATE "pet_agent_runs" AS r[\s\S]*SET "private_content_scrubbed" = true[\s\S]*r\."state" = 'terminal'[\s\S]*r\."pet_name" = 'Deleted Pet'[\s\S]*r\."goal" = '\[deleted\]'[\s\S]*r\."answer" = ''[\s\S]*r\."steps" = '\[\]'::jsonb/,
);
assert.match(
  migration,
  /NOT EXISTS[\s\S]*FROM "pets" AS p[\s\S]*p\."id" = r\."pet_id"[\s\S]*p\."user_id" = r\."user_id"/,
  "legacy backfill must never classify a sentinel collision while the owned Pet row still exists",
);

const exportSource = readFileSync(resolve(
  webRoot,
  "src/lib/petclaw/agent-run-export.ts",
), "utf8");
const projectRunSource = exportSource.slice(
  exportSource.indexOf("function projectRun"),
  exportSource.indexOf("export function computeAgentRunExportPageChecksum"),
);
assert.match(projectRunSource, /const contentRemoved = row\.private_content_scrubbed;/);
assert.doesNotMatch(projectRunSource, /Deleted Pet|\[deleted\]/);

for (const docsPath of [
  "public/api-docs/API.md",
  "public/api-docs/QUICKSTART.md",
  "../packages/petclaw/docs/API.md",
  "../packages/petclaw/docs/QUICKSTART.md",
]) {
  const doc = readFileSync(resolve(webRoot, docsPath), "utf8");
  assert.match(doc, /api\/account\/agent-runs\/export/);
  assert.match(doc, /reconciliationId/);
  assert.match(doc, /1,048,576/);
    assert.match(doc, /not (?:a (?:server|publisher) )?signature/i);
}
for (const docsPath of [
  "public/api-docs/API.md",
  "../packages/petclaw/docs/API.md",
]) {
  const doc = readFileSync(resolve(webRoot, docsPath), "utf8");
  assert.match(doc, /myaipet-owner-agent-run-history\/v3/);
  assert.match(doc, /lexicographic-json-v2/);
  assert.match(doc, /private tie-breaker/i);
}

console.log(JSON.stringify({
  ok: true,
  maxPageSize: AGENT_RUN_EXPORT_MAX_LIMIT,
  maxPageBytes: AGENT_RUN_EXPORT_MAX_PAGE_BYTES,
  maxRecordBytes: AGENT_RUN_EXPORT_MAX_RECORD_BYTES,
  firstPageCount: firstPage.page.count,
  secondPageCount: secondPage.page.count,
  sameTimestampRecords: walkedReconciliationIds.length,
  byteBoundPages: heavyPages,
  checksum: integrity.sha256,
}, null, 2));
