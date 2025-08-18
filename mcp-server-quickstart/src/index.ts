import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

const NWS_API_BASE = "https://api.weather.gov";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type PointsResponse = {
  properties: {
    forecast: string;
    gridId: string;
    gridX: number;
    gridY: number;
  };
};

type ForecastResponse = {
  properties: {
    periods: Array<{
      number: number;
      name: string;
      temperature: number;
      temperatureUnit: string;
      windSpeed: string;
      windDirection: string;
      detailedForecast: string;
    }>;
  };
};

type AlertsResponse = {
  features: Array<{
    properties: {
      event?: string;
      areaDesc?: string;
      severity?: string;
      description?: string;
      instruction?: string;
    };
  }>;
};

async function makeNWSRequest<TResponse>(url: string): Promise<TResponse> {
  const response = await fetch(url, {
    headers: {
      // Per NWS API policy, include a descriptive UA with contact info if possible.
      "User-Agent": "mcp-weather-server/1.0 (+https://example.com)",
      Accept: "application/geo+json, application/json;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NWS request failed: ${response.status} ${response.statusText} ${text}`);
  }
  return (await response.json()) as TResponse;
}

function formatForecastText(forecast: ForecastResponse): string {
  const periods = forecast.properties.periods;
  if (!periods || periods.length === 0) {
    return "No forecast data available.";
  }

  const lines: string[] = [];
  for (const period of periods) {
    lines.push(
      `${period.name}: ${period.detailedForecast} (Temp: ${period.temperature}${period.temperatureUnit}, Wind: ${period.windDirection} ${period.windSpeed})`
    );
  }
  return lines.join("\n");
}

function formatAlertText(alerts: AlertsResponse): string {
  if (!alerts.features || alerts.features.length === 0) {
    return "No active alerts for this state.";
  }
  const chunks: string[] = [];
  for (const feature of alerts.features) {
    const props = feature.properties || {};
    const block = [
      `Event: ${props.event ?? "Unknown"}`,
      `Area: ${props.areaDesc ?? "Unknown"}`,
      `Severity: ${props.severity ?? "Unknown"}`,
      `Description: ${props.description ?? "No description available"}`,
      `Instructions: ${props.instruction ?? "No specific instructions provided"}`,
    ].join("\n");
    chunks.push(block);
  }
  return chunks.join("\n---\n");
}

async function runGpt5(prompt: string, effort: "low" | "medium" | "high" = "medium"): Promise<string> {
  const result = await openai.responses.create({
    model: "gpt-5",
    input: prompt,
    reasoning: { effort },
    text: { verbosity: "low" },
  });
  const text = (result as any).output_text as string | undefined;
  return text ?? "";
}

const server = new Server(
  {
    name: "weather",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_forecast",
        description: "Get weather forecast for a location",
        inputSchema: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              description: "Latitude of the location",
            },
            longitude: {
              type: "number",
              description: "Longitude of the location",
            },
          },
          required: ["latitude", "longitude"],
        },
      },
      {
        name: "get_alerts",
        description: "Get weather alerts for a US state (two-letter code, e.g., CA, NY)",
        inputSchema: {
          type: "object",
          properties: {
            state: {
              type: "string",
              description: "Two-letter US state code",
            },
          },
          required: ["state"],
        },
      },
      {
        name: "get_alerts",
        description: "Get weather alerts for a US state (two-letter code, e.g., CA, NY)",
        inputSchema: {
          type: "object",
          properties: {
            state: {
              type: "string",
              description: "Two-letter US state code",
            },
          },
          required: ["state"],
        },
      },
      {
        name: "gpt5_plan",
        description: "Use GPT-5 to produce a structured plan for a goal",
        inputSchema: {
          type: "object",
          properties: {
            goal: { type: "string", description: "High-level goal to accomplish" },
            context: { type: "string", description: "Optional context or constraints" },
          },
          required: ["goal"],
        },
      },
      {
        name: "gpt5_execute",
        description: "Use GPT-5 to execute a plan and return results",
        inputSchema: {
          type: "object",
          properties: {
            goal: { type: "string", description: "Original goal for reference" },
            plan: { type: "string", description: "Plan to execute (JSON or text)" },
          },
          required: ["plan"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_forecast") {
    const { latitude, longitude } = (request.params.arguments || {}) as {
      latitude?: number;
      longitude?: number;
    };

    if (
      typeof latitude !== "number" ||
      Number.isNaN(latitude) ||
      typeof longitude !== "number" ||
      Number.isNaN(longitude)
    ) {
      throw new Error("Invalid arguments: latitude and longitude are required numbers");
    }

    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

    const forecastUrl = pointsData.properties.forecast;
    if (!forecastUrl) {
      throw new Error("Forecast URL not available for the given location");
    }

    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    const forecastText = formatForecastText(forecastData);

    return {
      content: [
        {
          type: "text" as const,
          text: forecastText,
        },
      ],
    };
  }

  if (request.params.name === "get_alerts") {
    const { state } = (request.params.arguments || {}) as { state?: string };
    if (!state || typeof state !== "string" || state.trim().length !== 2) {
      throw new Error("Invalid arguments: state must be a two-letter US state code");
    }
    const code = state.trim().toUpperCase();
    const url = `${NWS_API_BASE}/alerts/active/area/${code}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(url);
    const text = formatAlertText(alertsData);
    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  }

  if (request.params.name === "gpt5_plan") {
    const { goal, context } = (request.params.arguments || {}) as {
      goal?: string;
      context?: string;
    };
    if (!goal || typeof goal !== "string") {
      throw new Error("Invalid arguments: goal is required and must be a string");
    }
    const prompt = `You are a planning assistant. Create a concise, actionable plan in JSON for the following goal.
Return ONLY JSON with the shape: { "goal": string, "steps": [ { "id": number, "title": string, "detail": string } ] }.
Goal: ${goal}
Context: ${context ?? "(none)"}`;
    const planText = await runGpt5(prompt, "medium");
    return {
      content: [
        {
          type: "text" as const,
          text: planText,
        },
      ],
    };
  }

  if (request.params.name === "gpt5_execute") {
    const { goal, plan } = (request.params.arguments || {}) as {
      goal?: string;
      plan?: string;
    };
    if (!plan || typeof plan !== "string") {
      throw new Error("Invalid arguments: plan is required and must be a string");
    }
    const execPrompt = `You are an execution agent. Given the following plan and optional goal, execute the steps and provide results.
Be terse and return actionable outputs; prefer code blocks when helpful.
Goal: ${goal ?? "(not provided)"}
Plan:
${plan}`;
    const resultText = await runGpt5(execPrompt, "high");
    return {
      content: [
        {
          type: "text" as const,
          text: resultText,
        },
      ],
    };
  }

  throw new Error("Unknown tool");
});

const transport = new StdioServerTransport();
await server.connect(transport);


