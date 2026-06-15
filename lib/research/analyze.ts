import Anthropic from "@anthropic-ai/sdk";
import type { CompanyData } from "@/lib/research/types";
import { METRIC_REGISTRY, METRIC_CATEGORIES } from "@/lib/research/registry";
import { formatMetricValue } from "@/lib/research/format";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a financial analyst assistant for Sam's portfolio research dashboard. You write clear, objective, well-organized equity research notes based on fundamental data sourced from Yahoo Finance.

- Ground every claim in the data provided. Do not invent figures.
- If a figure is missing ("—"), say so rather than guessing.
- Cover both strengths and risks/weaknesses — a balanced view.
- Do not give explicit buy/sell/hold recommendations or price targets. This is an analytical summary, not investment advice.
- Write in markdown using "## " section headers and short paragraphs or bullet points. Do not restate the raw numbers verbatim in long lists — synthesize and interpret them.`;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

function buildDataSummary(company: CompanyData): string {
  const lines: string[] = [];
  lines.push(`Company: ${company.name} (${company.ticker})`);
  if (company.sector || company.industry) {
    lines.push(`Sector / Industry: ${[company.sector, company.industry].filter(Boolean).join(" / ")}`);
  }

  for (const category of METRIC_CATEGORIES) {
    lines.push(`\n${category}:`);
    for (const metric of METRIC_REGISTRY.filter((m) => m.category === category)) {
      const value = company.metrics[metric.id];
      lines.push(`- ${metric.label}: ${formatMetricValue(value, metric.format)}`);
    }
  }

  return lines.join("\n");
}

/** Generates a markdown equity research note for a single company using Claude. */
export async function generateCompanyAnalysis(company: CompanyData, focus?: string): Promise<string> {
  const client = getClient();
  const dataSummary = buildDataSummary(company);

  const focusInstruction = focus
    ? `The user specifically asked for the analysis to focus on: "${focus}". Prioritize this angle, but stay grounded in the data provided.`
    : "No specific focus was given — provide a well-rounded overview covering valuation, profitability, growth, financial health, and any notable strengths or risks.";

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the latest financial data for ${company.name} (${company.ticker}), sourced from Yahoo Finance:\n\n${dataSummary}\n\n${focusInstruction}`,
      },
    ],
  });

  const final = await stream.finalMessage();
  return final.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}
