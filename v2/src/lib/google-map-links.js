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

function unwrapConsentUrl(url) {
  if (!url || url.hostname.toLowerCase() !== "consent.google.com") return url;
  return safeHttpUrl(url.searchParams.get("continue"));
}

function routeFromUrl(url) {
  const source = unwrapConsentUrl(url);
  if (!source || !GOOGLE_MAP_HOSTS.has(source.hostname.toLowerCase())) return null;

  let locations = routeSegments(source);
  if (locations.length < 2) {
    const origin = source.searchParams.get("origin") || source.searchParams.get("saddr");
    const destination = source.searchParams.get("destination") || source.searchParams.get("daddr");
    const waypoints = (source.searchParams.get("waypoints") || "")
      .split("|")
      .map(decodeMapSegment)
      .filter(Boolean);
    if (origin && destination) {
      const destinationParts = destination.split(/\s+to:/i).map(decodeMapSegment).filter(Boolean);
      locations = [decodeMapSegment(origin), ...waypoints, ...destinationParts];
    }
  }
  if (locations.length < 2) return null;

  const flag = directionFlag(source);
  const travelMode = flag === "b" ? "BICYCLE" : flag === "w" ? "WALK" : flag === "r" ? "TRANSIT" : "DRIVE";
  return { locations, travelMode, expandedUrl: source.toString() };
}

async function expandGoogleMapsUrl(value) {
  let current = safeHttpUrl(value);
  if (!current) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const unwrapped = unwrapConsentUrl(current);
    if (unwrapped && unwrapped.toString() !== current.toString()) {
      current = unwrapped;
      continue;
    }
    if (current.hostname.toLowerCase() !== "maps.app.goo.gl") return current;
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return current;
      current = new URL(location, current);
    } catch {
      return current;
    }
  }
  return unwrapConsentUrl(current) ?? current;
}

export async function resolveGoogleMapsRoute(value) {
  const expanded = await expandGoogleMapsUrl(value);
  return routeFromUrl(expanded);
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
    const expanded = await expandGoogleMapsUrl(source);
    const embedUrl = googleMapsEmbedUrl(expanded);
    return { embedUrl, externalUrl: source.toString(), converted: Boolean(embedUrl) };
  } catch {
    return { embedUrl: null, externalUrl: source.toString(), converted: false };
  }
}
