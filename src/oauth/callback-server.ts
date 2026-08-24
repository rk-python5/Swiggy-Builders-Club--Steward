import { createServer } from "node:http";

export interface CallbackResult {
  code: string;
  state: string;
}

/**
 * Starts a short-lived local HTTP server on `port`, listens for the OAuth
 * redirect (`GET /callback?code=...&state=...`), and resolves with the
 * parsed code/state. The browser is left with a plain confirmation page —
 * nothing needs to be copy-pasted by hand.
 */
export function waitForCallback(port: number, expectedState: string): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing code or state.");
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch — possible CSRF, aborting.");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" }).end("Authenticated. You can close this tab.");
      server.close();
      resolve({ code, state });
    });

    server.listen(port);
  });
}
