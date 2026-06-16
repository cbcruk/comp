import { describe, expect, it } from "vitest";
import { parseCookies, readCookie, serializeCookie } from "./cookie.js";

describe("serializeCookie", () => {
  it("emits HttpOnly/Secure/SameSite by default", () => {
    const cookie = serializeCookie("sid", "abc", { maxAge: 3600 });
    expect(cookie).toContain("sid=abc");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=3600");
  });

  it("can opt out of Secure for local http", () => {
    expect(serializeCookie("sid", "abc", { secure: false })).not.toContain(
      "Secure",
    );
  });
});

describe("parseCookies / readCookie", () => {
  it("parses multiple cookies", () => {
    expect(parseCookies("a=1; b=2; c=3")).toEqual({ a: "1", b: "2", c: "3" });
    expect(parseCookies(null)).toEqual({});
  });

  it("reads a cookie off a request", () => {
    const request = new Request("http://x", { headers: { cookie: "sid=xyz" } });
    expect(readCookie(request, "sid")).toBe("xyz");
    expect(readCookie(request, "missing")).toBeNull();
  });
});
