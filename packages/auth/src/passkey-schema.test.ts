import { describe, expect, it } from "vitest";
import { parseTransports, serializeTransports } from "./passkey-schema.js";

describe("transports (de)serialization", () => {
  it("round-trips a list", () => {
    expect(serializeTransports(["usb", "nfc"])).toBe('["usb","nfc"]');
    expect(parseTransports('["usb","nfc"]')).toEqual(["usb", "nfc"]);
  });

  it("treats empty/absent as null/undefined", () => {
    expect(serializeTransports(undefined)).toBeNull();
    expect(serializeTransports([])).toBeNull();
    expect(parseTransports(null)).toBeUndefined();
    expect(parseTransports("")).toBeUndefined();
  });

  it("ignores malformed json", () => {
    expect(parseTransports("not json")).toBeUndefined();
    expect(parseTransports("{}")).toBeUndefined();
  });
});
