import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session.js";

const SECRET = "test-secret";

describe("session token", () => {
  it("round-trips a payload", async () => {
    const token = await signSession({ subject: "user-1", roles: ["admin"] }, SECRET);
    const payload = await verifySession(token, SECRET);
    expect(payload).toMatchObject({ subject: "user-1", roles: ["admin"] });
  });

  it("rejects a tampered body", async () => {
    const token = await signSession({ subject: "user-1" }, SECRET);
    const [, sig] = token.split(".");
    const forged = `${signSession ? "eyJzdWIiOiJoYXgifQ" : ""}.${sig}`;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", async () => {
    const token = await signSession({ subject: "user-1" }, SECRET);
    expect(await verifySession(token, "other-secret")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession({ subject: "user-1", exp: 1000 }, SECRET);
    expect(await verifySession(token, SECRET, 2000)).toBeNull();
    expect(await verifySession(token, SECRET, 500)).toMatchObject({
      subject: "user-1",
    });
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySession("not-a-token", SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
  });
});
