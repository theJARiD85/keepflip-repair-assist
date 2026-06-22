import {
  createHttpError,
  getHeader,
  getOwnedItem,
} from "./appwrite.js";
import { findRepairProviders } from "./places.js";
import { analyzeRepairNeed } from "./repairAi.js";

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export default async ({ req, res, log, error }) => {
  const startedAt = Date.now();

  try {
    log(`REPAIR 0: handler started | method=${req.method}`);

    if (req.method !== "POST") {
      return res.json(
        {
          ok: false,
          error: "Use POST for repair diagnosis.",
        },
        405
      );
    }

    const userId = getHeader(req, "x-appwrite-user-id");

    if (!userId) {
      return res.json(
        {
          ok: false,
          error: "You must be signed in to diagnose an item.",
        },
        401
      );
    }

    const body =
      req.bodyJson && typeof req.bodyJson === "object"
        ? req.bodyJson
        : JSON.parse(req.bodyText || "{}");

    const itemId = String(body.itemId || "").trim();
    const issueDescription = String(
      body.issueDescription || ""
    ).trim();

    const symptoms = Array.isArray(body.symptoms)
      ? body.symptoms
          .filter((symptom) => typeof symptom === "string")
          .map((symptom) => symptom.trim())
          .filter(Boolean)
      : [];

    const latitude = numberOrNull(body.latitude);
    const longitude = numberOrNull(body.longitude);

    log(
      `REPAIR 1: request parsed | itemId=${itemId || "missing"} | ` +
        `hasLocation=${latitude !== null && longitude !== null} | ` +
        `symptomCount=${symptoms.length}`
    );

    if (!itemId) {
      throw createHttpError("itemId is required.");
    }

    if (!issueDescription) {
      throw createHttpError(
        "Describe the issue before starting a repair diagnosis."
      );
    }

    const item = await getOwnedItem(req, userId, itemId);

    log(
      `REPAIR 2: item loaded | title=${item.title || "untitled"} | ` +
        `brand=${item.brand || "none"} | model=${item.model || "none"}`
    );

    log("REPAIR 3: starting OpenAI diagnosis.");

    const diagnosis = await analyzeRepairNeed({
      item,
      issueDescription,
      symptoms,
      imageInputs: [],
    });

    log(
      `REPAIR 4: diagnosis complete | issueTitle=${diagnosis.issueTitle} | ` +
        `repairShopSearchQuery=${diagnosis.repairShopSearchQuery || "missing"}`
    );

    let repairProviders;

    try {
      log("REPAIR 5: starting Google Places provider search.");

      repairProviders = await findRepairProviders({
        searchQuery: diagnosis.repairShopSearchQuery,
        latitude,
        longitude,
        log,
      });

      log(
        `REPAIR 6: provider search complete | status=${repairProviders.status} | ` +
          `providerCount=${repairProviders.providers.length}`
      );
    } catch (providerError) {
      const providerMessage =
        providerError instanceof Error
          ? providerError.message
          : String(providerError);

      error(`REPAIR PROVIDERS FAILED: ${providerMessage}`);

      repairProviders = {
        status: "search_failed",
        providers: [],
      };
    }

    log(
      `REPAIR 7: returning response | elapsedMs=${Date.now() - startedAt}`
    );

    return res.json({
      ok: true,
      item: {
        id: item.$id,
        title: item.title,
        brand: item.brand || null,
        model: item.model || null,
        category: item.category || null,
        condition: item.condition || null,
      },
      diagnosis,
      repairProviders,
      diagnosedAt: new Date().toISOString(),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Repair diagnosis failed.";

    error(
      `KEEPFLIP REPAIR ASSIST FAILED | elapsedMs=${
        Date.now() - startedAt
      } | ${message}`
    );

    return res.json(
      {
        ok: false,
        error: message,
      },
      caughtError?.statusCode || 500
    );
  }
};
