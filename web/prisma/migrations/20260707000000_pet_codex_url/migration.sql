-- Codex art: AI-illustrated "collectible creature sticker" of a pet (Studio
-- style 6). Separate from avatar_url so the real photo is never overwritten;
-- card + My Pet hero prefer codex_url when present, else fall back to the photo.
ALTER TABLE "pets" ADD COLUMN "codex_url" TEXT;
