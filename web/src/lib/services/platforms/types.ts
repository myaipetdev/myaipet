export interface PlatformAdapter {
  sendText(chatId: string, text: string): Promise<void>;
  sendImage(chatId: string, imageUrl: string, caption?: string): Promise<void>;
  sendTypingAction(chatId: string): Promise<void>;
}

export interface IncomingMessage {
  platform: string;
  chatId: string;
  userId: string;
  userName?: string;
  text: string;
  isGroupChat: boolean;
  isMention: boolean;
  messageId?: string;
}
