/**
 * Raw fetch wrapper for the Telegram Bot API -- same "thin fetch wrapper, no SDK" pattern
 * as src/mcp/client.ts. Telegram's HTTP API is two calls for a long-polling bot
 * (getUpdates, sendMessage); a library buys nothing at this size.
 */
export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

function apiBase(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set -- create a bot via @BotFather and add it to .env");
  return `https://api.telegram.org/bot${token}`;
}

/**
 * Long-polls for new messages. `offset` should be the last seen update_id + 1;
 * Telegram won't redeliver anything at or below it. `timeout` is seconds the server
 * holds the connection open waiting for a message before returning empty -- 30s keeps
 * this from busy-looping while still returning promptly once someone writes in.
 */
export async function getUpdates(offset: number, timeoutSeconds = 30): Promise<TelegramUpdate[]> {
  const res = await fetch(`${apiBase()}/getUpdates?offset=${offset}&timeout=${timeoutSeconds}`, {
    signal: AbortSignal.timeout((timeoutSeconds + 10) * 1000),
  });
  if (!res.ok) throw new Error(`Telegram getUpdates failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
  if (!body.ok) throw new Error(`Telegram getUpdates returned ok:false`);
  return body.result;
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const res = await fetch(`${apiBase()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}
