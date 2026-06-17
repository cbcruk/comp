import { useState, type JSX } from "react";
import type { PasskeyClient } from "./passkey-client.types.js";

export interface PasskeyLoginProps {
  client: PasskeyClient;
  /** Called after a successful sign-in. */
  onAuthenticated?: () => void;
}

/**
 * Minimal passkey register/sign-in form. Presentational shell over the passkey
 * client — apps restyle or recompose it; the ceremony logic lives in the client.
 */
export function PasskeyLogin({
  client,
  onAuthenticated,
}: PasskeyLoginProps): JSX.Element {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(
    action: () => Promise<void>,
    success: string,
    authenticated: boolean,
  ): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(success);
      if (authenticated) onAuthenticated?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label>
        User
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="user id"
        />
      </label>
      <button
        type="button"
        disabled={busy || userId === ""}
        onClick={() => run(() => client.register(userId, userId), "Passkey registered", false)}
      >
        Register passkey
      </button>
      <button
        type="button"
        disabled={busy || userId === ""}
        onClick={() => run(() => client.login(userId), "Signed in", true)}
      >
        Sign in
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}
