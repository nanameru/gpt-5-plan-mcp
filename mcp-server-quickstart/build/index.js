import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
const NWS_API_BASE = "https://api.weather.gov";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function makeNWSRequest(url) {
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
    return (await response.json());
}
function formatForecastText(forecast) {
    const periods = forecast.properties.periods;
    if (!periods || periods.length === 0) {
        return "No forecast data available.";
    }
    const lines = [];
    for (const period of periods) {
        lines.push(`${period.name}: ${period.detailedForecast} (Temp: ${period.temperature}${period.temperatureUnit}, Wind: ${period.windDirection} ${period.windSpeed})`);
    }
    return lines.join("\n");
}
function formatAlertText(alerts) {
    if (!alerts.features || alerts.features.length === 0) {
        return "No active alerts for this state.";
    }
    const chunks = [];
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
async function runGpt5(prompt, effort = "medium") {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
        throw new Error("Missing OPENAI_API_KEY. Set it via env or .cursor/mcp.json env.");
    }
    const result = await openai.responses.create({
        model: "gpt-5",
        input: prompt,
        reasoning: { effort },
        text: { verbosity: "low" },
    });
    const text = result.output_text;
    return text ?? "";
}
function extractJsonFromText(text) {
    // Try direct JSON
    try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
    }
    catch { }
    // Try triple backtick code block
    const codeBlock = text.match(/```json[\s\S]*?```/i) || text.match(/```[\s\S]*?```/);
    if (codeBlock && codeBlock[0]) {
        const inner = codeBlock[0]
            .replace(/```json/i, "")
            .replace(/```/g, "")
            .trim();
        try {
            const parsed = JSON.parse(inner);
            return JSON.stringify(parsed, null, 2);
        }
        catch { }
    }
    return text;
}
const server = new Server({
    name: "gpt-5-plan",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_forecast",
                title: "Get Forecast",
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
                title: "Get Alerts",
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
                title: "GPT-5 Plan",
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
                title: "GPT-5 Execute",
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
            {
                name: "health",
                title: "Health Check",
                description: "Return server health and configured capabilities",
                inputSchema: { type: "object", properties: {} },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_forecast") {
        const { latitude, longitude } = (request.params.arguments || {});
        if (typeof latitude !== "number" ||
            Number.isNaN(latitude) ||
            typeof longitude !== "number" ||
            Number.isNaN(longitude)) {
            throw new Error("Invalid arguments: latitude and longitude are required numbers");
        }
        const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        const pointsData = await makeNWSRequest(pointsUrl);
        const forecastUrl = pointsData.properties.forecast;
        if (!forecastUrl) {
            throw new Error("Forecast URL not available for the given location");
        }
        const forecastData = await makeNWSRequest(forecastUrl);
        const forecastText = formatForecastText(forecastData);
        return {
            content: [
                {
                    type: "text",
                    text: forecastText,
                },
            ],
        };
    }
    if (request.params.name === "get_alerts") {
        const { state } = (request.params.arguments || {});
        if (!state || typeof state !== "string" || state.trim().length !== 2) {
            throw new Error("Invalid arguments: state must be a two-letter US state code");
        }
        const code = state.trim().toUpperCase();
        const url = `${NWS_API_BASE}/alerts/active/area/${code}`;
        const alertsData = await makeNWSRequest(url);
        const text = formatAlertText(alertsData);
        return {
            content: [
                {
                    type: "text",
                    text,
                },
            ],
        };
    }
    if (request.params.name === "gpt5_plan") {
        const { goal, context } = (request.params.arguments || {});
        if (!goal || typeof goal !== "string") {
            throw new Error("Invalid arguments: goal is required and must be a string");
        }
        const prompt = `You are a planning assistant. Create a concise, actionable plan in JSON for the following goal.
Return ONLY JSON with the shape: { "goal": string, "steps": [ { "id": number, "title": string, "detail": string } ] }.
Goal: ${goal}
Context: ${context ?? "(none)"}`;
        let planText;
        try {
            planText = await runGpt5(prompt, "medium");
        }
        catch (err) {
            console.error("gpt5_plan error:", err);
            throw err;
        }
        const normalized = extractJsonFromText(planText);
        return {
            content: [
                {
                    type: "text",
                    text: normalized,
                },
            ],
        };
    }
    if (request.params.name === "gpt5_execute") {
        const { goal, plan } = (request.params.arguments || {});
        if (!plan || typeof plan !== "string") {
            throw new Error("Invalid arguments: plan is required and must be a string");
        }
        const execPrompt = `You are an execution agent. Given the following plan and optional goal, execute the steps and provide results.
Be terse and return actionable outputs; prefer code blocks when helpful.
Goal: ${goal ?? "(not provided)"}
Plan:
${plan}`;
        let resultText;
        try {
            resultText = await runGpt5(execPrompt, "high");
        }
        catch (err) {
            console.error("gpt5_execute error:", err);
            throw err;
        }
        return {
            content: [
                {
                    type: "text",
                    text: resultText,
                },
            ],
        };
    }
    if (request.params.name === "health") {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        name: "gpt-5-plan",
                        status: "ok",
                        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0),
                        tools: ["get_forecast", "get_alerts", "gpt5_plan", "gpt5_execute", "health"],
                    }, null, 2),
                },
            ],
        };
    }
    throw new Error("Unknown tool");
});
const transport = new StdioServerTransport();
await server.connect(transport);
