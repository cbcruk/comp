import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory-store.js";

describe("createMemoryStore", () => {
  it("consumes a challenge once", () => {
    const store = createMemoryStore();
    store.saveChallenge("u1", "abc");
    expect(store.takeChallenge("u1")).toBe("abc");
    expect(store.takeChallenge("u1")).toBeNull();
  });

  it("stores credentials and looks them up by id and user", () => {
    const store = createMemoryStore();
    store.saveCredential({ id: "c1", publicKey: "k", counter: 0, userId: "u1" });
    store.saveCredential({ id: "c2", publicKey: "k", counter: 0, userId: "u1" });
    store.saveCredential({ id: "c3", publicKey: "k", counter: 0, userId: "u2" });

    expect(store.getCredentialById("c1")?.userId).toBe("u1");
    expect(store.getCredentialById("missing")).toBeNull();
    expect(
      (store.getCredentialsByUser("u1") as { id: string }[]).map((c) => c.id),
    ).toEqual(["c1", "c2"]);
  });

  it("updates a credential counter", () => {
    const store = createMemoryStore();
    store.saveCredential({ id: "c1", publicKey: "k", counter: 0, userId: "u1" });
    store.updateCounter("c1", 5);
    expect(store.getCredentialById("c1")?.counter).toBe(5);
  });
});
