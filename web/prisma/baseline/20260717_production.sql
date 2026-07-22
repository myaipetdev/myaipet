-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "nonce" VARCHAR(32) NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "pet_slots" INTEGER NOT NULL DEFAULT 1,
    "season_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "successor_wallet" VARCHAR(42),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "pet_id" INTEGER,
    "pet_type" INTEGER NOT NULL,
    "style" INTEGER NOT NULL,
    "prompt" TEXT,
    "duration" INTEGER NOT NULL,
    "photo_path" VARCHAR(512) NOT NULL,
    "video_path" VARCHAR(512),
    "content_hash" VARCHAR(66),
    "tx_hash" VARCHAR(66),
    "chain" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "visibility" VARCHAR(12) NOT NULL DEFAULT 'private',
    "error_message" TEXT,
    "fal_request_id" VARCHAR(128),
    "credits_charged" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "type" VARCHAR(20) NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "chain" VARCHAR(10) NOT NULL,
    "block_number" INTEGER,
    "gas_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "payment_tx_hash" VARCHAR(66),
    "recording_tx_hash" VARCHAR(66),
    "chain" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumed_payments" (
    "id" SERIAL NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "species" INTEGER NOT NULL,
    "personality_type" VARCHAR(20) NOT NULL DEFAULT 'friendly',
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "happiness" INTEGER NOT NULL DEFAULT 70,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "hunger" INTEGER NOT NULL DEFAULT 30,
    "bond_level" INTEGER NOT NULL DEFAULT 0,
    "total_interactions" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" TEXT,
    "codex_url" TEXT,
    "appearance_desc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "soul_version" INTEGER NOT NULL DEFAULT 1,
    "personality_modifiers" JSONB DEFAULT '{}',
    "last_dream_at" TIMESTAMP(3),
    "last_interaction_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "element" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "evolution_stage" INTEGER NOT NULL DEFAULT 0,
    "evolution_name" VARCHAR(30),
    "atk" INTEGER NOT NULL DEFAULT 10,
    "def" INTEGER NOT NULL DEFAULT 10,
    "spd" INTEGER NOT NULL DEFAULT 10,
    "care_streak" INTEGER NOT NULL DEFAULT 0,
    "last_care_at" TIMESTAMP(3),

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_memories" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "memory_type" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "emotion" VARCHAR(20) NOT NULL DEFAULT 'calm',
    "importance" INTEGER NOT NULL DEFAULT 1,
    "is_minted" BOOLEAN NOT NULL DEFAULT false,
    "memory_nft_id" INTEGER,
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE("content", ''::text))) STORED,
    "embedding" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_interactions" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "interaction_type" VARCHAR(20) NOT NULL,
    "response_text" TEXT,
    "happiness_change" INTEGER NOT NULL DEFAULT 0,
    "energy_change" INTEGER NOT NULL DEFAULT 0,
    "hunger_change" INTEGER NOT NULL DEFAULT 0,
    "experience_gained" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dream_journals" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "dream_date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "emotional_tone" VARCHAR(30) NOT NULL,
    "personality_changes" JSONB,
    "stat_changes" JSONB,
    "significant_events" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dream_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_insights" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "insight" TEXT NOT NULL,
    "rationale" TEXT,
    "mood" VARCHAR(20) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 5,
    "source_keys" JSONB,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "reacted" BOOLEAN NOT NULL DEFAULT false,
    "video_generation_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_loras" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'training',
    "fal_request_id" VARCHAR(128),
    "lora_url" VARCHAR(512),
    "trigger_word" VARCHAR(40) NOT NULL,
    "images_used" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pet_loras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_connections" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "task_scopes" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_tokens" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "cli_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caught_cats" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'cat',
    "name" VARCHAR(40) NOT NULL,
    "breed" VARCHAR(40) NOT NULL,
    "rarity" VARCHAR(12) NOT NULL,
    "element" VARCHAR(10) NOT NULL,
    "hp" INTEGER NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "spd" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "photo_path" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "caught_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(10) NOT NULL DEFAULT 'camera',
    "spawn_key" VARCHAR(64),

    CONSTRAINT "caught_cats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_cup_predictions" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "country_code" VARCHAR(4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_cup_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_notifications" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "notification_type" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_autonomous_actions" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "urge_type" VARCHAR(20) NOT NULL,
    "action_taken" VARCHAR(100) NOT NULL,
    "prompt_used" TEXT,
    "generation_id" INTEGER,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "platform" VARCHAR(20),
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_autonomous_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soul_exports" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "ipfs_cid" VARCHAR(128) NOT NULL,
    "soul_hash" VARCHAR(64) NOT NULL,
    "tx_hash" VARCHAR(66),
    "chain" VARCHAR(10) NOT NULL DEFAULT 'base',
    "version" INTEGER NOT NULL DEFAULT 1,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soul_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "generation_id" INTEGER NOT NULL,
    "pet_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "generation_id" INTEGER NOT NULL,
    "pet_id" INTEGER,
    "content" TEXT NOT NULL,
    "parent_id" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_agent_reactions" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "generation_id" INTEGER NOT NULL,
    "reacted" BOOLEAN NOT NULL DEFAULT false,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "commented" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_agent_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" SERIAL NOT NULL,
    "follower_id" INTEGER NOT NULL,
    "following_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_skills" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "skill_key" VARCHAR(30) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "slot" INTEGER,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_history" (
    "id" SERIAL NOT NULL,
    "player_pet_id" INTEGER NOT NULL,
    "opponent_pet_id" INTEGER,
    "opponent_name" VARCHAR(50) NOT NULL,
    "won" BOOLEAN NOT NULL,
    "turns" INTEGER NOT NULL,
    "player_hp_left" INTEGER NOT NULL DEFAULT 0,
    "exp_gained" INTEGER NOT NULL DEFAULT 0,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "skill_drop_key" VARCHAR(30),
    "tx_hash" VARCHAR(66),
    "battle_type" VARCHAR(20) NOT NULL DEFAULT 'pvp',
    "stage_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "battle_log" JSONB,
    "seed" VARCHAR(66),
    "player_hp_max" INTEGER NOT NULL DEFAULT 0,
    "opponent_hp_max" INTEGER NOT NULL DEFAULT 0,
    "player_avatar" TEXT,
    "opponent_avatar" TEXT,

    CONSTRAINT "battle_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pve_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "stage_id" INTEGER NOT NULL DEFAULT 1,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "best_turns" INTEGER,
    "best_hp_left" INTEGER,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pve_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_training_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "battles" INTEGER NOT NULL DEFAULT 0,
    "exp_earned" INTEGER NOT NULL DEFAULT 0,
    "credits_spent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_training_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "rarity" VARCHAR(15) NOT NULL DEFAULT 'common',
    "price" INTEGER NOT NULL,
    "icon" VARCHAR(10) NOT NULL,
    "stat_bonus" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total_cost" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_equipped_items" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "slot" VARCHAR(20) NOT NULL,
    "equipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_equipped_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reward_id" INTEGER NOT NULL,
    "reward_name" VARCHAR(60) NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "delivery_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "display_name" VARCHAR(50),
    "bio" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_platform_connections" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "credentials" TEXT,
    "config" JSONB DEFAULT '{}',
    "platform_chat_id" VARCHAR(100),
    "webhook_secret" VARCHAR(64),
    "connect_code" VARCHAR(10),
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "pet_platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_agent_messages" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "message_type" VARCHAR(20) NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "platform_msg_id" VARCHAR(100),
    "chat_id" VARCHAR(100),
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_agent_schedules" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_credit_limit" INTEGER NOT NULL DEFAULT 50,
    "credits_used_today" INTEGER NOT NULL DEFAULT 0,
    "last_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posting_frequency" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "action_cooldown_minutes" INTEGER NOT NULL DEFAULT 30,
    "preferred_platform" VARCHAR(20) NOT NULL DEFAULT 'web',
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,
    "last_action_at" TIMESTAMP(3),

    CONSTRAINT "pet_agent_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_conversations" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "chat_id" VARCHAR(100) NOT NULL,
    "participant_name" VARCHAR(100),
    "summary" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_personas" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "owner_speech_style" TEXT,
    "owner_interests" TEXT,
    "owner_expressions" TEXT,
    "owner_tone" VARCHAR(50),
    "owner_language" VARCHAR(20),
    "owner_bio" TEXT,
    "analyzed_patterns" JSONB,
    "sample_messages" JSONB,
    "vocabulary_style" TEXT,
    "observed_topics" JSONB,
    "observed_style" JSONB,
    "last_observed_at" TIMESTAMP(3),
    "persona_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_soul_nfts" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "token_id" INTEGER,
    "owner_wallet" VARCHAR(42) NOT NULL,
    "genesis_hash" VARCHAR(66) NOT NULL,
    "current_hash" VARCHAR(66) NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "mint_tx_hash" VARCHAR(66),
    "mint_block" INTEGER,
    "chain" VARCHAR(10) NOT NULL DEFAULT 'bsc',
    "minted_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "successor_wallet" VARCHAR(42),
    "is_deceased" BOOLEAN NOT NULL DEFAULT false,
    "inherited_from" VARCHAR(42),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_soul_nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_checkpoints" (
    "id" SERIAL NOT NULL,
    "soul_id" INTEGER NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "persona_hash" VARCHAR(66) NOT NULL,
    "persona_snapshot" JSONB NOT NULL,
    "trigger_event" VARCHAR(50) NOT NULL,
    "tx_hash" VARCHAR(66),
    "block_number" INTEGER,
    "on_chain" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_nfts" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "memory_id" INTEGER,
    "soul_token_id" INTEGER,
    "memory_token_id" INTEGER,
    "content_hash" VARCHAR(66) NOT NULL,
    "memory_type" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(200),
    "description" TEXT,
    "ipfs_cid" VARCHAR(128),
    "mint_tx_hash" VARCHAR(66),
    "chain" VARCHAR(10) NOT NULL DEFAULT 'bsc',
    "owner_wallet" VARCHAR(42) NOT NULL,
    "minted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inheritance_events" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "from_wallet" VARCHAR(42) NOT NULL,
    "to_wallet" VARCHAR(42) NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "inactive_days" INTEGER,
    "tx_hash" VARCHAR(66),
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inheritance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paid_actions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pet_id" INTEGER,
    "action_key" VARCHAR(40) NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "burn_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "burned_tx" VARCHAR(66),
    "consumed_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_battle_pools" (
    "id" SERIAL NOT NULL,
    "week_key" VARCHAR(10) NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pool_usd" DOUBLE PRECISION NOT NULL,
    "total_entries" INTEGER NOT NULL DEFAULT 0,
    "payouts" JSONB NOT NULL DEFAULT '[]',
    "paid_out" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "weekly_battle_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tier" VARCHAR(10) NOT NULL DEFAULT 'free',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_payment_tx" VARCHAR(66),
    "total_paid_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_monthly_usage" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "month_key" VARCHAR(7) NOT NULL,
    "videos_used" INTEGER NOT NULL DEFAULT 0,
    "images_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_monthly_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_action_counts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_key" VARCHAR(40) NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_action_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_missions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "mission_id" VARCHAR(60) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "points" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "bonus_x" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "user_id" INTEGER NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_completed_date" VARCHAR(10),
    "shields_owned" INTEGER NOT NULL DEFAULT 0,
    "shields_used" INTEGER NOT NULL DEFAULT 0,
    "last_shield_used_at" TIMESTAMP(3),
    "total_missions_done" INTEGER NOT NULL DEFAULT 0,
    "total_points_earned" INTEGER NOT NULL DEFAULT 0,
    "pending_apology" BOOLEAN NOT NULL DEFAULT false,
    "pending_apology_days" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "streak_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "price_usd" DOUBLE PRECISION NOT NULL,
    "paid_via" VARCHAR(20) NOT NULL,
    "paid_credits" INTEGER,
    "tx_hash" VARCHAR(66),
    "streak_before" INTEGER NOT NULL,
    "streak_after" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_drops" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "multiplier_x" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "applies_to" VARCHAR(20) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourly_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodic_missions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "period" VARCHAR(8) NOT NULL,
    "period_key" VARCHAR(10) NOT NULL,
    "mission_id" VARCHAR(60) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodic_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_buddies" (
    "id" SERIAL NOT NULL,
    "user_a_id" INTEGER NOT NULL,
    "user_b_id" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "shared_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_a" VARCHAR(10),
    "last_active_b" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "streak_buddies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_sos" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "sender_streak" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "helped_by_id" INTEGER,
    "helped_at" TIMESTAMP(3),
    "credits_paid" INTEGER NOT NULL DEFAULT 0,
    "message" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_sos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_dates" (
    "id" SERIAL NOT NULL,
    "pet_a_id" INTEGER NOT NULL,
    "pet_b_id" INTEGER NOT NULL,
    "initiator_id" INTEGER NOT NULL,
    "log" TEXT NOT NULL,
    "vibe" VARCHAR(40) NOT NULL,
    "friendship" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "generations_user_id_idx" ON "generations"("user_id");

-- CreateIndex
CREATE INDEX "generations_pet_id_idx" ON "generations"("pet_id");

-- CreateIndex
CREATE INDEX "generations_visibility_status_created_at_idx" ON "generations"("visibility", "status", "created_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_tx_hash_idx" ON "transactions"("tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "credit_purchases_payment_tx_hash_key" ON "credit_purchases"("payment_tx_hash");

-- CreateIndex
CREATE INDEX "credit_purchases_user_id_idx" ON "credit_purchases"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "consumed_payments_tx_hash_key" ON "consumed_payments"("tx_hash");

-- CreateIndex
CREATE INDEX "consumed_payments_user_id_idx" ON "consumed_payments"("user_id");

-- CreateIndex
CREATE INDEX "pets_user_id_idx" ON "pets"("user_id");

-- CreateIndex
CREATE INDEX "pet_memories_pet_id_idx" ON "pet_memories"("pet_id");

-- Historical migration 20260615000000_memory_fts is resolved as applied by
-- the baseline manifest, so its generated column and both indexes must be
-- represented in this snapshot itself.
CREATE INDEX "pet_memories_content_tsv_idx" ON "pet_memories" USING GIN ("content_tsv");

CREATE INDEX "pet_memories_pet_id_created_at_idx" ON "pet_memories"("pet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pet_interactions_pet_id_idx" ON "pet_interactions"("pet_id");

-- CreateIndex
CREATE INDEX "pet_interactions_user_id_idx" ON "pet_interactions"("user_id");

-- CreateIndex
CREATE INDEX "dream_journals_pet_id_idx" ON "dream_journals"("pet_id");

-- CreateIndex
CREATE INDEX "pet_insights_pet_id_created_at_idx" ON "pet_insights"("pet_id", "created_at");

-- CreateIndex
CREATE INDEX "pet_loras_pet_id_created_at_idx" ON "pet_loras"("pet_id", "created_at");

-- CreateIndex
CREATE INDEX "model_connections_owner_user_id_idx" ON "model_connections"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_tokens_token_hash_key" ON "cli_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "cli_tokens_owner_user_id_idx" ON "cli_tokens"("owner_user_id");

-- CreateIndex
CREATE INDEX "caught_cats_owner_user_id_idx" ON "caught_cats"("owner_user_id");

-- CreateIndex
CREATE INDEX "caught_cats_lat_lng_idx" ON "caught_cats"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "caught_cats_owner_spawn_key" ON "caught_cats"("owner_user_id", "spawn_key");

-- CreateIndex
CREATE UNIQUE INDEX "world_cup_predictions_owner_user_id_key" ON "world_cup_predictions"("owner_user_id");

-- CreateIndex
CREATE INDEX "world_cup_predictions_country_code_idx" ON "world_cup_predictions"("country_code");

-- CreateIndex
CREATE INDEX "pet_notifications_pet_id_idx" ON "pet_notifications"("pet_id");

-- CreateIndex
CREATE INDEX "pet_autonomous_actions_pet_id_idx" ON "pet_autonomous_actions"("pet_id");

-- CreateIndex
CREATE INDEX "soul_exports_pet_id_idx" ON "soul_exports"("pet_id");

-- CreateIndex
CREATE INDEX "likes_generation_id_idx" ON "likes"("generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_generation_id_key" ON "likes"("user_id", "generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_agent_reactions_pet_id_generation_id_key" ON "pet_agent_reactions"("pet_id", "generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "pet_skills_pet_id_slot_idx" ON "pet_skills"("pet_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "pet_skills_pet_id_skill_key_key" ON "pet_skills"("pet_id", "skill_key");

-- CreateIndex
CREATE INDEX "battle_history_player_pet_id_idx" ON "battle_history"("player_pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "play_sessions_user_id_date_key" ON "play_sessions"("user_id", "date");

-- CreateIndex
CREATE INDEX "pve_progress_user_id_idx" ON "pve_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pve_progress_user_id_pet_id_stage_id_key" ON "pve_progress"("user_id", "pet_id", "stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_training_logs_user_id_pet_id_date_key" ON "daily_training_logs"("user_id", "pet_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "shop_items_key_key" ON "shop_items"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pet_equipped_items_pet_id_slot_key" ON "pet_equipped_items"("pet_id", "slot");

-- CreateIndex
CREATE INDEX "reward_redemptions_user_id_idx" ON "reward_redemptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_user_id_reward_id_key" ON "reward_redemptions"("user_id", "reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "pet_platform_connections_connect_code_idx" ON "pet_platform_connections"("connect_code");

-- CreateIndex
CREATE UNIQUE INDEX "pet_platform_connections_pet_id_platform_key" ON "pet_platform_connections"("pet_id", "platform");

-- CreateIndex
CREATE INDEX "pet_agent_messages_pet_id_platform_idx" ON "pet_agent_messages"("pet_id", "platform");

-- CreateIndex
CREATE INDEX "pet_agent_messages_chat_id_idx" ON "pet_agent_messages"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_agent_schedules_pet_id_key" ON "pet_agent_schedules"("pet_id");

-- CreateIndex
CREATE INDEX "pet_conversations_pet_id_idx" ON "pet_conversations"("pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_conversations_pet_id_platform_chat_id_key" ON "pet_conversations"("pet_id", "platform", "chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_personas_pet_id_key" ON "pet_personas"("pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_soul_nfts_pet_id_key" ON "pet_soul_nfts"("pet_id");

-- CreateIndex
CREATE INDEX "pet_soul_nfts_owner_wallet_idx" ON "pet_soul_nfts"("owner_wallet");

-- CreateIndex
CREATE INDEX "pet_soul_nfts_token_id_idx" ON "pet_soul_nfts"("token_id");

-- CreateIndex
CREATE INDEX "persona_checkpoints_pet_id_version_idx" ON "persona_checkpoints"("pet_id", "version");

-- CreateIndex
CREATE INDEX "persona_checkpoints_soul_id_idx" ON "persona_checkpoints"("soul_id");

-- CreateIndex
CREATE UNIQUE INDEX "memory_nfts_content_hash_key" ON "memory_nfts"("content_hash");

-- CreateIndex
CREATE INDEX "memory_nfts_pet_id_idx" ON "memory_nfts"("pet_id");

-- CreateIndex
CREATE INDEX "memory_nfts_owner_wallet_idx" ON "memory_nfts"("owner_wallet");

-- CreateIndex
CREATE INDEX "inheritance_events_pet_id_idx" ON "inheritance_events"("pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "paid_actions_tx_hash_key" ON "paid_actions"("tx_hash");

-- CreateIndex
CREATE INDEX "paid_actions_user_id_idx" ON "paid_actions"("user_id");

-- CreateIndex
CREATE INDEX "paid_actions_action_key_idx" ON "paid_actions"("action_key");

-- CreateIndex
CREATE INDEX "paid_actions_created_at_idx" ON "paid_actions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_battle_pools_week_key_key" ON "weekly_battle_pools"("week_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_key" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_last_payment_tx_key" ON "user_subscriptions"("last_payment_tx");

-- CreateIndex
CREATE UNIQUE INDEX "studio_monthly_usage_user_id_month_key_key" ON "studio_monthly_usage"("user_id", "month_key");

-- CreateIndex
CREATE INDEX "daily_action_counts_day_idx" ON "daily_action_counts"("day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_action_counts_user_id_action_key_day_key" ON "daily_action_counts"("user_id", "action_key", "day");

-- CreateIndex
CREATE INDEX "daily_missions_user_id_date_idx" ON "daily_missions"("user_id", "date");

-- CreateIndex
CREATE INDEX "daily_missions_date_idx" ON "daily_missions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_missions_user_id_date_mission_id_key" ON "daily_missions"("user_id", "date", "mission_id");

-- CreateIndex
CREATE INDEX "streak_purchases_user_id_created_at_idx" ON "streak_purchases"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "hourly_drops_starts_at_ends_at_idx" ON "hourly_drops"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "periodic_missions_user_id_period_key_idx" ON "periodic_missions"("user_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "periodic_missions_user_id_period_period_key_mission_id_key" ON "periodic_missions"("user_id", "period", "period_key", "mission_id");

-- CreateIndex
CREATE INDEX "streak_buddies_user_a_id_idx" ON "streak_buddies"("user_a_id");

-- CreateIndex
CREATE INDEX "streak_buddies_user_b_id_idx" ON "streak_buddies"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "streak_buddies_user_a_id_user_b_id_key" ON "streak_buddies"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "streak_sos_expires_at_idx" ON "streak_sos"("expires_at");

-- CreateIndex
CREATE INDEX "streak_sos_sender_id_created_at_idx" ON "streak_sos"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "pet_dates_pet_a_id_idx" ON "pet_dates"("pet_a_id");

-- CreateIndex
CREATE INDEX "pet_dates_pet_b_id_idx" ON "pet_dates"("pet_b_id");

-- CreateIndex
CREATE INDEX "pet_dates_initiator_id_created_at_idx" ON "pet_dates"("initiator_id", "created_at");

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_memories" ADD CONSTRAINT "pet_memories_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_interactions" ADD CONSTRAINT "pet_interactions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_interactions" ADD CONSTRAINT "pet_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_journals" ADD CONSTRAINT "dream_journals_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_insights" ADD CONSTRAINT "pet_insights_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_loras" ADD CONSTRAINT "pet_loras_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_notifications" ADD CONSTRAINT "pet_notifications_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_autonomous_actions" ADD CONSTRAINT "pet_autonomous_actions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soul_exports" ADD CONSTRAINT "soul_exports_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_reactions" ADD CONSTRAINT "pet_agent_reactions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_reactions" ADD CONSTRAINT "pet_agent_reactions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_skills" ADD CONSTRAINT "pet_skills_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_purchases" ADD CONSTRAINT "item_purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_equipped_items" ADD CONSTRAINT "pet_equipped_items_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_equipped_items" ADD CONSTRAINT "pet_equipped_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_platform_connections" ADD CONSTRAINT "pet_platform_connections_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_messages" ADD CONSTRAINT "pet_agent_messages_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_schedules" ADD CONSTRAINT "pet_agent_schedules_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_conversations" ADD CONSTRAINT "pet_conversations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_personas" ADD CONSTRAINT "pet_personas_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_soul_nfts" ADD CONSTRAINT "pet_soul_nfts_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_checkpoints" ADD CONSTRAINT "persona_checkpoints_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "pet_soul_nfts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_nfts" ADD CONSTRAINT "memory_nfts_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inheritance_events" ADD CONSTRAINT "inheritance_events_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_purchases" ADD CONSTRAINT "streak_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodic_missions" ADD CONSTRAINT "periodic_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_buddies" ADD CONSTRAINT "streak_buddies_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_buddies" ADD CONSTRAINT "streak_buddies_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_sos" ADD CONSTRAINT "streak_sos_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_sos" ADD CONSTRAINT "streak_sos_helped_by_id_fkey" FOREIGN KEY ("helped_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_dates" ADD CONSTRAINT "pet_dates_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
