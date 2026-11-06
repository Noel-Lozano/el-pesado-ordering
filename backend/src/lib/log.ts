// Structured JSON logs (coding_standards.md §10). Never pass full phone
// numbers or payment details; use maskPhone.

type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// "+526561234567" -> "***4567", matching how the store screen shows phones.
export function maskPhone(e164: string): string {
  return `***${e164.slice(-4)}`;
}
