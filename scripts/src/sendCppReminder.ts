/**
 * Annual CPP calculator update reminder.
 *
 * Sends a single email reminding the maintainer to refresh the Modern Cents CPP
 * calculator with the new year's official CPP figures (see
 * `artifacts/cpp-calculator/RUNBOOK.md`). Designed to be run once a year, in
 * January, by a Replit Scheduled Deployment.
 *
 * Email is sent through the Gmail connector (Replit Integrations) so it goes out
 * from the connected Google account. The connectors SDK injects identity and
 * refreshes OAuth tokens automatically.
 *   Integration: google-mail (see `.replit` [agent].integrations)
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const DEFAULT_RECIPIENT = "andrea@moderncents.ca";

function getRecipients(): string {
  const fromEnv = process.env.CPP_REMINDER_TO?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_RECIPIENT;
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMessageBodies(year: number): { text: string; html: string } {
  const runbookPath = "artifacts/cpp-calculator/RUNBOOK.md";
  const checklist = [
    "Add the new year to YMPE_HISTORY, YAMPE_HISTORY, MAX_BENEFIT_AT_65, SURVIVOR_FLAT_RATE_HISTORY and CHILDREN_BENEFIT_HISTORY (src/cpp/constants.ts)",
    "Confirm YBE ($3,500) and the death benefit ($2,500) are unchanged",
    "Update the header comment year ranges in constants.ts",
    "Only change contribution/replacement rates if Parliament legislated a change (rare)",
    "Update the white paper's year-specific table and prose",
    "Update the tierBreakdown pinned year, then refresh the print-estimator snapshot (run test:e2e first)",
    "Run typecheck + tests, smoke-test in the preview, then publish",
  ];
  const sources = [
    "YMPE / YAMPE / YBE: CRA \u2014 CPP contribution rates, maximums and exemptions",
    "Benefit amounts: Service Canada \u2014 CPP payment amounts",
    "Indexation (CPI) reference: canada.ca \u2014 Consumer Price Index",
  ];

  const text = [
    `Time to update the Modern Cents CPP calculator for ${year}.`,
    "",
    "Each January the Government of Canada publishes the new CPP figures: benefit",
    "amounts are indexed to inflation (CPI) and the YMPE/YAMPE earnings ceilings",
    "rise with average wage growth. Until the new figures are entered, the",
    "calculator projects the current year using its growth assumptions rather than",
    "official numbers.",
    "",
    `Follow the runbook: ${runbookPath}`,
    "",
    "Checklist:",
    ...checklist.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    "Where to get the official numbers:",
    ...sources.map((s) => `  - ${s}`),
    "",
    "This is an automated annual reminder.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;padding:28px 28px 24px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5a4dd0;font-weight:600;">Annual reminder</p>
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#1d1d1f;">Update the CPP calculator for ${year}</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3a3c;">
          Each January the Government of Canada publishes the new CPP figures: benefit amounts are
          indexed to inflation (CPI) and the YMPE/YAMPE earnings ceilings rise with average wage growth.
          Until the new figures are entered, the calculator projects the current year using its growth
          assumptions rather than official numbers.
        </p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a3a3c;">
          Follow the runbook at <code style="background:#f0eefc;padding:2px 6px;border-radius:6px;color:#5a4dd0;">${runbookPath}</code>.
        </p>
        <h2 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#6e6e73;">Checklist</h2>
        <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.6;color:#3a3a3c;">
          ${checklist.map((c) => `<li style="margin-bottom:6px;">${c}</li>`).join("")}
        </ol>
        <h2 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#6e6e73;">Where to get the official numbers</h2>
        <ul style="margin:0 0 4px;padding-left:20px;font-size:14px;line-height:1.6;color:#3a3a3c;">
          ${sources.map((s) => `<li style="margin-bottom:6px;">${s}</li>`).join("")}
        </ul>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#8e8e93;">This is an automated annual reminder for the Modern Cents CPP calculator.</p>
    </div>
  </body>
</html>`;

  return { text, html };
}

function buildRawMessage(to: string, subject: string, year: number): string {
  const { text, html } = buildMessageBodies(year);
  const boundary = `cpp-reminder-${Date.now().toString(36)}`;
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

async function main(): Promise<void> {
  const to = getRecipients();
  const year = new Date().getFullYear();
  const subject = `Action needed: update the CPP calculator for ${year}`;
  const raw = base64Url(buildRawMessage(to, subject, year));

  // Dry-run: build the message but do not send. Useful for verifying the
  // bundled production build without delivering a duplicate email.
  if (process.env.CPP_REMINDER_DRY_RUN === "1") {
    console.log(
      `[dry-run] Would send "${subject}" to ${to} (${raw.length} base64url chars). No email sent.`,
    );
    return;
  }

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "<no body>");
    throw new Error(
      `Gmail send failed (HTTP ${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
  };
  console.log(
    `CPP update reminder for ${year} sent to ${to} (message id: ${result.id ?? "unknown"}).`,
  );
}

main().catch((err) => {
  console.error("Failed to send CPP update reminder:", err);
  process.exit(1);
});
