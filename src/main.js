import {
  createHttpError,
  createRepairCase,
  getHeader,
  getOwnedItem,
  getRepairPhotoInputs,
} from "./appwrite.js";
import { findRepairProviders } from "./places.js";
import {
  analyzeRepairNeed,
  researchPartsAndManuals,
} from "./repairAi.js";

function getRequestBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }

  if (typeof req.bodyText === "string" && req.bodyText.trim()) {
    try {
      return JSON.parse(req.bodyText);
    } catch {
      throw createHttpError("Request body must be valid JSON.");
    }
  }

  return {};
}

function cleanString(value, maxLength = 50000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeSymptoms(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim().slice(0, 500)];
  }

  return [];
}

function normalizePhotoIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
  )].slice(0, 3);
}

function parseLocation(body) {
  const latitude = Number(
    body.latitude ?? body.location?.latitude
  );

  const longitude = Number(
    body.longitude ?? body.location?.longitude
  );

  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  return valid
    ? { latitude, longitude }
    : { latitude: null, longitude: null };
}

function fallbackPartsResearch(item, diagnosis) {
  const identity = [
    item.brand,
    item.model,
    item.title,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    researchSummary:
      "Live parts research was unavailable. KeepFlip generated safe search terms from the identified item and reported issue.",
    parts: [
      {
        name: "Replacement-part research",
        partNumber: null,
        matchLevel: "likely_component",
        confidence: 0,
        searchQuery:
          diagnosis.partSearchQuery ||
          `${identity} replacement part`,
        caution:
          "Confirm the model number and fitment before purchasing any replacement part.",
      },
    ],
    warnings: [
      "No live parts sources were returned during this request.",
    ],
    sources: [],
  };
}

export default async ({ req, res, log, error }) => {
  try {
    if (req.method === "GET") {
      return res.json({
        ok: true,
        service: "keepflip-repair-assist",
        message: "KeepFlip Repair Assistant is online.",
      });
    }

    if (req.method !== "POST") {
      return res.json(
        {
          ok: false,
          error: "Use POST for repair research.",
        },
        405
      );
    }

    const userId = getHeader(req, "x-appwrite-user-id");

    if (!userId) {
      return res.json(
        {
          ok: false,
          error: "You must be signed in to use repair assistance.",
        },
        401
      );
    }

    const body = getRequestBody(req);

    const startedAt = Date.now();

    const logTiming = (stage) => {
      log(`[Repair timing] ${stage}: ${Date.now() - startedAt}ms`);
    };

    const itemId = cleanString(body.itemId, 36);
    const issueDescription = cleanString(
      body.issueDescription,
      50000
    );
    const symptoms = normalizeSymptoms(body.symptoms);
    const repairPhotoFileIds = normalizePhotoIds(
      body.repairPhotoFileIds
    );
    const location = parseLocation(body);

    if (!itemId) {
      throw createHttpError("itemId is required.");
    }

    if (!issueDescription) {
      throw createHttpError(
        "Describe what is wrong before researching repair options."
      );
    }

    log(
      `Repair research requested by ${userId} for item ${itemId}.`
    );

    const item = await getOwnedItem(req, userId, itemId);
    logTiming("Loaded item");


    const imageInputs = await getRepairPhotoInputs(
      req,
      repairPhotoFileIds
    );
    logTiming("Loaded repair photos");


    const diagnosis = await analyzeRepairNeed({
      item,
      issueDescription,
      symptoms,
      imageInputs,
    });
    logTiming("AI diagnosis complete");

    const partsResearch = fallbackPartsResearch(item, diagnosis);

    let repairProviders = {
      status: "not_requested",
      providers: [],
    };

    try {
      repairProviders = await findRepairProviders({
        searchQuery: diagnosis.repairShopSearchQuery,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (placesError) {
      log(
        `Repair-provider lookup failed: ${
          placesError?.message || "Unknown Places error"
        }`
      );

      repairProviders = {
        status: "unavailable",
        providers: [],
      };
    }
    logTiming("Google Places complete");

    const repairCase = await createRepairCase({
      req,
      userId,
      itemId,
      issueDescription,
      symptoms,
      diagnosis,
      partsResearch,
    });
    logTiming("Repair case created");

    return res.json({
      ok: true,
      repairCase: {
        id: repairCase.$id,
        itemId,
        createdAt: repairCase.createdAt,
      },
      item: {
        id: item.$id,
        title: item.title,
        brand: item.brand || null,
        model: item.model || null,
        category: item.category || null,
        condition: item.condition || null,
      },
      diagnosis,
      partsResearch,
      repairProviders,
      researchedAt: new Date().toISOString(),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Repair research failed.";

    error(`KeepFlip Repair Assistant: ${message}`);

    return res.json(
      {
        ok: false,
        error: message,
      },
      caughtError?.statusCode || 500
    );
  }
};
