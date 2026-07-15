import "server-only";

import { resolve } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 600_000;
const FETCH_TIMEOUT_MS = 6_000;

function cleanText(value, maxLength = 800) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function privateIp(address) {
  const normalized = String(address ?? "").toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (isIP(mapped) !== 4) return false;
  const parts = mapped.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224;
}

async function safePublicUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return null;
  if (isIP(hostname)) return privateIp(hostname) ? null : url;
  try {
    const addresses = await resolve(hostname, { all: true });
    if (!addresses.length || addresses.some(item => privateIp(item.address))) return null;
  } catch {
    return null;
  }
  return url;
}

async function readLimitedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    output += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return output.slice(0, MAX_HTML_BYTES);
}

function metaContent(html, keys) {
  const tags = String(html ?? "").match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    const key = String(attributes.property ?? attributes.name ?? "").toLowerCase();
    if (keys.includes(key) && attributes.content) return cleanText(attributes.content, 2_000);
  }
  return "";
}

export function parsePageMetadata(html, pageUrl) {
  const canonicalUrl = new URL(pageUrl);
  const rawImage = metaContent(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  let image = "";
  if (rawImage) {
    try {
      const imageUrl = new URL(rawImage, canonicalUrl);
      if (["http:", "https:"].includes(imageUrl.protocol)) image = imageUrl.toString();
    } catch {}
  }
  const titleTag = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = metaContent(html, ["og:title", "twitter:title"]) || cleanText(titleTag, 200);
  const description = metaContent(html, ["og:description", "twitter:description", "description"]);
  const siteName = metaContent(html, ["og:site_name"]) || canonicalUrl.hostname.replace(/^www\./, "");
  return {
    image,
    description: cleanText(description, 800),
    preview: {
      title: cleanText(title, 200),
      description: cleanText(description, 400),
      siteName: cleanText(siteName, 100),
      url: canonicalUrl.toString(),
    },
  };
}

async function enrichFromLink(value) {
  let current = await safePublicUrl(value);
  if (!current) return null;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "RoadBookExplorer/2.0 link-preview" },
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) return null;
      current = await safePublicUrl(new URL(location, current).toString());
      if (!current) return null;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.startsWith("image/")) {
      await response.body?.cancel().catch(() => {});
      return { image: current.toString(), description: "", preview: null };
    }
    if (!contentType.includes("text/html")) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return parsePageMetadata(await readLimitedText(response), current);
  }
  return null;
}

async function enrichFromWikipedia(name, region) {
  const query = [name, region].map(value => cleanText(value)).filter(Boolean).join(" ");
  if (!query) return null;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "1",
    prop: "extracts|pageimages|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    piprop: "thumbnail",
    pithumbsize: "1000",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "RoadBookExplorer/2.0 enrichment" },
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages ?? {})[0];
  if (!page) return null;
  const description = cleanText(page.extract, 800);
  const url = String(page.fullurl ?? "");
  return {
    image: String(page.thumbnail?.source ?? ""),
    description,
    preview: url ? { title: cleanText(page.title, 200), description: cleanText(description, 400), siteName: "Wikipédia", url } : null,
  };
}

function fallbackPreview(item) {
  try {
    const url = new URL(item.url);
    return { title: cleanText(item.name, 200), description: "", siteName: url.hostname.replace(/^www\./, ""), url: url.toString() };
  } catch {
    return null;
  }
}

export async function enrichResource(item) {
  const [linkResult, wikiResult] = await Promise.all([
    item.url ? enrichFromLink(item.url).catch(() => null) : null,
    item.name ? enrichFromWikipedia(item.name, item.region).catch(() => null) : null,
  ]);
  let image = linkResult?.image ?? "";
  let description = linkResult?.description ?? "";
  let preview = linkResult?.preview ?? fallbackPreview(item);
  image ||= wikiResult?.image ?? "";
  description ||= wikiResult?.description ?? "";
  preview ||= wikiResult?.preview ?? null;
  return { id: item.id, image, description, preview };
}
