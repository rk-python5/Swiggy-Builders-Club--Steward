import type { Notifier } from "./notify.js";

export function telegramNotifier(botToken: string, chatId: string): Notifier {
  return {
    async notify(message: string) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
      if (!res.ok) {
        throw new Error(`Telegram notify failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}
