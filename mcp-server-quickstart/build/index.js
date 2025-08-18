import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const NWS_API_BASE = "https://api.weather.gov";
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
const server = new Server({
    name: "weather",
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
    throw new Error("Unknown tool");
});
const transport = new StdioServerTransport();
await server.connect(transport);
