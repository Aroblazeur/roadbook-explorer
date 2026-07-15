import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chooseRelevantDescription, evaluateResourceCandidate } from "./resource-enrichment-quality.js";

const MAX_HTML_BYTES = 600_000;
const FETCH_TIMEOUT_MS = 6_000;

function cleanText(value, maxLength = 800) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function pageTextBlocks(html) {
  const cleaned = String(html ?? "")
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " ");
  return [...cleaned.matchAll(/<(?:h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/(?:h[1-6]|p|li)>/gi)]
    .map(match => cleanText(match[1], 1_200))
    .filter(Boolean);
}

function relevantPageImage(html, pageUrl, item) {
  const nameTerms = String(item?.name ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 4);
  const images = [];
  for (const match of String(html ?? "").matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const source = tag.match(/(?:src|data-src|data-lazy-src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const raw = source?.[1] ?? source?.[2] ?? source?.[3] ?? "";
    if (!raw || /(?:logo|favicon|icon|spinner|avatar|\.svg(?:\?|$))/i.test(raw)) continue;
    const alt = tag.match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const evidence = `${alt?.[1] ?? alt?.[2] ?? ""} ${raw}`.toLowerCase();
    try {
      const url = new URL(raw, pageUrl);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      images.push({ url: url.toString(), score: nameTerms.filter(term => evidence.includes(term)).length });
    } catch {}
  }
  images.sort((left, right) => right.score - left.score);
  return images[0]?.score > 0 ? images[0].url : "";
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
    const addresses = await lookup(hostname, { all: true, verbatim: true });
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

export function parsePageMetadata(html, pageUrl, item = {}) {
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
  const blocks = pageTextBlocks(html);
  const pageEvidence = cleanText(String(html ?? "").replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " "), 20_000);
  const metaDescription = metaContent(html, ["og:description", "twitter:description", "description"]);
  const metaIdentity = evaluateResourceCandidate(
    { ...item, region: "", locations: [] },
    { description: metaDescription },
  ).identity;
  const description = (metaIdentity >= 2 ? metaDescription : "") || chooseRelevantDescription(blocks, item);
  const siteName = metaContent(html, ["og:site_name"]) || canonicalUrl.hostname.replace(/^www\./, "");
  return {
    image: image || relevantPageImage(html, canonicalUrl, item),
    description: cleanText(description, 800),
    title: cleanText(title, 200),
    evidence: `${blocks.join(" ")} ${pageEvidence}`.slice(0, 20_000),
    preview: {
      title: cleanText(title, 200) || cleanText(item?.name, 200),
      description: cleanText(description, 400),
      siteName: cleanText(siteName, 100),
      url: canonicalUrl.toString(),
    },
  };
}

async function enrichFromLink(item) {
  let current = await safePublicUrl(item.url);
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
    return parsePageMetadata(await readLimitedText(response), current, item);
  }
  return null;
}

async function enrichFromWikipedia(item) {
  const query = [item?.name, item?.region, ...(Array.isArray(item?.locations) ? item.locations : [])]
    .map(value => cleanText(value))
    .filter(Boolean)
    .join(" ");
  if (!query) return [];
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
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
  if (!response.ok) return [];
  const payload = await response.json();
  return Object.values(payload?.query?.pages ?? {}).map(page => {
    const description = cleanText(page.extract, 800);
    const url = String(page.fullurl ?? "");
    const title = cleanText(page.title, 200);
    return {
      image: String(page.thumbnail?.source ?? ""),
      description,
      title,
      evidence: `${title} ${description}`,
      preview: url ? { title, description: cleanText(description, 400), siteName: "Wikipédia", url } : null,
    };
  });
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
  const fallback = fallbackPreview(item);
  if (item.url) {
    const linkResult = await enrichFromLink(item).catch(() => null);
    const quality = evaluateResourceCandidate(item, linkResult);
    if (linkResult && quality.accepted) {
      return {
        id: item.id,
        image: linkResult.image,
        description: linkResult.description,
        preview: linkResult.preview ?? fallback,
        confidence: "high",
        source: "link",
      };
    }
  }
  if (item.name) {
    const wikiResults = await enrichFromWikipedia(item).catch(() => []);
    for (const wikiResult of wikiResults) {
      const quality = evaluateResourceCandidate(item, wikiResult);
      if (quality.accepted) {
        return {
          id: item.id,
          image: wikiResult.image,
          description: wikiResult.description,
          preview: wikiResult.preview ?? fallback,
          confidence: "high",
          source: "wikipedia",
        };
      }
    }
  }
  return { id: item.id, image: "", description: "", preview: fallback, confidence: "low", source: null };
}
