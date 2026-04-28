import { describe, expect, it } from "vitest";

import type { CredentialStatus } from "../../inventory/types";
import { reconcileCredentialRow, resolveStatusConflict } from "../conflict";

describe("resolveStatusConflict (Phase G T095)", () => {
  it("revoked beats active (security invariant)", () => {
    expect(resolveStatusConflict("active", "revoked")).toBe("revoked");
    expect(resolveStatusConflict("revoked", "active")).toBe("revoked");
  });

  it("compromised beats active", () => {
    expect(resolveStatusConflict("active", "compromised")).toBe("compromised");
    expect(resolveStatusConflict("compromised", "active")).toBe("compromised");
  });

  it("revoked beats compromised (revoke is final)", () => {
    expect(resolveStatusConflict("compromised", "revoked")).toBe("revoked");
    expect(resolveStatusConflict("revoked", "compromised")).toBe("revoked");
  });

  it("undefined current → incoming wins", () => {
    expect(resolveStatusConflict(undefined, "active")).toBe("active");
    expect(resolveStatusConflict(undefined, "revoked")).toBe("revoked");
  });

  it("equal priority → incoming wins (LWW within tier)", () => {
    expect(resolveStatusConflict("active", "active")).toBe("active");
    expect(resolveStatusConflict("revoked", "revoked")).toBe("revoked");
  });
});

describe("reconcileCredentialRow", () => {
  type Row = { id: string; status?: CredentialStatus; name?: string };

  it("preserves stronger current status while taking other fields from incoming", () => {
    const current: Row = { id: "crd_1", status: "revoked", name: "old" };
    const incoming: Row = { id: "crd_1", status: "active", name: "renamed" };
    const merged = reconcileCredentialRow(current, incoming);
    expect(merged).toEqual({ id: "crd_1", status: "revoked", name: "renamed" });
  });

  it("accepts incoming wholesale when its status is stronger", () => {
    const current: Row = { id: "crd_1", status: "active", name: "old" };
    const incoming: Row = { id: "crd_1", status: "revoked", name: "renamed" };
    const merged = reconcileCredentialRow(current, incoming);
    expect(merged).toBe(incoming);
  });

  it("returns incoming as-is when current is undefined", () => {
    const incoming: Row = { id: "crd_1", status: "active" };
    expect(reconcileCredentialRow<Row>(undefined, incoming)).toBe(incoming);
  });

  it("returns incoming as-is when incoming has no status field", () => {
    const current: Row = { id: "crd_1", status: "revoked" };
    const incoming: Row = { id: "crd_1", name: "x" };
    expect(reconcileCredentialRow(current, incoming)).toBe(incoming);
  });
});
