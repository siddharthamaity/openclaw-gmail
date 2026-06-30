import type { OpenClawConfig, ChannelOnboardingAdapter } from "openclaw/plugin-sdk";
import { promptAccountId } from "openclaw/plugin-sdk";
import { listGmailAccountIds, resolveDefaultGmailAccountId } from "./accounts.js";
import { readGogCredentials, runOAuthFlow, createOAuth2Client } from "./auth.js";
import { ApiGmailClient } from "./api-client.js";

const channel = "openclaw-gmail" as const;

async function fetchApiDisplayName(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string | undefined> {
  try {
    const auth = createOAuth2Client({ clientId, clientSecret, refreshToken });
    const client = new ApiGmailClient(auth);
    const sendAs = await client.getSendAs();
    const primary = sendAs.find((s) => s.isPrimary) || sendAs[0];
    return primary?.displayName;
  } catch {
    return undefined;
  }
}

export const gmailOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }: { cfg: OpenClawConfig }) => {
    const ids = listGmailAccountIds(cfg);
    const configured = ids.length > 0;
    return {
      channel,
      configured,
      statusLines: [`Gmail: ${configured ? `${ids.length} accounts` : "not configured"}`],
      selectionHint: "Gmail API",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
  }: {
    cfg: OpenClawConfig;
    prompter: {
      text: (opts: { message: string; validate?: (val?: string) => string | undefined; initialValue?: string }) => Promise<string>;
      confirm: (opts: { message: string; initialValue?: boolean }) => Promise<boolean>;
      note: (message: string, title?: string) => Promise<void>;
    };
    accountOverrides: Record<string, string>;
    shouldPromptAccountIds: boolean;
  }) => {
    // --- Account selection ---
    const existingIds = listGmailAccountIds(cfg);
    const gmailOverride = (accountOverrides["openclaw-gmail"] ?? accountOverrides.gmail)?.trim();
    const defaultAccountId = resolveDefaultGmailAccountId(cfg);
    let accountId = gmailOverride || defaultAccountId;

    if (shouldPromptAccountIds && !gmailOverride && existingIds.length > 0) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Gmail",
        currentId: accountId,
        listAccountIds: listGmailAccountIds,
        defaultAccountId,
      });
    }

    // --- Email prompt ---
    let email = accountId.includes("@") ? accountId : undefined;
    if (!email) {
      email = await prompter.text({
        message: "Gmail address",
        validate: (val: string | undefined) => (val?.includes("@") ? undefined : "Valid email required"),
      });
    }
    if (!email) throw new Error("Email required");

    // --- Resolve OAuth credentials ---
    const gmailConfig = (cfg.channels as any)?.["openclaw-gmail"] || {};
    const existingOAuth = gmailConfig.accounts?.[email]?.oauth;

    let clientId: string | undefined = existingOAuth?.clientId;
    let clientSecret: string | undefined = existingOAuth?.clientSecret;
    let refreshToken: string | undefined = existingOAuth?.refreshToken;

    if (clientId && clientSecret && refreshToken) {
      // Existing API account — reuse, optionally re-authorize
      await prompter.note(`Using existing API credentials for ${email}.`, "OAuth Credentials");
      const reAuth = await prompter.confirm({
        message: "Re-authorize with Google? (only needed if token expired)",
        initialValue: false,
      });
      if (reAuth) {
        refreshToken = await runOAuthFlow(clientId, clientSecret);
      }
    } else {
      // Need client credentials — reuse gog's OAuth client if present, else prompt
      if (!clientId || !clientSecret) {
        const gogCreds = readGogCredentials();
        if (gogCreds) {
          clientId = gogCreds.clientId;
          clientSecret = gogCreds.clientSecret;
          await prompter.note(
            "Reusing OAuth client credentials found at ~/.config/gogcli/credentials.json.",
            "OAuth Credentials",
          );
        } else {
          await prompter.note(
            "To use Gmail with OpenClaw, you need a Google Cloud OAuth client:\n" +
              "1. Go to https://console.cloud.google.com/apis/credentials\n" +
              "2. Create a project (or use existing)\n" +
              "3. Enable the Gmail API\n" +
              "4. Create OAuth 2.0 Client ID (type: Desktop app)\n" +
              "5. Copy the Client ID and Client Secret",
            "GCP OAuth Setup",
          );
          clientId = await prompter.text({
            message: "OAuth Client ID",
            validate: (val?: string) => (val?.trim() ? undefined : "Client ID required"),
          });
          clientSecret = await prompter.text({
            message: "OAuth Client Secret",
            validate: (val?: string) => (val?.trim() ? undefined : "Client Secret required"),
          });
        }
      }

      await prompter.note("A browser window will open for Gmail authorization.", "OAuth Flow");
      refreshToken = await runOAuthFlow(clientId!, clientSecret!);
    }

    // --- Common prompts ---
    const allowFromRaw = await prompter.text({
      message: "Allow emails from (comma separated, * for all)",
      initialValue: "",
    });
    const allowFrom = allowFromRaw.split(",").map((s: string) => s.trim()).filter(Boolean);

    const pollIntervalSecsRaw = await prompter.text({
      message: "Polling interval (seconds)",
      initialValue: "60",
      validate: (val: string | undefined) => {
        const n = parseInt(val || "", 10);
        return isNaN(n) || n < 1 ? "Positive integer required" : undefined;
      },
    });
    const pollIntervalMs = parseInt(pollIntervalSecsRaw, 10) * 1000;

    const name = await fetchApiDisplayName(clientId!, clientSecret!, refreshToken!);

    // --- Build account config ---
    const accountConfig: Record<string, unknown> = {
      enabled: true,
      email,
      name,
      allowFrom,
      pollIntervalMs,
      backend: "api",
      oauth: { clientId, clientSecret, refreshToken },
    };

    const accounts = gmailConfig.accounts || {};

    const next = {
      ...cfg,
      channels: {
        ...cfg.channels,
        "openclaw-gmail": {
          dmPolicy: "allowlist",
          archiveOnReply: true,
          ...gmailConfig,
          enabled: true,
          accounts: {
            ...accounts,
            [email]: accountConfig,
          },
        },
      },
    };

    return { cfg: next, accountId: email };
  },
  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      "openclaw-gmail": { ...(cfg.channels as any)?.["openclaw-gmail"], enabled: false },
    },
  }),
};
