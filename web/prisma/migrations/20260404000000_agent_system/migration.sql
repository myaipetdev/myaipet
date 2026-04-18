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
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,

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

-- AlterTable
ALTER TABLE "pet_autonomous_actions" ADD COLUMN "platform" VARCHAR(20);
ALTER TABLE "pet_autonomous_actions" ADD COLUMN "result" JSONB;

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

-- AddForeignKey
ALTER TABLE "pet_platform_connections" ADD CONSTRAINT "pet_platform_connections_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_messages" ADD CONSTRAINT "pet_agent_messages_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_agent_schedules" ADD CONSTRAINT "pet_agent_schedules_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_conversations" ADD CONSTRAINT "pet_conversations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
