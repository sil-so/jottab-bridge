import { Plugin, Notice, normalizePath } from "obsidian";
import * as http from "http";
import * as crypto from "crypto";

const PORT = 27124;
const HOST = "127.0.0.1";

// Chrome extension origins to allow via CORS.
// Add your published Chrome Web Store extension ID here too.
const ALLOWED_ORIGINS = [
  "chrome-extension://goonhhmipnmhhbhlfeglmfccmmomligc", // dev
];

export default class JotTabBridgePlugin extends Plugin {
  private server: http.Server | null = null;
  private token: string = "";

  async onload() {
    // Load or generate the shared secret token
    const saved = await this.loadData();
    if (saved?.token) {
      this.token = saved.token;
    } else {
      this.token = crypto.randomBytes(16).toString("hex");
      await this.saveData({ token: this.token });
    }

    this.startServer();

    // Show the token in a notice so the user can copy it
    this.addCommand({
      id: "show-token",
      name: "Show connection token",
      callback: () => {
        new Notice(`JotTab Bridge token:\n${this.token}`, 15000);
        navigator.clipboard.writeText(this.token);
        new Notice("Token copied to clipboard!", 3000);
      },
    });

    console.log(`[JotTab Bridge] Plugin loaded. Token: ${this.token}`);
  }

  onunload() {
    this.stopServer();
    console.log("[JotTab Bridge] Plugin unloaded.");
  }

  private startServer() {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      // ── CORS ──
      const origin = req.headers.origin || "";
      if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, X-JotTab, Authorization"
        );
      }

      // Handle preflight
      if (req.method === "OPTIONS") {
        if (!ALLOWED_ORIGINS.includes(origin)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      // ── Security: require custom header ──
      if (req.headers["x-jottab"] !== "1") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing X-JotTab header" }));
        return;
      }

      // ── Security: validate shared token ──
      const authHeader = req.headers.authorization || "";
      const providedToken = authHeader.replace(/^Bearer\s+/i, "");
      if (providedToken !== this.token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      // ── Route requests ──
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
      const pathname = url.pathname;

      try {
        if (pathname === "/ping" && req.method === "GET") {
          await this.handlePing(res);
        } else if (pathname === "/list" && req.method === "GET") {
          await this.handleList(res);
        } else if (pathname === "/read" && req.method === "GET") {
          const filePath = url.searchParams.get("path");
          await this.handleRead(res, filePath);
        } else if (pathname === "/write" && req.method === "POST") {
          const body = await this.readBody(req);
          await this.handleWrite(res, body);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
        }
      } catch (err: any) {
        console.error("[JotTab Bridge] Request error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal error" }));
      }
    });

    this.server.listen(PORT, HOST, () => {
      console.log(`[JotTab Bridge] Server listening on ${HOST}:${PORT}`);
      new Notice(`JotTab Bridge running on port ${PORT}`);
    });

    this.server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        new Notice(
          `JotTab Bridge: Port ${PORT} is already in use. Is another instance running?`
        );
      } else {
        console.error("[JotTab Bridge] Server error:", err);
        new Notice(`JotTab Bridge error: ${err.message}`);
      }
    });
  }

  private stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log("[JotTab Bridge] Server stopped.");
    }
  }

  // ── Handlers ──

  private async handlePing(res: http.ServerResponse) {
    const vaultName = this.app.vault.getName();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", vault: vaultName }));
  }

  private async handleList(res: http.ServerResponse) {
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "md")
      .map((f) => ({
        name: f.name,
        path: f.path,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ files }));
  }

  private async handleRead(res: http.ServerResponse, filePath: string | null) {
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing 'path' parameter" }));
      return;
    }

    const normalized = normalizePath(filePath);
    const file = this.app.vault.getFileByPath(normalized);
    if (!file) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File not found" }));
      return;
    }

    const content = await this.app.vault.read(file);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(content);
  }

  private async handleWrite(res: http.ServerResponse, body: string) {
    let parsed: { path?: string; content?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!parsed.path || typeof parsed.content !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Missing 'path' or 'content' in body" })
      );
      return;
    }

    const normalized = normalizePath(parsed.path);
    const file = this.app.vault.getFileByPath(normalized);
    if (!file) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File not found" }));
      return;
    }

    await this.app.vault.modify(file, parsed.content);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  }

  // ── Helpers ──

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }
}
