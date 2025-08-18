import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
// 環境変数からOpenAIクライアントおよび動作パラメータを設定する
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // 任意: 互換エンドポイントやプロキシを使う場合は baseURL を指定
    // https://github.com/openai/openai-node
    baseURL: process.env.OPENAI_BASE_URL || undefined,
});
function parseEffort(value) {
    if (!value)
        return undefined;
    const v = value.toLowerCase();
    if (v === "low" || v === "medium" || v === "high")
        return v;
    return undefined;
}
function parseVerbosity(value) {
    if (!value)
        return undefined;
    const v = value.toLowerCase();
    if (v === "low" || v === "medium" || v === "high")
        return v;
    return undefined;
}
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const DEFAULT_REASONING_EFFORT = parseEffort(process.env.OPENAI_REASONING_EFFORT) || "medium";
const DEFAULT_TEXT_VERBOSITY = parseVerbosity(process.env.OPENAI_TEXT_VERBOSITY) || "low";
async function runGpt5(prompt, effortOverride) {
    const result = await openai.responses.create({
        model: DEFAULT_MODEL,
        input: prompt,
        reasoning: { effort: effortOverride ?? DEFAULT_REASONING_EFFORT },
        text: { verbosity: DEFAULT_TEXT_VERBOSITY },
    });
    const text = result.output_text;
    return text ?? "";
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
        const { goal, context } = (request.params.arguments || {});
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
                    type: "text",
                    text: planText,
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
        const resultText = await runGpt5(execPrompt, "high");
        return {
            content: [
                {
                    type: "text",
                    text: resultText,
                },
            ],
        };
    }
    throw new Error("Unknown tool");
});
const transport = new StdioServerTransport();
await server.connect(transport);
