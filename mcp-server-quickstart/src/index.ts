import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    name: "gpt-5-plan",
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


