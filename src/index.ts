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

type Effort = "low" | "medium" | "high";
type Verbosity = "low" | "medium" | "high";

function parseEffort(value: string | undefined): Effort | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return undefined;
}

function parseVerbosity(value: string | undefined): Verbosity | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return undefined;
}

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const DEFAULT_REASONING_EFFORT: Effort = parseEffort(process.env.OPENAI_REASONING_EFFORT) || "medium";
const DEFAULT_TEXT_VERBOSITY: Verbosity = parseVerbosity(process.env.OPENAI_TEXT_VERBOSITY) || "low";

async function runGpt5(prompt: string, effortOverride?: Effort): Promise<string> {
  const result = await openai.responses.create({
    model: DEFAULT_MODEL,
    input: prompt,
    reasoning: { effort: effortOverride ?? DEFAULT_REASONING_EFFORT },
    text: { verbosity: DEFAULT_TEXT_VERBOSITY },
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
        description: "Before calling this tool, review all relevant project files (requirements, existing code, configs, docs) and provide a brief context summary; then use GPT-5 to produce a structured plan",
        inputSchema: {
          type: "object",
          properties: {
            goal: { type: "string", description: "High-level goal to accomplish (fallback for user_request)" },
            context: { type: "string", description: "Concise summary after reviewing all relevant files (paths + key findings, constraints, existing design)" },
            user_request: { type: "string", description: "Requested outcome in user's words" },
            scope: { type: "string", description: "full | partial" },
            focus_features: { type: "string", description: "Comma-separated focus features" },
            project_type: { type: "string", description: "Project type or domain" },
            non_functionals: { type: "string", description: "Non-functional requirements" },
            constraints: { type: "string", description: "Constraints or boundaries" },
            kpi_preferences: { type: "string", description: "Preferred KPIs" },
            paneling: { type: "string", description: "on | off" },
            panel_count: { type: "string", description: "Number of panels if paneling=on" },
          },
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "gpt5_plan") {
    const {
      goal,
      context,
      user_request,
      scope,
      focus_features,
      project_type,
      non_functionals,
      constraints,
      kpi_preferences,
      paneling,
      panel_count,
    } = (request.params.arguments || {}) as {
      goal?: string;
      context?: string;
      user_request?: string;
      scope?: string;
      focus_features?: string;
      project_type?: string;
      non_functionals?: string;
      constraints?: string;
      kpi_preferences?: string;
      paneling?: string;
      panel_count?: string;
    };

    const USER_REQUEST = user_request ?? goal ?? "";
    const SCOPE = scope ?? "full";
    const FOCUS_FEATURES = focus_features ?? "";
    const PROJECT_TYPE = project_type ?? "";
    const NON_FUNCTIONALS = non_functionals ?? (context ?? "");
    const CONSTRAINTS = constraints ?? "";
    const KPI_PREFERENCES = kpi_preferences ?? "";
    const PANELING = paneling ?? "off";
    const PANEL_COUNT = panel_count ?? "6";

    const prompt = `あなたは熟練のソリューションアーキテクトです。以下の入力から、非エンジニアにも分かる言葉で、開発計画を**有効なYAMLのみ**で出力してください。技術スタックは**決め打ちしない**で複数案を比較し、採用は保留可。不明点はassumptions/open_questionsで明示。

# 入力
USER_REQUEST: ${USER_REQUEST}
SCOPE: ${SCOPE}          # full|partial
FOCUS_FEATURES: ${FOCUS_FEATURES}
PROJECT_TYPE: ${PROJECT_TYPE}
NON_FUNCTIONALS: ${NON_FUNCTIONALS}
CONSTRAINTS: ${CONSTRAINTS}
KPI_PREFERENCES: ${KPI_PREFERENCES}
PANELING: ${PANELING}    # on/off
PANEL_COUNT: ${PANEL_COUNT}

# 出力要件（YAMLキー仕様）
- context: {summary, scope, constraints, kpi}
- requirements:
    business: []
    functional: {must, should, could, wont}
    non_functional: []
- architecture:
    pattern_decisions: []
    layers: {presentation, business, data}
    communication: []
    data_flow: []
    component_matrix: [{name, responsibility, tech_options, complexity, risk, order}]
    tech_stack_options:
      frontend: {recommended: [], alternative: []}
      backend: {recommended: [], alternative: []}
      database: {recommended: [], alternative: []}
- features: [{name, description, priority, dependencies, notes}]
- development_flow:
    - {step, description, prerequisites}
# ここまでを**常に**出力（SCOPEに関わらず）

# 追加要件
- SCOPE=partial の場合、下記も**必須**:
  patch_plan:
    impact_analysis: [{area, change_type, rationale}]
    modified_components: [{name, before, after}]
    migration_steps: [{step, detail, rollback}]
    test_impact: {unit, integration, e2e, acceptance}
- 可能なら以下も含める:
  wbs: [{task, estimate, dependencies, DoD}]
  risks: [{category, risk, probability, impact, mitigation, kpi}]
  quality: {testing_pyramid, test_cases: []}
  delivery: {environments, cicd_pipeline, docs}
  setup_and_commands: {bootstrap: [], workflow: []}
  next_steps: [即時, 1週間, 初回スプリント]
  assumptions: []
  open_questions: []
- PANELING=on の場合、最後に panels を追加:
  panels:  # コマ割り（${PANEL_COUNT}目安）
    - {title, body}  # 1コマ=要点サマリ。非エンジニア向け簡潔文。`;

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

  throw new Error("Unknown tool");
});

const transport = new StdioServerTransport();
await server.connect(transport);


