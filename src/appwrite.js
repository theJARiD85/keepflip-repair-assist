import {
    Client,
    ID,
    Permission,
    Role,
    Storage,
    TablesDB,
  } from "node-appwrite";
  
  import { config } from "./config.js";
  
  const MAX_REPAIR_PHOTOS = 3;
  const MAX_REPAIR_PHOTO_BYTES = 6 * 1024 * 1024;
  
  const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ]);
  
  export function createHttpError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }
  
  export function getHeader(req, headerName) {
    const headers = req.headers || {};
    const target = headerName.toLowerCase();
  
    return (
      headers[headerName] ||
      headers[target] ||
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === target
      )?.[1] ||
      null
    );
  }
  
  function createBaseClient() {
    return new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProjectId);
  }
  
  function createUserClient(req) {
    const jwt = getHeader(req, "x-appwrite-user-jwt");
  
    if (!jwt) {
      throw createHttpError(
        "You must be signed in before using repair assistance.",
        401
      );
    }
  
    return createBaseClient().setJWT(jwt);
  }
  
  function createAdminClient(req) {
    const dynamicKey =
      getHeader(req, "x-appwrite-key") ||
      process.env.APPWRITE_FUNCTION_API_KEY;
  
    if (!dynamicKey) {
      throw new Error("Appwrite Function dynamic API key is unavailable.");
    }
  
    return createBaseClient().setKey(dynamicKey);
  }
  
  function ownerPermissions(userId) {
    return [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ];
  }
  
  export async function getOwnedItem(req, userId, itemId) {
    const tablesDB = new TablesDB(createUserClient(req));
  
    const item = await tablesDB.getRow({
      databaseId: config.databaseId,
      tableId: config.itemsTableId,
      rowId: itemId,
    });
  
    if (item.ownerId !== userId) {
      throw createHttpError(
        "You do not have access to this item.",
        403
      );
    }
  
    return item;
  }
  
  export async function createRepairCase({
    req,
    userId,
    itemId,
    issueDescription,
    symptoms,
    diagnosis,
    partsResearch,
  }) {
    const tablesDB = new TablesDB(createAdminClient(req));
    const now = new Date().toISOString();
  
    const result = await tablesDB.createRow({
      databaseId: config.databaseId,
      tableId: config.repairCasesTableId,
      rowId: ID.unique(),
      data: {
        ownerId: userId,
        itemId,
        issueTitle: diagnosis.issueTitle.slice(0, 180),
        issueDescription: issueDescription.slice(0, 50000),
        repairStatus: "researching",
        urgency: diagnosis.urgency,
        symptoms: symptoms.join("\n").slice(0, 50000) || null,
        diagnosisSummary: diagnosis.diagnosisSummary.slice(0, 50000),
        repairability: diagnosis.repairability,
        needsProfessional: diagnosis.needsProfessional,
        likelyCause: diagnosis.likelyCause.slice(0, 50000),
        recommendedPartQuery:
          partsResearch.parts?.[0]?.searchQuery ||
          diagnosis.partSearchQuery ||
          null,
        recommendedRepairQuery:
          diagnosis.repairShopSearchQuery || null,
        manualUrl: null,
        createdAt: now,
        updatedAt: now,
      },
      permissions: ownerPermissions(userId),
    });
  
    return result;
  }
  
  function normalizeFileIds(fileIds) {
    if (!Array.isArray(fileIds)) {
      return [];
    }
  
    const cleaned = fileIds
      .filter((fileId) => typeof fileId === "string")
      .map((fileId) => fileId.trim())
      .filter(Boolean);
  
    return [...new Set(cleaned)].slice(0, MAX_REPAIR_PHOTOS);
  }
  
  async function downloadPrivateImage(req, file) {
    const dynamicKey =
      getHeader(req, "x-appwrite-key") ||
      process.env.APPWRITE_FUNCTION_API_KEY;
  
    const url =
      `${config.appwriteEndpoint}` +
      `/storage/buckets/${encodeURIComponent(
        config.itemImagesBucketId
      )}/files/${encodeURIComponent(file.$id)}/view`;
  
    const response = await fetch(url, {
      headers: {
        "X-Appwrite-Project": config.appwriteProjectId,
        "X-Appwrite-Key": dynamicKey,
      },
    });
  
    if (!response.ok) {
      throw new Error(
        `Could not download repair photo for analysis (${response.status}).`
      );
    }
  
    const bytes = Buffer.from(await response.arrayBuffer());
  
    return {
      type: "input_image",
      image_url: `data:${file.mimeType};base64,${bytes.toString("base64")}`,
      detail: "high",
    };
  }
  
  export async function getRepairPhotoInputs(req, fileIds) {
    const normalizedFileIds = normalizeFileIds(fileIds);
  
    if (!normalizedFileIds.length) {
      return [];
    }
  
    if (!config.itemImagesBucketId) {
      throw new Error(
        "KEEPFLIP_IMAGES_BUCKET_ID is required when sending repair photos."
      );
    }
  
    const storage = new Storage(createUserClient(req));
    const files = [];
  
    for (const fileId of normalizedFileIds) {
      const file = await storage.getFile({
        bucketId: config.itemImagesBucketId,
        fileId,
      });
  
      if (!ALLOWED_IMAGE_TYPES.has(file.mimeType)) {
        throw createHttpError(
          `Unsupported repair photo format: ${file.mimeType || "unknown"}.`
        );
      }
  
      if (file.sizeOriginal > MAX_REPAIR_PHOTO_BYTES) {
        throw createHttpError(
          "Each repair photo must be under 6 MB."
        );
      }
  
      files.push(file);
    }
  
    const imageInputs = [];
  
    for (const file of files) {
      imageInputs.push(await downloadPrivateImage(req, file));
    }
  
    return imageInputs;
  }