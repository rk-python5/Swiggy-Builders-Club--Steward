export interface Notifier {
  notify(message: string): Promise<void>;
}

/** Logs instead of sending -- used when TELEGRAM_BOT_TOKEN isn't configured, so the rest
 * of the spine (scheduler, action gate, daemon) can be built and tested without it. */
export const consoleNotifier: Notifier = {
  async notify(message: string) {
    console.log(`[notify:console] ${message}`);
  },
};

export async function getNotifier(): Promise<Notifier> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return consoleNotifier;
  }
  const { telegramNotifier } = await import("./telegram.js");
  return telegramNotifier(token, chatId);
}
