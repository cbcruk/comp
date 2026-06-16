/** A registered passkey credential, stored in a backend of the app's choosing. */
export interface StoredCredential {
  /** base64url credential id. */
  id: string;
  /** base64url COSE public key. */
  publicKey: string;
  counter: number;
  transports?: string[];
  userId: string;
}

/**
 * Persistence for the passkey ceremonies. Kept as an interface so the app owns
 * the datastore (D1, KV, Postgres) while the ceremony logic stays portable.
 * Challenges are single-use: `takeChallenge` reads and deletes.
 */
export interface PasskeyStore {
  saveChallenge(userId: string, challenge: string): Promise<void> | void;
  takeChallenge(userId: string): Promise<string | null> | string | null;
  saveCredential(credential: StoredCredential): Promise<void> | void;
  getCredentialsByUser(
    userId: string,
  ): Promise<StoredCredential[]> | StoredCredential[];
  getCredentialById(
    id: string,
  ): Promise<StoredCredential | null> | StoredCredential | null;
  updateCounter(id: string, counter: number): Promise<void> | void;
}
