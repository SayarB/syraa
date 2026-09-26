import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** A URL the web_fetch tool refuses to read. The message is safe to show the user. */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

// Loopback, private, link-local, CGNAT (incl. Tailscale), and reserved ranges.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** IPv4 address embedded in an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:hex:hex). */
function mappedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const tail = lower.slice("::ffff:".length);
  if (isIP(tail) === 4) return tail;

  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family !== 6) return true;

  const mapped = mappedIpv4(address);
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, "ipv6");
}

function isInternalHostname(host: string): boolean {
  // Single-label names are compose services (postgres, api, searxng) or LAN hosts.
  if (!host.includes(".")) return true;
  return host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host);
}

/**
 * Accepts only public http(s) URLs on standard ports whose host resolves exclusively to public
 * addresses. Throws BlockedUrlError otherwise.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("That isn't a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https pages can be read.");
  }
  if (url.username || url.password) {
    throw new BlockedUrlError("URLs with credentials can't be read.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new BlockedUrlError("Only pages on standard web ports can be read.");
  }

  // URL keeps IPv6 literals in brackets.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedUrlError("That address is not public.");
    return url;
  }
  if (isInternalHostname(host)) throw new BlockedUrlError("That address is not public.");

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError("That site's address couldn't be found.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedUrlError("That address is not public.");
  }
  return url;
}
