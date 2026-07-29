import type { FilterSummary } from "@comp/core";
import { describe, expect, it } from "vitest";
import { activeLabel, controlFor, optionsFor } from "./filter-controls.js";

const status: FilterSummary = {
  field: "status",
  kind: "choices",
  options: [
    { value: "draft", label: "draft" },
    { value: "paid", label: "paid" },
  ],
  nullable: false,
};

const placedAt: FilterSummary = {
  field: "placedAt",
  kind: "date",
  options: [],
  nullable: false,
};

const customerId: FilterSummary = {
  field: "customerId",
  kind: "relation",
  options: [],
  nullable: true,
  table: "customers",
  collection: "customers",
  labelField: "name",
};

const reference: FilterSummary = {
  field: "reference",
  kind: "exact",
  options: [],
  nullable: false,
};

describe("controlFor", () => {
  it("picks a control from the kind", () => {
    expect(controlFor(status)).toBe("select");
    expect(controlFor(placedAt)).toBe("select");
    expect(controlFor(customerId)).toBe("reference");
    expect(controlFor(reference)).toBe("text");
  });

  it("falls back to text when a relation was never bound", () => {
    expect(controlFor({ ...customerId, collection: undefined })).toBe("text");
  });
});

describe("optionsFor", () => {
  it("offers an enum its own values", () => {
    expect(optionsFor(status).map((o) => o.value)).toEqual(["draft", "paid"]);
  });

  it("offers a date its presets, already encoded", () => {
    expect(optionsFor(placedAt).map((o) => o.value)).toEqual([
      "preset:today",
      "preset:past7",
      "preset:month",
      "preset:year",
    ]);
  });

  it("adds empty/not-empty only where the column allows null", () => {
    expect(optionsFor(customerId).map((o) => o.value)).toEqual([
      "isnull:true",
      "isnull:false",
    ]);
    expect(optionsFor(status).some((o) => o.value.startsWith("isnull:"))).toBe(false);
  });
});

describe("activeLabel", () => {
  it("names the chosen option", () => {
    expect(activeLabel(status, "draft")).toBe("draft");
    expect(activeLabel(placedAt, "preset:month")).toBe("This month");
    expect(activeLabel(customerId, "isnull:true")).toBe("Empty");
  });

  it("shows a raw value that matches no option", () => {
    expect(activeLabel(reference, "A-1")).toBe("A-1");
    expect(activeLabel(customerId, "7")).toBe("7");
    expect(activeLabel(placedAt, "range:2026-01-01..2026-02-01")).toBe(
      "range:2026-01-01..2026-02-01",
    );
  });

  it("reports nothing for an unset or unusable filter", () => {
    expect(activeLabel(status, undefined)).toBeNull();
    expect(activeLabel(status, "")).toBeNull();
    expect(activeLabel(placedAt, "preset:someday")).toBeNull();
  });
});
