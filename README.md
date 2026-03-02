# JotTab Bridge

Obsidian plugin that serves your vault data over localhost HTTP for the [JotTab](https://jottab.com) Chrome extension.

## What it does

JotTab Bridge creates a lightweight HTTP server on `127.0.0.1:27124` that lets the JotTab new tab extension read and write your Obsidian notes. Everything runs 100% locally — no cloud, no external servers.

## Security

- **Localhost only** — the server binds to `127.0.0.1`, inaccessible from the network
- **CORS whitelist** — only the JotTab Chrome extension origin is allowed
- **Custom header** — all requests require an `X-JotTab` header
- **Bearer token** — each vault gets a unique auto-generated token for authentication

## Installation

### Via BRAT (recommended)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Open BRAT Settings → **Add Beta Plugin**
3. Enter: `sil-so/jottab-bridge`
4. Enable **JotTab Bridge** in Community Plugins

### Manual
1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/sil-so/jottab-bridge/releases/latest)
2. Create `.obsidian/plugins/jottab-bridge/` in your vault
3. Place both files inside
4. Enable in Community Plugins

## Usage

1. Open Obsidian — you should see: *"JotTab Bridge running on port 27124"*
2. Run the command `JotTab Bridge: Show connection token` to copy your token
3. In JotTab's settings (Obsidian tab), paste the token and click **Connect**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Health check, returns vault name |
| `/list` | GET | List all `.md` files in the vault |
| `/read?path=...` | GET | Read a specific note's content |
| `/write` | POST | Write content to a specific note |

## Building from source

```bash
npm install
npm run build
```

## License

MIT
