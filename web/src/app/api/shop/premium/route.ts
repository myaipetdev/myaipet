import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { PREMIUM_MAP } from "@/lib/premium";
import { SKILL_DB, SKILL_MAP } from "@/lib/skills";
import {
  consumePaymentTx,
  PaymentAlreadyConsumed,
  PaymentsPausedError,
} from "@/lib/payments";
import {
  canonicalizePaymentTxHash,
  InvalidPaymentTxHash,
  verifyUsdtTransfer,
  treasuryConfigured,
  ONCHAIN,
} from "@/lib/onchain";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    payments_enabled: treasuryConfigured(),
    items: Object.values(PREMIUM_MAP).map((item) => ({
      ...item,
      sale_enabled: item.saleEnabled,
      availability_message: item.saleEnabled ? null : item.unavailableReason,
    })),
  });
}

// POST /api/shop/premium — Purchase a premium item
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { item_key, pet_id, payment_method, skill_key, element, tx_hash } = await req.json();

  const item = PREMIUM_MAP[item_key];
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (!item.saleEnabled) {
    return NextResponse.json({
      error: item.unavailableReason || "This item is not currently for sale",
      code: "ITEM_NOT_FOR_SALE",
      item_key,
      sale_enabled: false,
    }, { status: 409 });
  }

  // Premium purchases are a paid surface even when the caller spends an
  // existing credit balance. The launch kill-switch pauses the whole route.
  if (!treasuryConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable" }, { status: 503 });
  }

  // BUG 1 FIX: Validate payment method strictly
  if (payment_method !== "credits" && payment_method !== "usdt") {
    return NextResponse.json({ error: "Invalid payment_method. Must be 'credits' or 'usdt'." }, { status: 400 });
  }

  const parsedPetId = typeof pet_id === "number"
    ? pet_id
    : typeof pet_id === "string" && /^[1-9][0-9]*$/.test(pet_id)
      ? Number(pet_id)
      : Number.NaN;
  if (!Number.isSafeInteger(parsedPetId) || parsedPetId <= 0) {
    return NextResponse.json({ error: "A positive safe-integer pet_id is required" }, { status: 400 });
  }
  const pet = await prisma.pet.findFirst({
    where: { id: parsedPetId, user_id: user.id, is_active: true },
    include: { skills: true },
  });
  if (!pet) return NextResponse.json({ error: "Active pet not found" }, { status: 404 });

  let usdtPaid = false;
  let canonicalTxHash: string | null = null;
  if (payment_method === "usdt") {
    try {
      canonicalTxHash = canonicalizePaymentTxHash(tx_hash);
    } catch (error) {
      if (error instanceof InvalidPaymentTxHash) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    // Fast-path replay check against the global ledger (audit C3).
    const seen = await prisma.consumedPayment.findUnique({ where: { tx_hash: canonicalTxHash } });
    if (seen) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }
    const v = await verifyUsdtTransfer(canonicalTxHash, user.wallet_address, item.priceUSD);
    if (v.ok !== true) return NextResponse.json({ error: v.error }, { status: 400 });
    // NOTE: the tx is claimed + the Transaction row written INSIDE the effects
    // transaction below (audit H2) so dedup and item-grant are atomic.
    usdtPaid = true;
  }

  const creditPrice = usdtPaid ? 0 : (item.priceCredits || 0);
  if (!usdtPaid && user.credits < creditPrice) {
    return NextResponse.json({
      error: "Insufficient credits",
      required: creditPrice,
      available: user.credits,
      tip: `Buy credits with USDT to get ${item.name}!`,
    }, { status: 400 });
  }

  // BUG 2 FIX: Wrap all effects + credit deduction in a single transaction
  let result: any;
  try {
  result = await prisma.$transaction(async (tx) => {
    // audit C3/H2: claim the on-chain payment in the global ledger + record the
    // Transaction row atomically with the item grant.
    if (usdtPaid) {
      if (!canonicalTxHash) throw new Error("Canonical payment hash missing");
      await consumePaymentTx(tx, {
        txHash: canonicalTxHash,
        userId: user.id,
        purpose: "shop_premium",
        amountUsd: item.priceUSD,
      });
      await tx.transaction.create({
        data: { user_id: user.id, type: "premium_buy", tx_hash: canonicalTxHash, chain: ONCHAIN.chainName },
      });
    }

    // Deduct credits first (inside transaction)
    if (creditPrice > 0) {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { credits: { decrement: creditPrice } },
      });
      // Double-check credits didn't go negative (concurrent request guard)
      if (updated.credits < 0) {
        throw new Error("Insufficient credits");
      }
    }

    const res: any = { purchased: item.name, item_key, credits_spent: creditPrice };

    switch (item.effect) {
      case "exp_2x": {
        if (pet) {
          await tx.pet.update({
            where: { id: pet.id },
            data: { experience: { increment: pet.level * 50 } },
          });
          res.bonus_exp = pet.level * 50;
        }
        break;
      }

      case "random_rare_skill": {
        if (!pet) throw new Error("pet_id required");
        const learned = new Set(pet.skills.map(s => s.skill_key));
        const petElement = pet.element || "normal";
        const available = SKILL_DB.filter(
          s => !learned.has(s.key) && s.rarity >= 2 &&
          (s.element === petElement || s.element === "normal")
        );
        if (available.length === 0) {
          throw new Error("No new skills available for this pet");
        }
        const weights = available.map(s => s.rarity >= 4 ? 1 : s.rarity >= 3 ? 3 : 5);
        const totalW = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalW;
        let picked = available[0];
        for (let i = 0; i < available.length; i++) {
          roll -= weights[i];
          if (roll <= 0) { picked = available[i]; break; }
        }
        await tx.petSkill.create({
          data: { pet_id: pet.id, skill_key: picked.key, level: 1, slot: null },
        });
        res.skill_learned = { key: picked.key, name: picked.name, rarity: picked.rarity, emoji: picked.emoji };
        break;
      }

      case "skill_level_up": {
        if (!pet || !skill_key) throw new Error("pet_id and skill_key required");
        const skill = pet.skills.find(s => s.skill_key === skill_key);
        if (!skill) throw new Error("Skill not found on this pet");
        const def = SKILL_MAP[skill_key];
        if (!def || skill.level >= def.maxLevel) throw new Error("Already max level");
        await tx.petSkill.update({
          where: { id: skill.id },
          data: { level: { increment: 1 } },
        });
        res.skill_upgraded = { key: skill_key, new_level: skill.level + 1 };
        break;
      }

      case "change_element": {
        if (!pet || !element) throw new Error("pet_id and element required");
        const validElements = ["fire", "water", "grass", "electric", "normal"];
        if (!validElements.includes(element)) throw new Error("Invalid element");
        await tx.pet.update({
          where: { id: pet.id },
          data: { element },
        });
        res.new_element = element;
        break;
      }

      case "instant_evolve": {
        if (!pet) throw new Error("pet_id required");
        if (pet.evolution_stage >= 4) throw new Error("Already at max evolution");
        await tx.pet.update({
          where: { id: pet.id },
          data: {
            evolution_stage: { increment: 1 },
            happiness: { increment: 20 },
          },
        });
        res.new_evolution_stage = pet.evolution_stage + 1;
        break;
      }

      case "battle_revive":
      case "type_shield":
      case "unlimited_battles": {
        throw new Error("This item is not for sale until its persistent effect is enforced");
      }

      // Gacha effects (gacha_legendary / gacha_mystery) were removed — the
      // randomized paid pulls are gambling-adjacent and no longer sold (see
      // lib/premium.ts). No item maps to these effects anymore.
    }

    return res;
  });
  } catch (e: any) {
    if (e instanceof PaymentAlreadyConsumed) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }
    if (e instanceof PaymentsPausedError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const msg = e?.message || "Purchase failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json(result);
}
