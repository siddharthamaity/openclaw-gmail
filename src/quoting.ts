import sanitizeHtml from "sanitize-html";
import type { GmailClient } from "./gmail-client.js";

export interface QuotedContent {
  header: string;        // "On Mon, Feb 22, 2026 at 2:15 PM, John Doe wrote:"
  bodyHtml: string;      // Sanitized HTML from original message
  bodyPlain: string;     // Plain text from original message (with > prefix)
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  date: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  bodyHtml: string;
  labels: string[];
}

export interface ThreadResponse {
  id: string;
  historyId: string;
  messages: ThreadMessage[];
}

// Canonical raw-message shape that backend clients map their API responses into.
export interface GogRawMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GogRawMessagePart[];
}

export interface GogRawMessage {
  id: string;
  threadId: string;
  internalDate: string;
  labelIds: string[];
  payload: {
    headers: { name: string; value: string }[];
    parts?: GogRawMessagePart[];
    body?: { size?: number; data?: string; attachmentId?: string };
  };
}

/**
 * Format a date string for the quote header
 */
function formatQuoteDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Extract display name or email from "Name <email>" format
 */
function extractSenderDisplay(from: string): string {
  const match = from.match(/^(.*?)\s*<(.*)>$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, "").trim();
    return name || match[2];
  }
  return from;
}

/**
 * Prefix each line with "> " for plain text quoting
 */
function quoteBody(body: string): string {
  return body.split("\n").map((line) => `> ${line}`).join("\n");
}

/**
 * Sanitize HTML for safe embedding in a blockquote.
 * Preserves formatting (bold, links, lists) while removing dangerous content.
 */
function sanitizeQuoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "span", "div", "br", "hr"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["style", "class", "dir"],
    },
  });
}

/**
 * Build quoted context from the most recent non-self message.
 * Gmail standard: only quote the last message (which itself contains older quotes).
 * This avoids nested/staggered quoting.
 *
 * Returns structured QuotedContent for separate HTML and plain text rendering.
 */
export function buildQuotedThread(
  messages: ThreadMessage[],
  accountEmail: string
): QuotedContent | null {
  // Filter out messages from the account itself
  const otherMessages = messages.filter((msg) => {
    const emailMatch = msg.from.match(/<(.*)>/);
    const senderEmail = emailMatch ? emailMatch[1] : msg.from;
    return senderEmail.toLowerCase() !== accountEmail.toLowerCase();
  });

  if (otherMessages.length === 0) {
    return null;
  }

  // Only quote the most recent message from others (last in array = newest)
  const lastMsg = otherMessages[otherMessages.length - 1];
  const sender = extractSenderDisplay(lastMsg.from);
  const date = formatQuoteDate(lastMsg.date);
  const header = `On ${date}, ${sender} wrote:`;

  // HTML: sanitize original HTML body, fall back to plain text
  const rawHtml = lastMsg.bodyHtml || lastMsg.body;
  const bodyHtml = sanitizeQuoteHtml(rawHtml);

  // Plain text: prefix each line with >
  const bodyPlain = quoteBody(lastMsg.body.trim());

  return { header, bodyHtml, bodyPlain };
}

/**
 * Fetch and format quoted context for a thread reply.
 * Returns structured QuotedContent or null if unavailable.
 */
export async function fetchQuotedContext(
  threadId: string,
  accountEmail: string,
  client: GmailClient,
): Promise<QuotedContent | null> {
  const thread = await client.getThread(threadId, { full: true });
  if (!thread || !thread.messages || thread.messages.length === 0) {
    return null;
  }

  return buildQuotedThread(thread.messages, accountEmail);
}
