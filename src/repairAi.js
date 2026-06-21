import OpenAI from "openai";

import { config } from "./config.js";
import {
  PARTS_RESEARCH_SCHEMA,
  REPAIR_DIAGNOSIS_SCHEMA,
} from "./repairSchema.js";

function createOpenAIClient() {
  return new OpenAI({
    apiKey: config.openaiApiKey,
  });
}

function parseStructuredOutput(response, label) {
  if (!response.output_text) {
    throw new Error(`${label} did not return a result.`);
  }

  try {
    return JSON.parse(response.output_text);
  } catch {
    throw new Error(`${label} returned unreadable structured data.`);
  }
}

function itemSummary(item) {
  return {
    title: item.title || null,
    brand: item.brand || null,
    model: item.model || null,
    category: item.category || null,
    condition: item.condition || null,
    description: item.description || null,
  };
}

function collectSources(response) {
  const sources = new Map();

  for (const output of response.output || []) {
    for (const content of output.content || []) {
      for (const annotation of content.annotations || []) {
        const citation = annotation.url_citation || annotation;

        if (!citation?.url) {
          continue;
        }

        sources.set(citation.url, {
          title: citation.title || citation.url,
          url: citation.url,
        });
      }
    }

    for (const source of output.action?.sources || []) {
      if (!source?.url) {
        continue;
      }

      sources.set(source.url, {
        title: source.title || source.url,
        url: source.url,
      });
    }
  }

  return [...sources.values()].slice(0, 12);
}

export async function analyzeRepairNeed({
  item,
  issueDescription,
  symptoms,
  imageInputs,
}) {
  const openai = createOpenAIClient();

  const response = await openai.responses.create({
    model: config.repairModel,
    reasoning: {
      effort: "low",
    },
    input: [
      {
        role: "system",
        content: `
You are KeepFlip's repair triage assistant.

You help a consumer understand likely repair paths for an owned item.
Do not diagnose with certainty. Do not invent model numbers, part numbers,
manuals, warranties, prices, or repair instructions not supported by the input.

Safety rules:
- For swollen batteries, damaged power cords, exposed mains wiring, fuel systems,
  gas appliances, leaking refrigerant, brake/steering/airbag systems, or fire risk:
  set urgency to "stop_using" and needsProfessional to true.
- Do not provide step-by-step disassembly instructions for dangerous repairs.
- SafeNextSteps must be limited to non-invasive, low-risk actions such as
  unplugging, documenting labels, checking visible damage, or contacting a pro.
- Use "professional_recommended" whenever safety or specialized tools are involved.
        `.trim(),
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                item: itemSummary(item),
                issueDescription,
                symptoms,
              },
              null,
              2
            ),
          },
          ...imageInputs,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "keepflip_repair_diagnosis",
        strict: true,
        schema: REPAIR_DIAGNOSIS_SCHEMA,
      },
    },
  });

  return parseStructuredOutput(response, "Repair diagnosis");
}

export async function researchPartsAndManuals({
  item,
  diagnosis,
}) {
  const openai = createOpenAIClient();

  const response = await openai.responses.create({
    model: config.researchModel,
    reasoning: {
      effort: "low",
    },
    tools: [
      {
        type: "web_search",
      },
    ],
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content: `
You research replacement parts, manuals, and manufacturer support information.

Use web search. Prioritize manufacturer support pages, official manuals,
authorized service documentation, and established parts suppliers.

Rules:
- Never invent or guess an exact part number.
- Only return an exact_candidate when the evidence is specifically tied
  to the identified item model.
- Use likely_component or generic_supply when the model match is uncertain.
- Clearly warn the user to verify part compatibility before buying.
- Do not recommend unsafe electrical, gas, vehicle safety, or hazardous repairs.
- Return structured JSON only.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            item: itemSummary(item),
            diagnosis,
          },
          null,
          2
        ),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "keepflip_parts_research",
        strict: true,
        schema: PARTS_RESEARCH_SCHEMA,
      },
    },
  });

  const research = parseStructuredOutput(
    response,
    "Parts research"
  );

  return {
    ...research,
    sources: collectSources(response),
  };
}
