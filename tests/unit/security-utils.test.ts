import { describe, it, expect } from "vitest";
import { passwordProblems } from "@/lib/auth/password";
import { sniff } from "@/lib/storage/files";
import { toCsv } from "@/lib/reports";
import { hashToken } from "@/lib/auth/crypto";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { escapeHtml, renderEmail } from "@/lib/email/templates";
import { parseLagosInput, toLagosInput } from "@/lib/utils";

describe("security utilities", () => {
  it("enforces password strength", () => {
    expect(passwordProblems("Short1")).not.toEqual([]);
    expect(passwordProblems("alllowercase123")).not.toEqual([]);
    expect(passwordProblems("Lagos2026School")).toEqual([]);
    expect(passwordProblems("Password123").join()).toMatch(/common/);
    expect(passwordProblems("password123", 10).join()).toMatch(/common|upper/);
    expect(passwordProblems("Tolulope2026x", 10, "tolulope@example.com").join()).toMatch(/email/);
  });
  it("detects file types by magic bytes, not extension", () => {
    expect(sniff(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniff(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniff(Buffer.from("MZ\x90\x00"))).toBeNull();
  });
  it("neutralises CSV formula injection", () => {
    const csv = toCsv({ title: "t", headers: ["name"], rows: [["=HYPERLINK(\"http://x\")"], ["+1"], ["normal, with comma"]] });
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain('"normal, with comma"');
  });
  it("hashes tokens deterministically without exposing them", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("secret-token")).not.toContain("secret");
    expect(hashToken("abc")).toHaveLength(64);
  });
  it("rate limits within a window", () => {
    _resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    expect(rateLimit("k", 3, 60_000).ok).toBe(false);
  });
  it("escapes user content in emails", () => {
    expect(escapeHtml(`<img src=x onerror="a">`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
    expect(renderEmail({ heading: "<b>x</b>", paragraphs: ["<script>"] }).html).not.toContain("<script>");
  });
  it("interprets datetime inputs as Lagos time (UTC+1)", () => {
    expect(parseLagosInput("2026-11-23T09:00")!.toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(toLagosInput(new Date("2026-11-23T08:00:00Z"))).toBe("2026-11-23T09:00");
    expect(parseLagosInput("")).toBeNull();
  });
});
