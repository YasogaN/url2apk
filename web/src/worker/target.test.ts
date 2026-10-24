import { describe, expect, it } from "vitest";
import { isPrivateHost, parseTarget } from "./target";

describe("parseTarget", () => {
  it("accepts a public https url", () => {
    const result = parseTarget("https://example.com/path?q=1#frag");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hostname).toBe("example.com");
    }
  });

  it.each([
    "https://sub.example.co.uk",
    "https://xn--bcher-kva.example",
    "https://example.xn--p1ai",
    "https://8.8.8.8",
    "https://[2001:4860:4860::8888]",
    "https://example.com.",
    "https://foo.1.example.com",
  ])("accepts %s", (raw) => {
    expect(parseTarget(raw).ok).toBe(true);
  });

  it.each([
    ["", "Enter a valid https URL."],
    ["not a url", "Enter a valid https URL."],
    ["http://example.com", "Only https URLs are supported."],
    ["ftp://example.com/file", "Only https URLs are supported."],
    ["https://user@example.com", "URLs with credentials are not supported."],
    ["https://:pass@example.com", "URLs with credentials are not supported."],
    ["https://localhost", "Private and local hosts are not supported."],
    ["https://127.0.0.1", "Private and local hosts are not supported."],
    ["https://yasogan", "Enter a full domain name"],
    ["https://example", "Enter a full domain name"],
    ["https://example.c", "Enter a full domain name"],
    ["https://example.1z", "Enter a full domain name"],
    ["https://-bad.com", "Enter a full domain name"],
    ["https://bad-.com", "Enter a full domain name"],
    ["https://a..com", "Enter a full domain name"],
    ["https://foo_bar.com", "Enter a full domain name"],
    [`https://${"a".repeat(64)}.com`, "Enter a full domain name"],
    [
      `https://${"a".repeat(61)}.${"b".repeat(61)}.${"c".repeat(61)}.${"d".repeat(61)}.${"e".repeat(61)}.com`,
      "Enter a full domain name",
    ],
  ])("rejects %s", (raw, message) => {
    const result = parseTarget(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(message);
    }
  });
});

describe("isPrivateHost", () => {
  it.each([
    "localhost",
    "foo.localhost",
    "printer.local",
    "metadata.internal",
    "localhost.",
    "127.0.0.1",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "2130706433",
    "0x7f000001",
    "0177.0.0.1",
    "1.2.3",
    "1.2.3.256",
    "01.2.3.4",
    "[::1]",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:not-an-ip",
  ])("blocks %s", (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each([
    "example.com",
    "example.com.",
    "notlocalhost",
    "foo.localhost.example.com",
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255",
    "172.32.0.1",
    "192.169.0.1",
    "100.63.0.1",
    "100.128.0.1",
    "198.17.0.1",
    "198.20.0.1",
    "198.51.101.1",
    "203.0.114.1",
    "2001:4860:4860::8888",
    "[2001:4860:4860::8888]",
    "::ffff:8.8.8.8",
  ])("allows %s", (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });
});
