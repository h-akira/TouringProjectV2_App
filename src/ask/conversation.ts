// The conversation id the Backend issued and when it lapses (adr/0003). Kept in memory only.
export class ConversationState {
  private id: string | null = null;
  private expiry = 0;

  current(now: number): string | null {
    if (this.id !== null && Number.isFinite(this.expiry) && now < this.expiry) return this.id;
    this.reset();
    return null;
  }

  update(id: string, expiresAtIso: string): void {
    this.id = id;
    this.expiry = Date.parse(expiresAtIso);
  }

  reset(): void {
    this.id = null;
    this.expiry = 0;
  }

  expiresAt(now: number): number | null {
    return this.current(now) === null ? null : this.expiry;
  }
}
