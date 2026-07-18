import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function verifyContract(): Promise<void> {
  const [route, helper] = await Promise.all([
    readFile(new URL("../src/app/api/shop/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/shopPurchase.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /parseShopPetId\(pet_id\)/);
  assert.match(route, /purchaseShopItem\(\{ userId: user\.id, petId: parsedPetId/);
  assert.doesNotMatch(route, /prisma\.petEquippedItem/);
  assert.doesNotMatch(route, /Number\(pet_id\)/);
  assert.match(helper, /return db\.\$transaction\(async \(tx\) =>/);
  assert.match(helper, /AND "user_id" = \$\{input\.userId\}/);
  assert.match(helper, /AND "is_active" = true/);
  assert.match(helper, /FROM "users"[\s\S]*FOR UPDATE/);
  assert.match(helper, /alreadyOwned/);
  assert.match(helper, /await tx\.itemPurchase\.create/);
  assert.match(helper, /await tx\.petEquippedItem\.upsert/);
}

async function main(): Promise<void> {
  await verifyContract();

  const connectionString = process.env.SHOP_PURCHASE_TEST_DATABASE_URL;
  if (!connectionString) {
    console.log("SKIP shop purchase PG integration: set SHOP_PURCHASE_TEST_DATABASE_URL");
    return;
  }
  const databaseName = (() => {
    try { return new URL(connectionString).pathname.slice(1); } catch { return ""; }
  })();
  if (!databaseName.includes("shop_purchase_test")) {
    throw new Error("Refusing shop integration outside a shop_purchase_test database");
  }

  const schema = `shop_purchase_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Pool({ connectionString });
  let created = false;
  let appPrisma: any;
  let defaultPrisma: any;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`
      CREATE TABLE "${schema}"."users" (
        "id" integer PRIMARY KEY,
        "credits" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}"."pets" (
        "id" integer PRIMARY KEY,
        "user_id" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "happiness" integer NOT NULL DEFAULT 70,
        "energy" integer NOT NULL DEFAULT 100,
        "hunger" integer NOT NULL DEFAULT 30,
        "bond_level" integer NOT NULL DEFAULT 0,
        "experience" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}"."shop_items" (
        "id" integer PRIMARY KEY,
        "key" varchar(40) NOT NULL UNIQUE,
        "name" varchar(60) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(20) NOT NULL,
        "rarity" varchar(15) NOT NULL DEFAULT 'common',
        "price" integer NOT NULL,
        "icon" varchar(10) NOT NULL,
        "stat_bonus" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}"."item_purchases" (
        "id" bigserial PRIMARY KEY,
        "user_id" integer NOT NULL,
        "item_id" integer NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "total_cost" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "${schema}"."pet_equipped_items" (
        "id" bigserial PRIMARY KEY,
        "pet_id" integer NOT NULL,
        "item_id" integer NOT NULL,
        "slot" varchar(20) NOT NULL,
        "equipped_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("pet_id", "slot")
      );
      CREATE FUNCTION "${schema}"."reject_broken_equipment"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."item_id" = 2 THEN
          RAISE EXCEPTION 'synthetic equip failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "reject_broken_equipment"
      BEFORE INSERT OR UPDATE ON "${schema}"."pet_equipped_items"
      FOR EACH ROW EXECUTE FUNCTION "${schema}"."reject_broken_equipment"();
    `);
    await admin.query(`
      INSERT INTO "${schema}"."users" ("id", "credits") VALUES (1, 1000), (2, 1000);
      INSERT INTO "${schema}"."pets" ("id", "user_id", "is_active")
      VALUES (1, 1, true), (2, 2, true), (3, 1, false);
      INSERT INTO "${schema}"."shop_items"
        ("id", "key", "name", "description", "category", "price", "icon", "stat_bonus")
      VALUES
        (1, 'bow', 'Bow', 'Safe accessory', 'accessory', 100, 'A', '{}'),
        (2, 'broken', 'Broken', 'Fails during equip', 'accessory', 50, 'B', '{}'),
        (3, 'snack', 'Snack', 'Adds happiness', 'consumable', 20, 'S', '{"happiness": 5}'),
        (4, 'armor', 'Armor', 'Unimplemented passive', 'equipment', 100, 'R', '{}');
    `);

    process.env.DATABASE_URL = connectionString;
    const shop = await import("../src/lib/shopPurchase");
    ({ prisma: defaultPrisma } = await import("../src/lib/prisma"));
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("../src/generated/prisma/client"),
      import("@prisma/adapter-pg"),
    ]);
    appPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }),
    } as any);
    const purchase = (input: { userId: number; petId: number; itemKey: string }) =>
      shop.purchaseShopItemWithDb(appPrisma, input);

    assert.equal(shop.parseShopPetId("1"), 1);
    for (const invalid of [undefined, null, "", "1.5", "01", -1, 0, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(shop.parseShopPetId(invalid), null);
    }

    await assert.rejects(
      purchase({ userId: 1, petId: 2, itemKey: "bow" }),
      shop.ShopPetUnavailableError,
    );
    await assert.rejects(
      purchase({ userId: 1, petId: 3, itemKey: "bow" }),
      shop.ShopPetUnavailableError,
    );
    let audit = await admin.query<{ credits: number; purchases: number; equips: number }>(`
      SELECT
        (SELECT "credits" FROM "${schema}"."users" WHERE "id" = 1)::int AS "credits",
        (SELECT count(*) FROM "${schema}"."item_purchases")::int AS "purchases",
        (SELECT count(*) FROM "${schema}"."pet_equipped_items")::int AS "equips"
    `);
    assert.deepEqual(audit.rows[0], { credits: 1000, purchases: 0, equips: 0 });

    await assert.rejects(
      purchase({ userId: 1, petId: 1, itemKey: "armor" }),
      shop.ShopItemUnavailableError,
    );

    await assert.rejects(
      purchase({ userId: 1, petId: 1, itemKey: "broken" }),
      /synthetic equip failure/,
    );
    audit = await admin.query(`
      SELECT
        (SELECT "credits" FROM "${schema}"."users" WHERE "id" = 1)::int AS "credits",
        (SELECT count(*) FROM "${schema}"."item_purchases")::int AS "purchases",
        (SELECT count(*) FROM "${schema}"."pet_equipped_items")::int AS "equips"
    `);
    assert.deepEqual(audit.rows[0], { credits: 1000, purchases: 0, equips: 0 }, "equip failure must roll back debit and receipt");

    const snack = await purchase({ userId: 1, petId: 1, itemKey: "snack" });
    assert.equal(snack.creditsSpent, 21);
    const pet = await admin.query<{ happiness: number }>(
      `SELECT "happiness" FROM "${schema}"."pets" WHERE "id" = 1`,
    );
    assert.equal(pet.rows[0]?.happiness, 75);

    await admin.query(`
      DELETE FROM "${schema}"."item_purchases";
      DELETE FROM "${schema}"."pet_equipped_items";
      UPDATE "${schema}"."users" SET "credits" = 1000 WHERE "id" = 1;
    `);
    const attempts = await Promise.all(
      Array.from({ length: 32 }, async () => {
        try {
          await purchase({ userId: 1, petId: 1, itemKey: "bow" });
          return true;
        } catch (error) {
          if (error instanceof shop.ShopItemAlreadyOwnedError) return false;
          throw error;
        }
      }),
    );
    assert.equal(attempts.filter(Boolean).length, 1, "32 concurrent buy-once purchases may debit exactly once");
    audit = await admin.query(`
      SELECT
        (SELECT "credits" FROM "${schema}"."users" WHERE "id" = 1)::int AS "credits",
        (SELECT count(*) FROM "${schema}"."item_purchases")::int AS "purchases",
        (SELECT count(*) FROM "${schema}"."pet_equipped_items")::int AS "equips"
    `);
    assert.deepEqual(audit.rows[0], { credits: 895, purchases: 1, equips: 1 });
    console.log("PASS shop purchase PG integration (IDOR/launch catalog/rollback/32-way buy-once debit+equip)");
  } finally {
    if (appPrisma) await appPrisma.$disconnect();
    if (defaultPrisma) await defaultPrisma.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
