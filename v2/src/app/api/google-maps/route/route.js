import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TRAVEL_MODES = { car: "DRIVE", train: "TRANSIT", transit: "TRANSIT", bicycle: "BICYCLE", walk: "WALK", motorcycle: "TWO_WHEELER" };

function cleanLocation(value) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function formatDuration(value) {
  const seconds = Math.max(0, Number.parseFloat(String(value ?? "").replace(/s$/, "")) || 0);
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining} min`;
  return remaining ? `${hours} h ${String(remaining).padStart(2, "0")}` : `${hours} h`;
}

async function computeRoute(apiKey, { origin, destination, intermediates = [], travelMode }) {
  const response = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
    body: JSON.stringify({ origin: { address: origin }, destination: { address: destination }, intermediates: intermediates.map(address => ({ address })), travelMode, languageCode: "fr-FR", units: "METRIC" }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Google Maps n’a pas pu calculer cet itinéraire.");
  const route = result.routes?.[0];
  if (!route) throw new Error("Aucun itinéraire Google Maps n’a été trouvé.");
  return { distanceMeters: Number(route.distanceMeters) || 0, durationSeconds: Number.parseFloat(String(route.duration ?? "").replace(/s$/, "")) || 0 };
}

export async function POST(request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

    const body = await request.json();
    const roadbookId = Number(body.roadbookId);
    if (!Number.isInteger(roadbookId) || roadbookId <= 0) return NextResponse.json({ error: "Roadbook invalide." }, { status: 400 });

    const { data: roadbook } = await supabase.from("roadbooks").select("id, owner_id").eq("id", roadbookId).maybeSingle();
    if (!roadbook) return NextResponse.json({ error: "Roadbook inaccessible." }, { status: 404 });
    const isAdmin = user.app_metadata?.role === "admin";
    let canEdit = roadbook.owner_id === user.id || isAdmin;
    if (!canEdit) {
      const { data: contribution } = await supabase.from("roadbook_contributors").select("user_id").eq("roadbook_id", roadbookId).eq("user_id", user.id).maybeSingle();
      canEdit = Boolean(contribution);
    }
    if (!canEdit) return NextResponse.json({ error: "Vous ne pouvez pas modifier ce roadbook." }, { status: 403 });

    const origin = cleanLocation(body.origin);
    const destination = cleanLocation(body.destination);
    const waypoints = Array.isArray(body.waypoints) ? body.waypoints.map(cleanLocation).filter(Boolean).slice(0, 9) : [];
    const travelMode = TRAVEL_MODES[body.transportMode];
    if (!origin || !destination) return NextResponse.json({ error: "Les villes de départ et d’arrivée sont nécessaires au calcul." }, { status: 400 });
    if (!travelMode) return NextResponse.json({ error: "Ce moyen de transport ne permet pas un calcul automatique." }, { status: 422 });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Le calcul automatique Google Maps n’est pas encore configuré." }, { status: 503 });

    let calculated;
    if (travelMode === "TRANSIT" && waypoints.length) {
      const cities = [origin, ...waypoints, destination];
      const legs = await Promise.all(cities.slice(0, -1).map((city, index) => computeRoute(apiKey, { origin: city, destination: cities[index + 1], travelMode })));
      calculated = legs.reduce((sum, leg) => ({ distanceMeters: sum.distanceMeters + leg.distanceMeters, durationSeconds: sum.durationSeconds + leg.durationSeconds }), { distanceMeters: 0, durationSeconds: 0 });
    } else {
      calculated = await computeRoute(apiKey, { origin, destination, intermediates: waypoints, travelMode });
    }
    return NextResponse.json({ distanceKm: Math.round((calculated.distanceMeters / 1000) * 10) / 10, duration: formatDuration(`${calculated.durationSeconds}s`) });
  } catch (error) {
    return NextResponse.json({ error: error?.message ?? "Calcul Google Maps impossible." }, { status: 502 });
  }
}
