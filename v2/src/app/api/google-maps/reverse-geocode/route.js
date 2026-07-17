import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const GEOCODING_API_URL = "https://geocode.googleapis.com/v4/geocode/location";
const CITY_TYPES = ["locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2", "sublocality"];

function cleanPoint(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function cityFromResults(results) {
  for (const type of CITY_TYPES) {
    for (const result of results ?? []) {
      const component = result.addressComponents?.find(item => item.types?.includes(type));
      if (component?.longText) return component.longText.trim();
      if (type === "locality" && result.postalAddress?.locality) return result.postalAddress.locality.trim();
    }
  }
  return "";
}

async function reverseGeocode(apiKey, point) {
  const url = new URL(`${GEOCODING_API_URL}/${point.lat},${point.lng}`);
  url.searchParams.set("languageCode", "fr");
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "results.addressComponents,results.postalAddress.locality",
    },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Google Maps n'a pas pu identifier cette position.");
  return cityFromResults(result.results);
}

export async function POST(request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

    const body = await request.json();
    const roadbookId = Number(body.roadbookId);
    const start = cleanPoint(body.start);
    const end = cleanPoint(body.end);
    if (!Number.isInteger(roadbookId) || roadbookId <= 0 || !start || !end) {
      return NextResponse.json({ error: "Trace GPX ou roadbook invalide." }, { status: 400 });
    }

    const { data: roadbook } = await supabase.from("roadbooks").select("id, owner_id").eq("id", roadbookId).maybeSingle();
    if (!roadbook) return NextResponse.json({ error: "Roadbook inaccessible." }, { status: 404 });
    let canEdit = roadbook.owner_id === user.id || user.app_metadata?.role === "admin";
    if (!canEdit) {
      const { data: contribution } = await supabase.from("roadbook_contributors").select("user_id").eq("roadbook_id", roadbookId).eq("user_id", user.id).maybeSingle();
      canEdit = Boolean(contribution);
    }
    if (!canEdit) return NextResponse.json({ error: "Vous ne pouvez pas modifier ce roadbook." }, { status: 403 });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "La clé Google Maps n'est pas configurée." }, { status: 503 });

    const [departure, arrival] = await Promise.all([
      reverseGeocode(apiKey, start),
      reverseGeocode(apiKey, end),
    ]);
    if (!departure && !arrival) return NextResponse.json({ error: "Aucune ville trouvée près des extrémités de la trace." }, { status: 404 });
    return NextResponse.json({ departure, arrival, start, end });
  } catch (error) {
    return NextResponse.json({ error: error?.message ?? "Extraction des villes impossible." }, { status: 502 });
  }
}
