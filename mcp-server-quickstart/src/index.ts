import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const NWS_API_BASE = "https://api.weather.gov";

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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_forecast") {
    throw new Error("Unknown tool");
  }

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
});

const transport = new StdioServerTransport();
await server.connect(transport);


