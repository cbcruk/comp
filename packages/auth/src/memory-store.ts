import type {
  PasskeyStore,
  StoredCredential,
} from "./passkey-store.types.js";

/**
 * In-memory {@link PasskeyStore} for tests and local development. Not for
 * production — state is lost on restart and not shared across isolates.
 */
export function createMemoryStore(): PasskeyStore {
  const challenges = new Map<string, string>();
  const credentials = new Map<string, StoredCredential>();

  return {
    saveChallenge(userId, challenge) {
      challenges.set(userId, challenge);
    },
    takeChallenge(userId) {
      const challenge = challenges.get(userId) ?? null;
      challenges.delete(userId);
      return challenge;
    },
    saveCredential(credential) {
      credentials.set(credential.id, credential);
    },
    getCredentialsByUser(userId) {
      return [...credentials.values()].filter((c) => c.userId === userId);
    },
    getCredentialById(id) {
      return credentials.get(id) ?? null;
    },
    updateCounter(id, counter) {
      const credential = credentials.get(id);
      if (credential) credentials.set(id, { ...credential, counter });
    },
  };
}
