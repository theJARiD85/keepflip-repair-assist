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
  log = console.log,
}) {
  log(
    `PLACES 1: request received | query=${searchQuery || "missing"} | ` +
      `latitude=${latitude} | longitude=${longitude}`
  );

  if (!config.googleMapsApiKey) {
    log("PLACES STOP: GOOGLE_MAPS_API_KEY is not configured.");

    return {
      status: "not_configured",
      providers: [],
    };
  }

  if (!validLatitude(latitude) || !validLongitude(longitude)) {
    log("PLACES STOP: valid location coordinates were not supplied.");

    return {
      status: "location_required",
      providers: [],
    };
  }

  if (!searchQuery?.trim()) {
    log("PLACES STOP: diagnosis did not provide a repair-shop query.");

    return {
      status: "no_query",
      providers: [],
    };
  }

  const requestBody = {
    textQuery: searchQuery.trim(),
    fileds: ['displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'nationalPhoneNumber', 'websiteUri', 'googleMapsUri', 'regularOpeningHours', 'businessStatus'],
    maxResultCount: 8,
    minRating: 1,
    language: 'en-US',
    locationBias: {
      circle: {
        center: {
          latitude,
          longitude,
        },
        radius: 25000,
      },
    },
    region: 'us',
  };

  log(
    `PLACES 2: sending Google Places request | ${JSON.stringify(
      requestBody
    )}`
  );

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
      body: JSON.stringify(requestBody),
    }
  );

  const responseText = await response.text();

  log(
    `PLACES 3: Google responded | status=${response.status} | ` +
      `preview=${responseText.slice(0, 700)}`
  );

  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `Google Places returned unreadable JSON (${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Google Places repair search failed with status ${response.status}.`
    );
  }

  const providers = (payload.places || []).map((place) => ({
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
  }));

  log(`PLACES 4: mapped ${providers.length} providers.`);

  return {
    status: "ok",
    providers,
  };
}
