// A one-shot message carried across a client-side navigation, e.g. "we
// replaced the note on Asado" shown on the menu after adding from the item
// page. Kept in memory: it survives router.push() but not a reload, which is
// fine for a courtesy message.

let pendingNotice: string | null = null;

export function setFlashNotice(message: string): void {
  pendingNotice = message;
}

// Returns the pending message (if any) and clears it.
export function consumeFlashNotice(): string | null {
  const message = pendingNotice;
  pendingNotice = null;
  return message;
}
