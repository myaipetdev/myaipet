BEGIN;

-- Hide passive-effect items until their effects exist in authoritative game
-- logic. This prevents the old release from selling them during a rolling
-- deploy as well as keeping the new API launch catalog honest.
UPDATE "shop_items"
SET "is_active" = false
WHERE "key" IN (
  'training_weights', 'lucky_charm', 'battle_armor', 'dragon_blade',
  'cozy_bed', 'play_tower', 'zen_garden'
);

UPDATE "shop_items"
SET "description" = 'Stylish visual-only shades for your pet profile.',
    "stat_bonus" = '{}'::jsonb
WHERE "key" = 'cool_sunglasses';

UPDATE "shop_items"
SET "description" = 'A visual-only golden crown for your pet profile.',
    "stat_bonus" = '{}'::jsonb
WHERE "key" = 'crown';

UPDATE "shop_items"
SET "description" = 'Adds a visual-only sparkle accent to your pet profile.',
    "stat_bonus" = '{}'::jsonb
WHERE "key" = 'sparkle_aura';

UPDATE "shop_items"
SET "name" = 'Flame Accent',
    "description" = 'Adds a visual-only flame accent to your pet profile.',
    "stat_bonus" = '{}'::jsonb
WHERE "key" = 'flame_trail';

COMMIT;
