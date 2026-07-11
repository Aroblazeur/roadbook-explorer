export function sanitizeNextPath(destination) {
  if (!destination || typeof destination !== "string") return "/dashboard";
  if (destination.startsWith("//")) return "/dashboard";
  try {
    const url = new URL(destination, "http://localhost");
    if (url.protocol !== "http:" && url.protocol !== "https:") return "/dashboard";
    if (url.hostname !== "localhost") return "/dashboard";
  } catch {
    return "/dashboard";
  }
  return destination;
}
