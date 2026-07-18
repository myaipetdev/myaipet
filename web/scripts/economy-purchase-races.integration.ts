import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function verifyRouteContracts(): Promise<void> {
  const [shield, repair, slots, skills, streakEngine] = await Promise.all([
    readFile(new URL("../src/app/api/streak/shield/buy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/streak/repair/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/pets/slots/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/skills/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/missions/streak.ts", import.meta.url), "utf8"),
  ]);

  assert.match(shield, /buyStreakShield\(\{/);
  assert.match(shield, /expectedUpdatedAt: s\.updated_at/);
  assert.doesNotMatch(shield, /credits: \{ decrement/);
  assert.match(repair, /repairStreak\(\{/);
  assert.match(repair, /expectedUpdatedAt: s\.updated_at/);
  assert.doesNotMatch(repair, /credits: \{ decrement/);
  assert.match(slots, /purchasePetSlot\(\{/);
  assert.match(slots, /expectedPetSlots: user\.pet_slots/);
  assert.doesNotMatch(slots, /SLOT_PRICES\[nextSlotIndex\]/);
  assert.match(skills, /upgradeSkill\(\{/);
  assert.match(skills, /expectedLevel: skill\.level/);
  assert.doesNotMatch(skills, /data: \{ level: \{ increment: 1 \} \}/);
  assert.match(streakEngine, /return prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(streakEngine, /lockStreakOwnerAndState\(tx, userId\)/);
}

function requireDedicatedDatabase(connectionString: string): void {
  let databaseName = "";
  try {
    databaseName = new URL(connectionString).pathname.slice(1);
  } catch {
    throw new Error("ECONOMY_RACE_TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!databaseName.includes("economy_race_test")) {
    throw new Error("Refusing economy race integration outside an economy_race_test database");
  }
}

async function main(): Promise<void> {
  await verifyRouteContracts();

  const connectionString = process.env.ECONOMY_RACE_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("PASS economy purchase route contracts");
    console.log("SKIP economy PostgreSQL race integration: set ECONOMY_RACE_TEST_DATABASE_URL");
    return;
  }
  requireDedicatedDatabase(connectionString);

  const schema = `economy_race_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Pool({ connectionString, max: 40 });
  let schemaCreated = false;
  let appPrisma: any;
  let defaultPrisma: any;

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await admin.query(`
      CREATE TABLE "${schema}"."users" (
        "id" integer PRIMARY KEY,
        "wallet_address" varchar(42) NOT NULL UNIQUE,
        "nonce" varchar(32) NOT NULL,
        "credits" integer NOT NULL DEFAULT 0,
        "pet_slots" integer NOT NULL DEFAULT 1,
        "season_points" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "last_active_at" timestamptz NOT NULL DEFAULT now(),
        "successor_wallet" varchar(42)
      );
      CREATE TABLE "${schema}"."pets" (
        "id" integer PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "${schema}"."users"("id"),
        "name" varchar(50) NOT NULL,
        "species" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      );
      CREATE TABLE "${schema}"."pet_skills" (
        "id" integer PRIMARY KEY,
        "pet_id" integer NOT NULL REFERENCES "${schema}"."pets"("id"),
        "skill_key" varchar(30) NOT NULL,
        "level" integer NOT NULL DEFAULT 1,
        "slot" integer,
        "unlocked_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("pet_id", "skill_key")
      );
      CREATE TABLE "${schema}"."user_streaks" (
        "user_id" integer PRIMARY KEY REFERENCES "${schema}"."users"("id"),
        "current_streak" integer NOT NULL DEFAULT 0,
        "longest_streak" integer NOT NULL DEFAULT 0,
        "last_completed_date" varchar(10),
        "shields_owned" integer NOT NULL DEFAULT 0,
        "shields_used" integer NOT NULL DEFAULT 0,
        "last_shield_used_at" timestamptz,
        "total_missions_done" integer NOT NULL DEFAULT 0,
        "total_points_earned" integer NOT NULL DEFAULT 0,
        "pending_apology" boolean NOT NULL DEFAULT false,
        "pending_apology_days" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}"."streak_purchases" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "${schema}"."users"("id"),
        "kind" varchar(30) NOT NULL,
        "price_usd" double precision NOT NULL,
        "paid_via" varchar(20) NOT NULL,
        "paid_credits" integer,
        "tx_hash" varchar(66),
        "streak_before" integer NOT NULL,
        "streak_after" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await admin.query(`
      INSERT INTO "${schema}"."users"
        ("id", "wallet_address", "nonce", "credits", "pet_slots")
      VALUES (1, '0x0000000000000000000000000000000000000001', 'test-nonce', 5000, 1);
      INSERT INTO "${schema}"."pets" ("id", "user_id", "name", "species")
      VALUES (1, 1, 'Race Pet', 0);
      INSERT INTO "${schema}"."pet_skills" ("id", "pet_id", "skill_key", "level")
      VALUES (1, 1, 'scratch', 1);
      INSERT INTO "${schema}"."user_streaks"
        ("user_id", "current_streak", "longest_streak", "last_completed_date", "shields_owned", "updated_at")
      VALUES (1, 1, 10, '2026-07-15', 2, '2026-07-18T00:00:00Z');
    `);

    process.env.DATABASE_URL = connectionString;
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("../src/generated/prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    appPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }),
    } as any);

    const streak = await import("../src/lib/streakPurchases");
    const slots = await import("../src/lib/petSlots");
    const skills = await import("../src/lib/skillUpgrade");
    ({ prisma: defaultPrisma } = await import("../src/lib/prisma"));

    const sharedVersion = new Date("2026-07-18T00:00:00.000Z");
    const shieldAttempts = await Promise.all(
      Array.from({ length: 32 }, async () => {
        try {
          await streak.buyStreakShieldWithDb(appPrisma, {
            userId: 1,
            expectedUpdatedAt: sharedVersion,
          });
          return "ok";
        } catch (error) {
          if (error instanceof streak.StreakStateConflictError) return "conflict";
          throw error;
        }
      }),
    );
    assert.equal(shieldAttempts.filter((result) => result === "ok").length, 1);
    assert.equal(shieldAttempts.filter((result) => result === "conflict").length, 31);
    const audit = await admin.query<{
      credits: number;
      shields: number;
      purchases: number;
      paid: number;
    }>(`
      SELECT
        (SELECT "credits" FROM "${schema}"."users" WHERE "id" = 1)::int AS "credits",
        (SELECT "shields_owned" FROM "${schema}"."user_streaks" WHERE "user_id" = 1)::int AS "shields",
        (SELECT count(*) FROM "${schema}"."streak_purchases")::int AS "purchases",
        (SELECT COALESCE(sum("paid_credits"), 0) FROM "${schema}"."streak_purchases")::int AS "paid"
    `);
    assert.deepEqual(audit.rows[0], { credits: 4900, shields: 3, purchases: 1, paid: 100 });

    await admin.query(`
      DELETE FROM "${schema}"."streak_purchases";
      UPDATE "${schema}"."users" SET "credits" = 5000, "updated_at" = now() WHERE "id" = 1;
      UPDATE "${schema}"."user_streaks"
      SET "current_streak" = 1,
          "longest_streak" = 10,
          "last_completed_date" = '2026-07-15',
          "pending_apology" = true,
          "pending_apology_days" = 2,
          "updated_at" = '2026-07-18T00:00:01Z'
      WHERE "user_id" = 1;
    `);
    const repairVersion = new Date("2026-07-18T00:00:01.000Z");
    const repairAttempts = await Promise.all(
      Array.from({ length: 32 }, async () => {
        try {
          await streak.repairStreakWithDb(appPrisma, {
            userId: 1,
            expectedUpdatedAt: repairVersion,
            today: "2026-07-18",
          });
          return "ok";
        } catch (error) {
          if (error instanceof streak.StreakStateConflictError) return "conflict";
          throw error;
        }
      }),
    );
    assert.equal(repairAttempts.filter((result) => result === "ok").length, 1);
    assert.equal(repairAttempts.filter((result) => result === "conflict").length, 31);
    const repairAudit = await admin.query<{
      credits: number;
      current_streak: number;
      last_completed_date: string;
      purchases: number;
      paid: number;
    }>(`
      SELECT
        (SELECT "credits" FROM "${schema}"."users" WHERE "id" = 1)::int AS "credits",
        (SELECT "current_streak" FROM "${schema}"."user_streaks" WHERE "user_id" = 1)::int AS "current_streak",
        (SELECT "last_completed_date" FROM "${schema}"."user_streaks" WHERE "user_id" = 1) AS "last_completed_date",
        (SELECT count(*) FROM "${schema}"."streak_purchases")::int AS "purchases",
        (SELECT COALESCE(sum("paid_credits"), 0) FROM "${schema}"."streak_purchases")::int AS "paid"
    `);
    assert.deepEqual(repairAudit.rows[0], {
      credits: 4500,
      current_streak: 11,
      last_completed_date: "2026-07-18",
      purchases: 1,
      paid: 500,
    });

    await admin.query(`UPDATE "${schema}"."users" SET "credits" = 1000, "pet_slots" = 1 WHERE "id" = 1`);
    const slotAttempts = await Promise.all(
      Array.from({ length: 32 }, async () => {
        try {
          return await slots.purchasePetSlotWithDb(appPrisma, { userId: 1, expectedPetSlots: 1 });
        } catch (error) {
          if (error instanceof slots.PetSlotPurchaseConflictError) return null;
          throw error;
        }
      }),
    );
    const slotWins = slotAttempts.filter((result) => result !== null);
    assert.equal(slotWins.length, 1);
    assert.equal(slotWins[0]?.pricePaid, 50);
    const nextSlot = await slots.purchasePetSlotWithDb(appPrisma, { userId: 1, expectedPetSlots: 2 });
    assert.deepEqual(nextSlot, { petSlots: 3, credits: 850, pricePaid: 100 });

    await admin.query(`
      UPDATE "${schema}"."users" SET "credits" = 1000 WHERE "id" = 1;
      UPDATE "${schema}"."pet_skills" SET "level" = 1 WHERE "id" = 1;
    `);
    const skillAttempts = await Promise.all(
      Array.from({ length: 32 }, async () => {
        try {
          return await skills.upgradeSkillWithDb(appPrisma, {
            userId: 1,
            petId: 1,
            skillKey: "scratch",
            expectedLevel: 1,
            maxLevel: 5,
            rarity: 2,
          });
        } catch (error) {
          if (error instanceof skills.SkillUpgradeConflictError) return null;
          throw error;
        }
      }),
    );
    const skillWins = skillAttempts.filter((result) => result !== null);
    assert.equal(skillWins.length, 1);
    assert.equal(skillWins[0]?.creditsSpent, 60);
    const nextSkill = await skills.upgradeSkillWithDb(appPrisma, {
      userId: 1,
      petId: 1,
      skillKey: "scratch",
      expectedLevel: 2,
      maxLevel: 5,
      rarity: 2,
    });
    assert.deepEqual(nextSkill, { newLevel: 3, creditsSpent: 120, creditsRemaining: 820 });

    console.log("PASS economy PostgreSQL races (32-way shield/repair/slot/skill CAS)");
  } finally {
    if (appPrisma) await appPrisma.$disconnect();
    if (defaultPrisma) await defaultPrisma.$disconnect();
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
