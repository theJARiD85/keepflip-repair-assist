import {
  createHttpError,
  getHeader,
  getOwnedItem,
} from "./appwrite.js";
import { analyzeRepairNeed } from "./repairAi.js";

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "POST") {
      return res.json(
        { ok: false, error: "Use POST for repair diagnosis." },
        405
      );
    }

    const userId = getHeader(req, "x-appwrite-user-id");

    if (!userId) {
      return res.json(
        { ok: false, error: "You must be signed in to diagnose an item." },
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

    if (!itemId) {
      throw createHttpError("itemId is required.");
    }

    if (!issueDescription) {
      throw createHttpError(
        "Describe the issue before starting a repair diagnosis."
      );
    }

    const item = await getOwnedItem(req, userId, itemId);

    log(`Repair diagnosis requested for item ${itemId}.`);

    const diagnosis = await analyzeRepairNeed({
      item,
      issueDescription,
      symptoms,
      imageInputs: [],
    });

    return res.json({
      ok: true,
      item: {
        id: item.$id,
        title: item.title,
        brand: item.brand || null,
        model: item.model || null,
      },
      diagnosis,
      diagnosedAt: new Date().toISOString(),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Repair diagnosis failed.";

    error(`KeepFlip Repair Assist: ${message}`);

    return res.json(
      {
        ok: false,
        error: message,
      },
      caughtError?.statusCode || 500
    );
  }
};
