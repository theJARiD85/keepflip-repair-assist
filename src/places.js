import { config } from "./config.js";

function validLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export async function findRepairProviders({
  searchQuery,
  latitude,
  longitude,
}) {
  if (!config.googleMapsApiKey) {
    return {
      status: "not_configured",
      providers: [],
    };
  }

  if (!validLatitude(latitude) || !validLongitude(longitude)) {
    return {
      status: "location_required",
      providers: [],
    };
  }

  if (!searchQuery?.trim()) {
    return {
      status: "no_query",
      providers: [],
    };
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleMapsApiKey,
        "X-Goog-FieldMask": [
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.nationalPhoneNumber",
          "places.websiteUri",
          "places.googleMapsUri",
          "places.regularOpeningHours.openNow",
          "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        maxResultCount: 8,
        locationBias: {
          circle: {
            center: {
              latitude,
              longitude,
            },
            radius: 25000,
          },
        },
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        "Google Places repair search failed."
    );
  }

  return {
    status: "ok",
    providers: (payload.places || []).map((place) => ({
      name: place.displayName?.text || "Unnamed repair provider",
      address: place.formattedAddress || null,
      rating:
        typeof place.rating === "number" ? place.rating : null,
      ratingCount:
        typeof place.userRatingCount === "number"
          ? place.userRatingCount
          : null,
      phone: place.nationalPhoneNumber || null,
      websiteUrl: place.websiteUri || null,
      mapsUrl: place.googleMapsUri || null,
      openNow:
        typeof place.regularOpeningHours?.openNow === "boolean"
          ? place.regularOpeningHours.openNow
          : null,
      businessStatus: place.businessStatus || null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    })),
  };
}