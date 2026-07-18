-- Canonicalise legacy absolute application media URLs. This makes every local
-- object pass through /uploads/* -> the protected media route, independent of
-- the hostname recorded by older releases.
UPDATE "generations"
SET "photo_path" = regexp_replace("photo_path", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "photo_path" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "generations"
SET "video_path" = regexp_replace("video_path", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "video_path" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "pets"
SET "avatar_url" = regexp_replace("avatar_url", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "avatar_url" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "pets"
SET "codex_url" = regexp_replace("codex_url", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "codex_url" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "caught_cats"
SET "photo_path" = regexp_replace("photo_path", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "photo_path" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "user_profiles"
SET "avatar_url" = regexp_replace("avatar_url", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "avatar_url" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "battle_history"
SET "player_avatar" = regexp_replace("player_avatar", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "player_avatar" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

UPDATE "battle_history"
SET "opponent_avatar" = regexp_replace("opponent_avatar", '^https?://(www\.)?app\.myaipet\.ai/uploads/', '/uploads/', 'i')
WHERE "opponent_avatar" ~* '^https?://(www\.)?app\.myaipet\.ai/uploads/';

-- The 2026-07-17 audit found three legacy SSRF probes (localhost and the AWS
-- link-local metadata address). Remove only explicitly unsafe hosts. Legitimate
-- external HTTPS avatars are not destroyed by this migration.
DO $$
DECLARE
  unsafe_before INTEGER;
  removed_count INTEGER;
  unsafe_after INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_before
  FROM "pets"
  WHERE "avatar_url" ~* '^https?://(localhost|127\.0\.0\.1|\[::1\]|169\.254\.169\.254)([:/]|$)';

  UPDATE "pets"
  SET "avatar_url" = NULL
  WHERE "avatar_url" ~* '^https?://(localhost|127\.0\.0\.1|\[::1\]|169\.254\.169\.254)([:/]|$)';
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  SELECT COUNT(*) INTO unsafe_after
  FROM "pets"
  WHERE "avatar_url" ~* '^https?://(localhost|127\.0\.0\.1|\[::1\]|169\.254\.169\.254)([:/]|$)';

  IF removed_count <> unsafe_before OR unsafe_after <> 0 THEN
    RAISE EXCEPTION 'Unsafe avatar cleanup assertion failed (before %, removed %, after %)',
      unsafe_before, removed_count, unsafe_after;
  END IF;
END $$;
