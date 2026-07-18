type AgentWebhookDb = any;

export async function claimTelegramInboundMessageWithDb(
  db: AgentWebhookDb,
  input: {
    petId: number;
    chatId: string;
    messageId: string;
    text: string;
    metadata: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!Number.isSafeInteger(input.petId) || input.petId <= 0) return false;
  if (!input.chatId || !input.messageId) return false;

  const rows = await db.$queryRaw`
    INSERT INTO "pet_agent_messages"
      ("pet_id", "platform", "direction", "message_type", "content",
       "platform_msg_id", "chat_id", "metadata")
    VALUES
      (${input.petId}, 'telegram', 'inbound', 'text', ${input.text.slice(0, 2000)},
       ${input.messageId.slice(0, 100)}, ${input.chatId.slice(0, 100)},
       CAST(${JSON.stringify(input.metadata)} AS jsonb))
    ON CONFLICT ("pet_id", "platform", "chat_id", "platform_msg_id")
      WHERE "direction" = 'inbound'
        AND "chat_id" IS NOT NULL
        AND "platform_msg_id" IS NOT NULL
    DO NOTHING
    RETURNING "id"
  ` as Array<{ id: number }>;
  return rows.length === 1;
}
