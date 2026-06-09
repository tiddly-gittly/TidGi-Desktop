# VS Code MCP Integration

This document explains how to connect VS Code to the TidGi MCP server.

## Prerequisites

1. Enable the MCP server in TidGi preferences: **Preferences → Privacy → MCP Server Enabled**
2. The MCP server listens on `http://127.0.0.1:38385/mcp` by default (configurable via **MCP Server Port**).

## Token Authentication

By default, `mcpServerRequireToken` is `true`. You must generate a token:

1. Go to **Preferences → Privacy → MCP Server Token**
2. Click **Generate MCP Token** — a random 32-character hex token is created and saved.

## Configuring VS Code

Create or edit `.vscode/mcp.json` in your workspace:

### Without token (disable token auth in TidGi preferences)

If you disable **MCP Server Require Token** in TidGi preferences:

```json
{
  "servers": {
    "tidgi": {
      "type": "http",
      "url": "http://127.0.0.1:38385/mcp"
    }
  }
}
```

### With token

VS Code's built-in MCP client does **not** support custom HTTP headers (such as `Authorization: Bearer <token>`). This is a limitation of VS Code's `http` transport type in `.vscode/mcp.json` — it only accepts a `url` field.

As a workaround, TidGi's MCP server accepts the token as a **URL query parameter**:

```json
{
  "servers": {
    "tidgi": {
      "type": "http",
      "url": "http://127.0.0.1:38385/mcp?token=YOUR_32_CHAR_HEX_TOKEN"
    }
  }
}
```

Replace `YOUR_32_CHAR_HEX_TOKEN` with the actual token from TidGi preferences.

## Supported Auth Methods

| Method                                            | Bearer Header `Authorization: Bearer <token>` | Query Param `?token=<token>` |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| VS Code built-in MCP client                       | ❌ Not supported                              | ✅ Supported                 |
| Custom MCP clients (e.g., Claude Desktop, script) | ✅ Supported                                  | ✅ Supported                 |
| curl / wget                                       | ✅ Supported                                  | ✅ Supported                 |

## Troubleshooting

- **401 Unauthorized**: Token is required but not provided, or token doesn't match. Check TidGi preferences or regenerate the token.
- **Connection refused**: MCP server is not running. Check that **MCP Server Enabled** is `true` in preferences.
- **Port in use**: Change the port in **Preferences → Privacy → MCP Server Port**.
