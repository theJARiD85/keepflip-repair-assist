import {
  createHttpError,
  getHeader,
  getOwnedItem,
} from "./appwrite.js";
import { researchPartsAndManuals } from "./repairAi.js";

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

function stringList(value, maxItems = 12) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDiagnosis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    issueTitle: cleanString(value.issueTitle, 200),
    diagnosisSummary: cleanString(value.diagnosisSummary, 2000),
    likelyCause: cleanString(value.likelyCause, 1500),
    repairability: cleanString(value.repairability, 80),
    needsProfessional: Boolean(value.needsProfessional),
    urgency: cleanString(value.urgency, 80),
    safetyWarnings: stringList(value.safetyWarnings),
    safeNextSteps: stringList(value.safeNextSteps),
    partSearchQuery: cleanString(value.partSearchQuery, 500),
    manualSearchQuery: cleanString(value.manualSearchQuery, 500),
    repairShopSearchQuery: cleanString(
      value.repairShopSearchQuery,
      500
    ),
    followUpQuestions: stringList(value.followUpQuestions),
  };
}

export default async ({ req, res, log, error }) => {
  try {
    if (req.method === "GET") {
      return res.json({
        ok: true,
        service: "keepflip-parts-research",
        message: "KeepFlip Parts Research is online.",
      });
    }

    if (req.method !== "POST") {
      return res.json(
        {
          ok: false,
          error: "Use POST for parts research.",
        },
        405
      );
    }

    const userId = getHeader(req, "x-appwrite-user-id");

    if (!userId) {
      return res.json(
        {
          ok: false,
          error: "You must be signed in to research parts.",
        },
        401
      );
    }

    const body = getRequestBody(req);

    const itemId = cleanString(body.itemId, 36);
    const diagnosis = normalizeDiagnosis(body.diagnosis);

    if (!itemId) {
      throw createHttpError("itemId is required.");
    }

    if (!diagnosis) {
      throw createHttpError(
        "A valid repair diagnosis is required before researching parts."
      );
    }

    const startedAt = Date.now();

    const item = await getOwnedItem(req, userId, itemId);

    log(
      `Live parts research requested by ${userId} for item ${itemId}.`
    );

    const partsResearch = await researchPartsAndManuals({
      item,
      diagnosis,
    });

    log(
      `Live parts research finished in ${
        Date.now() - startedAt
      }ms for item ${itemId}.`
    );

    return res.json({
      ok: true,
      item: {
        id: item.$id,
        title: item.title,
        brand: item.brand || null,
        model: item.model || null,
      },
      partsResearch,
      researchedAt: new Date().toISOString(),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Parts research failed.";

    error(`KeepFlip Parts Research: ${message}`);

    return res.json(
      {
        ok: false,
        error: message,
      },
      caughtError?.statusCode || 500
    );
  }
};

