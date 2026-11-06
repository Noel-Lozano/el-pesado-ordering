const UUID_BYTE_LENGTH = 16;
const UUID_VERSION_4 = 0x40;
const UUID_VARIANT_RFC4122 = 0x80;

// crypto.randomUUID only exists in secure contexts (HTTPS or localhost), so
// testing from a phone over http://<LAN IP> would break without the fallback.
// getRandomValues is available everywhere and is still cryptographically random.
export function createUuid(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | UUID_VERSION_4;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | UUID_VARIANT_RFC4122;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
