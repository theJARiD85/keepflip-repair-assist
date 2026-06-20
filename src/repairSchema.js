export const REPAIR_DIAGNOSIS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
      issueTitle: {
        type: "string",
      },
      diagnosisSummary: {
        type: "string",
      },
      likelyCause: {
        type: "string",
      },
      repairability: {
        type: "string",
        enum: [
          "diy_possible",
          "professional_recommended",
          "replacement_preferred",
          "unknown",
        ],
      },
      needsProfessional: {
        type: "boolean",
      },
      urgency: {
        type: "string",
        enum: ["low", "medium", "high", "stop_using"],
      },
      safetyWarnings: {
        type: "array",
        items: {
          type: "string",
        },
      },
      safeNextSteps: {
        type: "array",
        items: {
          type: "string",
        },
      },
      partSearchQuery: {
        type: "string",
      },
      manualSearchQuery: {
        type: "string",
      },
      repairShopSearchQuery: {
        type: "string",
      },
      followUpQuestions: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
    required: [
      "issueTitle",
      "diagnosisSummary",
      "likelyCause",
      "repairability",
      "needsProfessional",
      "urgency",
      "safetyWarnings",
      "safeNextSteps",
      "partSearchQuery",
      "manualSearchQuery",
      "repairShopSearchQuery",
      "followUpQuestions",
    ],
  };
  
  export const PARTS_RESEARCH_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
      researchSummary: {
        type: "string",
      },
      parts: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
            },
            partNumber: {
              type: ["string", "null"],
            },
            matchLevel: {
              type: "string",
              enum: ["exact_candidate", "likely_component", "generic_supply"],
            },
            confidence: {
              type: "integer",
              minimum: 0,
              maximum: 100,
            },
            searchQuery: {
              type: "string",
            },
            caution: {
              type: "string",
            },
          },
          required: [
            "name",
            "partNumber",
            "matchLevel",
            "confidence",
            "searchQuery",
            "caution",
          ],
        },
      },
      warnings: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
    required: ["researchSummary", "parts", "warnings"],
  };