/**
 * Minimal .env parser (KEY=value). Does not execute shell syntax.
 */
export function parseEnvFile(source: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const stripped = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;

    const key = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = stripped.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(" #");
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    value = value
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll("\\t", "\t");

    result[key] = value;
  }

  return result;
}

export function exampleEnv(keys: string[]): string {
  return keys.map((key) => `${key}=`).join("\n") + "\n";
}
