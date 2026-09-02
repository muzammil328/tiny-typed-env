export type EnvIssue = {
  key: string;
  message: string;
};

export class EnvError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super(formatIssues(issues));
    this.name = "EnvError";
    this.issues = issues;
  }
}

export function formatIssues(issues: EnvIssue[]): string {
  const lines = issues.map((issue) => `  ${issue.key}: ${issue.message}`);
  return [
    "Invalid environment variables:",
    "",
    ...lines,
    "",
    "Fix your .env file or the host environment, then restart.",
  ].join("\n");
}
