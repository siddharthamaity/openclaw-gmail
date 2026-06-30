// Config types for the Gmail channel.
// ponytail: plain TS, not zod — the runtime validates against the JSON schema
// in channel.ts (configSchema). One source of truth for validation; this is
// just the type. Keep the two in sync by hand.

export type GmailBackend = "gog" | "api";
export type ThreadReplyPolicy = "open" | "allowlist" | "sender-only";

export interface GmailOAuth {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailAccount {
  accountId?: string;
  name?: string;
  enabled?: boolean;
  email: string;
  allowFrom?: string[];
  historyId?: string;
  delegate?: string;
  pollIntervalMs?: number;
  includeQuotedReplies?: boolean;
  allowOutboundTo?: string[];
  threadReplyPolicy?: ThreadReplyPolicy;
  archiveOnReply?: boolean;
  includeThreadContext?: boolean;
  backend?: GmailBackend;
  oauth?: GmailOAuth;
}

export interface GmailDefaults {
  allowFrom?: string[];
  includeQuotedReplies?: boolean;
  allowOutboundTo?: string[];
  threadReplyPolicy?: ThreadReplyPolicy;
  archiveOnReply?: boolean;
  includeThreadContext?: boolean;
}

export interface GmailConfig {
  enabled?: boolean;
  blockStreaming?: boolean;
  accounts?: Record<string, GmailAccount>;
  defaults?: GmailDefaults;
}
