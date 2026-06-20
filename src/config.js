function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  
  export function requiredEnv(name) {
    const value = clean(process.env[name]);
  
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  
    return value;
  }
  
  export const config = {
    appwriteEndpoint: requiredEnv("APPWRITE_ENDPOINT").replace(/\/$/, ""),
    appwriteProjectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
  
    databaseId: requiredEnv("KEEPFLIP_DATABASE_ID"),
    itemsTableId: requiredEnv("KEEPFLIP_ITEMS_TABLE_ID"),
    repairCasesTableId: requiredEnv("KEEPFLIP_REPAIR_CASES_TABLE_ID"),
  
    itemImagesBucketId: clean(process.env.KEEPFLIP_IMAGES_BUCKET_ID) || null,
  
    openaiApiKey: requiredEnv("OPENAI_API_KEY"),
    repairModel: clean(process.env.OPENAI_REPAIR_MODEL) || "gpt-5.5",
    researchModel: clean(process.env.OPENAI_RESEARCH_MODEL) || "gpt-5.5",
  
    googleMapsApiKey: clean(process.env.GOOGLE_MAPS_API_KEY) || null,
  };