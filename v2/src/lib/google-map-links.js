const GOOGLE_MAP_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
]);

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function decodeMapSegment(value) {
  try {
    return decodeURIComponent(value).replace(/\+/g, " ").trim();
  } catch {
    return String(value ?? "").replace(/\+/g, " ").trim();
  }
}

function routeSegments(url) {
  const marker = "/maps/dir/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return [];
  const segments = [];
  for (const segment of url.pathname.slice(markerIndex + marker.length).split("/")) {
    if (!segment || segment.startsWith("@") || segment.startsWith("data=")) break;
    segments.push(decodeMapSegment(segment));
  }
  return segments.filter(Boolean);
}

function directionFlag(url) {
  const travelMode = url.searchParams.get("travelmode");
  if (travelMode === "bicycling") return "b";
  if (travelMode === "walking") return "w";
  if (travelMode === "transit") return "r";
  const source = `${url.pathname}${url.search}`;
  if (source.includes("!3e1")) return "b";
  if (source.includes("!3e2")) return "w";
  if (source.includes("!3e3")) return "r";
  return "d";
}

export function googleMapsEmbedUrl(value) {
  const url = safeHttpUrl(value);
  if (!url || !GOOGLE_MAP_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.pathname.startsWith("/maps/embed") || url.searchParams.get("output") === "embed") return url.toString();

  const locations = routeSegments(url);
  if (locations.length >= 2) {
    const embed = new URL("https://www.google.com/maps");
    embed.searchParams.set("output", "embed");
    embed.searchParams.set("saddr", locations[0]);
    embed.searchParams.set("daddr", locations.at(-1));
    embed.searchParams.set("dirflg", directionFlag(url));
    return embed.toString();
  }

  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  if (origin && destination) {
    const waypoints = (url.searchParams.get("waypoints") || "").split("|").filter(Boolean);
    const embed = new URL("https://www.google.com/maps");
    embed.searchParams.set("output", "embed");
    embed.searchParams.set("saddr", origin);
    embed.searchParams.set("daddr", [...waypoints, destination].join(" to:"));
    embed.searchParams.set("dirflg", directionFlag(url));
    return embed.toString();
  }

  const placeMatch = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  const query = placeMatch ? decodeMapSegment(placeMatch[1]) : url.searchParams.get("q");
  if (query) {
    const embed = new URL("https://www.google.com/maps");
    embed.searchParams.set("q", query);
    embed.searchParams.set("output", "embed");
    return embed.toString();
  }
  return null;
}

export async function resolveMapDisplay(value) {
  const source = safeHttpUrl(value);
  if (!source) return { embedUrl: null, externalUrl: null, converted: false };

  const directEmbed = googleMapsEmbedUrl(source);
  if (directEmbed) return { embedUrl: directEmbed, externalUrl: source.toString(), converted: directEmbed !== source.toString() };

  if (source.hostname.toLowerCase() !== "maps.app.goo.gl") {
    return { embedUrl: source.toString(), externalUrl: source.toString(), converted: false };
  }

  try {
    const response = await fetch(source, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 },
    });
    const location = response.headers.get("location");
    await response.body?.cancel();
    const expanded = location ? new URL(location, source) : null;
    const embedUrl = googleMapsEmbedUrl(expanded);
    return { embedUrl, externalUrl: source.toString(), converted: Boolean(embedUrl) };
  } catch {
    return { embedUrl: null, externalUrl: source.toString(), converted: false };
  }
}
