# openclaw-gmail

Gmail channel plugin for [OpenClaw](https://github.com/openclaw/openclaw). Connects directly to the Gmail API using OAuth2 — no external CLI required.

## Installation

```bash
openclaw plugins install @mcinteerj/openclaw-gmail
```

Or from a local clone:

```bash
openclaw plugins install --link /path/to/openclaw-gmail
```

Requires `openclaw >= 2026.1.0`.

## Setup

You need a Google Cloud OAuth client:

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a project (or use an existing one)
3. Enable the Gmail API
4. Create an OAuth 2.0 Client ID (type: **Desktop app**)
5. Copy the Client ID and Client Secret

Then run `openclaw configure`, select Gmail, and follow the prompts. The flow will:
- Ask for your email address
- Prompt for client credentials (or reuse a `~/.config/gogcli/credentials.json` client if present)
- Open a browser for OAuth consent
- Store the refresh token in your OpenClaw config

**Manual config** (if you prefer to skip the wizard):

```json5
{
  "channels": {
    "openclaw-gmail": {
      "accounts": {
        "you@gmail.com": {
          "email": "you@gmail.com",
          "oauth": {
            "clientId": "your-client-id.apps.googleusercontent.com",
            "clientSecret": "your-client-secret",
            "refreshToken": "your-refresh-token"
          },
          "allowFrom": ["*"],
          "pollIntervalMs": 60000
        }
      }
    }
  }
}
```

## Features

- **Polling-based sync**: Fetches new unread emails from Inbox
- **Rich text**: Markdown responses are converted to HTML emails via `marked`
- **Threading**: Native Gmail thread support with quoted reply context
- **Reply All**: Replies include all thread participants
- **Archiving**: Automatically archives threads upon reply
- **Email body sanitization**: Cleans incoming HTML for LLM consumption
- **MIME construction**: Builds RFC 2822 messages with proper threading headers

## Configuration

```json5
{
  "channels": {
    "openclaw-gmail": {
      "accounts": {
        "you@gmail.com": {
          "email": "you@gmail.com",
          "allowFrom": ["*"],
          "pollIntervalMs": 60000,
          "includeQuotedReplies": true,        // default: true
          "includeThreadContext": false,        // default: false
          "allowOutboundTo": ["@company.com"],  // optional
          "threadReplyPolicy": "allowlist"      // default: "open"
        }
      },
      "defaults": {
        "includeQuotedReplies": true,
        "includeThreadContext": false
      }
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `oauth` | object | — | OAuth credentials (`clientId`, `clientSecret`, `refreshToken`) |
| `allowFrom` | string[] | `[]` | Sender allowlist. `["*"]` allows all. |
| `pollIntervalMs` | number | `60000` | Polling interval in milliseconds |
| `includeQuotedReplies` | boolean | `true` | Include thread history as quoted text in replies |
| `includeThreadContext` | boolean | `false` | When an allowed sender replies in a thread containing messages from non-allowed senders, include those earlier messages as context. See [Thread Context](#thread-context). |
| `allowOutboundTo` | string[] | (falls back to `allowFrom`) | Restrict who the bot can send to. Supports domain wildcards (`@company.com`). |
| `threadReplyPolicy` | `"open"` \| `"allowlist"` \| `"sender-only"` | `"open"` | Controls reply restrictions |

### Thread Reply Policies

- **`open`** (default): No outbound restrictions. Backwards compatible.
- **`allowlist`**: All thread participants must be in `allowOutboundTo`.
- **`sender-only`**: Only checks if the original thread sender is allowed.

### Thread Context

When `includeThreadContext` is enabled, the plugin enriches inbound messages with prior thread history that the agent wouldn't otherwise see.

**The problem:** If someone not on the allow list emails the agent, their message is quarantined (never seen). If an allowed sender then replies to that thread asking the agent to review it, the agent only sees the allowed sender's new message — the quoted content from the non-allowed sender is stripped during sanitization.

**The solution:** With `includeThreadContext: true`, when an allowed sender's message arrives in a thread that contains earlier messages from non-allowed senders, those earlier messages are included as labelled context above the new message:

```
---
**Thread context** (1 earlier message from senders not on your allow list):

**From:** Hamish Smith <hamish@example.com>
**Date:** Mon, 24 Feb 2026 10:30:00 +1300

Hey Keith, can you book transfers for our Fiji trip?
---

[Thread Context: ID=abc123, Subject="Book Your Fast Fiji Transfers"]

Keith, can you please review Hamish's request below and action it?
```

This is **disabled by default** to preserve the existing allow list behavior where non-allowed senders' content is never shown. Enable it per-account or in `defaults` when you want allowed senders to be able to surface thread context from outside the allow list.

## Development

```bash
npx vitest run
```

## Publishing

Create a GitHub release or run the "Publish to npm" workflow via Actions.
