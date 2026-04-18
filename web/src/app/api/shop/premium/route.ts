import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { PREMIUM_MAP } from "@/lib/premium";
import { SKILL_DB, SKILL_MAP } from "@/lib/skills";
import { NextRequest, NextResponse } from "next/server";

// POST /api/shop/premium — Purchase a premium item
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { item_key, pet_id, payment_method, skill_key, element, tx_hash } = await req.json();

  const item = PREMIUM_MAP[item_key];
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // BUG 1 FIX: Validate payment method strictly
  if (payment_method !== "credits" && payment_method !== "usdt") {
    return NextResponse.json({ error: "Invalid payment_method. Must be 'credits' or 'usdt'." }, { status: 400 });
  }

  if (payment_method === "usdt") {
    if (!tx_hash || typeof tx_hash !== "string") {
      return NextResponse.json({ error: "tx_hash required for USDT payment" }, { status: 400 });
    }
    // TODO: Verify USDT tx_hash on-chain before proceeding
    // For now, reject USDT until verification is implemented
    return NextResponse.json({ error: "USDT payment verification not yet implemented. Use credits." }, { status: 501 });
  }

  const creditPrice = item.priceCredits || 0;
  if (user.credits < creditPrice) {
    return NextResponse.json({
      error: "Insufficient credits",
      required: creditPrice,
      available: user.credits,
      tip: `Buy credits with USDT to get ${item.name}!`,
    }, { status: 400 });
  }

  const pet = pet_id
    ? await prisma.pet.findFirst({ where: { id: pet_id, user_id: user.id }, include: { skills: true } })
    : null;

  // BUG 2 FIX: Wrap all effects + credit deduction in a single transaction
  let result: any;
  try {
  result = await prisma.$transaction(async (tx) => {
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
        res.token = item_key;
        res.message = `${item.name} added to your inventory. Use it in battle!`;
        break;
      }

      case "gacha_legendary": {
        const isLegendary = Math.random() < 0.10;
        if (isLegendary) {
          const legendarySkills = SKILL_DB.filter(s => s.rarity >= 5);
          const skill = legendarySkills[Math.floor(Math.random() * legendarySkills.length)];
          if (pet && skill) {
            const exists = pet.skills.find(s => s.skill_key === skill.key);
            if (!exists) {
              await tx.petSkill.create({ data: { pet_id: pet.id, skill_key: skill.key, level: 1, slot: null } });
            } else {
              // BUG 3 FIX: Duplicate skill — upgrade existing skill level instead of wasting credits
              const def = SKILL_MAP[skill.key];
              if (def && exists.level < def.maxLevel) {
                await tx.petSkill.update({ where: { id: exists.id }, data: { level: { increment: 1 } } });
                res.duplicate_fallback = { action: "skill_level_up", key: skill.key, new_level: exists.level + 1 };
              } else {
                // Already max level — refund 50% credits
                const refund = Math.floor(creditPrice * 0.5);
                if (refund > 0) {
                  await tx.user.update({ where: { id: user.id }, data: { credits: { increment: refund } } });
                }
                res.duplicate_fallback = { action: "credits_refund", amount: refund };
              }
            }
          }
          res.gacha_result = "legendary";
          res.reward = skill ? { type: "skill", key: skill.key, name: skill.name, emoji: skill.emoji, rarity: 5 } : { type: "credits", amount: 2000 };
        } else {
          const epicSkills = SKILL_DB.filter(s => s.rarity >= 3 && s.rarity <= 4);
          const skill = epicSkills[Math.floor(Math.random() * epicSkills.length)];
          if (pet && skill) {
            const exists = pet.skills.find(s => s.skill_key === skill.key);
            if (!exists) {
              await tx.petSkill.create({ data: { pet_id: pet.id, skill_key: skill.key, level: 1, slot: null } });
            } else {
              // BUG 3 FIX: Duplicate skill — upgrade existing skill level instead of wasting credits
              const def = SKILL_MAP[skill.key];
              if (def && exists.level < def.maxLevel) {
                await tx.petSkill.update({ where: { id: exists.id }, data: { level: { increment: 1 } } });
                res.duplicate_fallback = { action: "skill_level_up", key: skill.key, new_level: exists.level + 1 };
              } else {
                const refund = Math.floor(creditPrice * 0.5);
                if (refund > 0) {
                  await tx.user.update({ where: { id: user.id }, data: { credits: { increment: refund } } });
                }
                res.duplicate_fallback = { action: "credits_refund", amount: refund };
              }
            }
          }
          res.gacha_result = "epic";
          res.reward = skill ? { type: "skill", key: skill.key, name: skill.name, emoji: skill.emoji, rarity: skill.rarity } : { type: "credits", amount: 500 };
        }
        break;
      }

      case "gacha_mystery": {
        const roll = Math.random();
        if (roll < 0.4) {
          const credits = 100 + Math.floor(Math.random() * 400);
          await tx.user.update({ where: { id: user.id }, data: { credits: { increment: credits } } });
          res.gacha_result = "credits";
          res.reward = { type: "credits", amount: credits };
        } else if (roll < 0.7) {
          res.gacha_result = "skill_scroll";
          res.reward = { type: "item", key: "skill_scroll", name: "Skill Scroll" };
        } else if (roll < 0.9) {
          res.gacha_result = "element_stone";
          res.reward = { type: "item", key: "element_stone", name: "Element Stone" };
        } else {
          res.gacha_result = "legendary_egg";
          res.reward = { type: "item", key: "legendary_egg", name: "Legendary Egg!" };
        }
        break;
      }
    }

    return res;
  });
  } catch (e: any) {
    const msg = e?.message || "Purchase failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json(result);
}
