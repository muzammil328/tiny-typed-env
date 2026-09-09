export type EnvIssue = {
  key: string;
  message: string;
};

/**
 * Keys that look like secrets — values must never appear in boot errors.
 * Matches API_KEY, SECRET, TOKEN, PASSWORD, STRIPE_KEY, etc.
 */
const SECRET_KEY =
  /(?:^|_)(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|AUTH|BEARER|JWT|SALT|ENCRYPTION|SIGNING)(?:_|$)|(?:^|_)(KEY|SECRET|TOKEN|PASSWORD)$/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/**
 * Strip leaked values from validator messages for secret-looking keys.
 * Keeps the reason (Required, too short, …) without echoing the secret.
 */
export function redactIssueMessage(key: string, message: string): string {
  if (!isSecretKey(key)) return message;

  // Built-in validators never embed the raw value in these forms.
  if (
    message === "Required" ||
    message.startsWith("Must be") ||
    (message.startsWith("Expected") &&
      !/["'`]/.test(message) &&
      !/\breceived\b/i.test(message))
  ) {
    return message;
  }

  return message
    .replace(/\b[Rr]eceived:?\s*.+$/g, "Received: [redacted]")
    .replace(/\b[Ii]nput:?\s*.+$/g, "Input: [redacted]")
    .replace(/"[^"]*"/g, '"[redacted]"')
    .replace(/'[^']*'/g, "'[redacted]'")
    .replace(/`[^`]*`/g, "`[redacted]`");
}

export class EnvError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    const safe = issues.map((issue) => ({
      key: issue.key,
      message: redactIssueMessage(issue.key, issue.message),
    }));
    super(formatIssues(safe));
    this.name = "EnvError";
    this.issues = safe;
  }
}

export function formatIssues(issues: EnvIssue[]): string {
  const lines = issues.map((issue) => {
    const message = redactIssueMessage(issue.key, issue.message);
    return `  ${issue.key}: ${message}`;
  });
  return [
    "Invalid environment variables:",
    "",
    ...lines,
    "",
    "Fix your .env file or the host environment, then restart.",
  ].join("\n");
}
