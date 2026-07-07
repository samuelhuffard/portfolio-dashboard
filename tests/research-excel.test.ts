import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { generateResearchWorkbook, generateComparisonWorkbook } from "../lib/research/excel";
import { METRIC_REGISTRY } from "../lib/research/registry";
import type { CompanyData, ResearchResponse, AnalyzeResponse } from "../lib/research/types";

function fixtureCompany(ticker: string, priceBump = 0): CompanyData {
  const metrics: Record<string, number | null> = {};
  for (const metric of METRIC_REGISTRY) metrics[metric.id] = null;
  Object.assign(metrics, {
    currentPrice: 211.45 + priceBump,
    marketCap: 3_210_000_000_000,
    fiftyTwoWeekLow: 164.08,
    fiftyTwoWeekHigh: 237.49,
    beta: 1.24,
    trailingPE: 32.9,
    profitMargins: 0.2431,
    grossMargins: 0.4621,
    revenueGrowth: 0.051,
    returnOnEquity: 1.4725,
    trailingEps: 6.42,
    dividendYield: 0.0044,
    freeCashflow: 98_500_000_000,
  });
  return {
    ticker,
    name: `${ticker} Test Corp`,
    sector: "Technology",
    industry: "Consumer Electronics",
    metrics,
  };
}

const researchFixture: ResearchResponse = {
  kind: "research",
  reportId: "11111111-2222-3333-4444-555555555555",
  generatedAt: "2026-07-06T12:00:00.000Z",
  ticker: "AAPL",
  focus: "Services growth durability",
  company: fixtureCompany("AAPL"),
  analysis: [
    "# Investment Thesis",
    "",
    "The company remains a **cash-generation machine** with expanding services mix.",
    "",
    "## Strengths",
    "- Installed base keeps growing with **high retention**.",
    "- Services margin accretion.",
    "",
    "## Risks",
    "- Regulatory pressure on the App Store.",
    "",
    "### Bottom line",
    "Hold sizing steady; add on broad-market weakness.",
  ].join("\n"),
};

test("research workbook is a valid single-sheet xlsx with typed numeric cells", async () => {
  const buffer = await generateResearchWorkbook(researchFixture);

  // Valid xlsx = ZIP container: PK\x03\x04 magic bytes.
  assert.ok(buffer.length > 1000, "workbook buffer should not be empty");
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "PK");

  // Reload and inspect: exactly ONE sheet, banner title, typed numbers with formats.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.equal(workbook.worksheets.length, 1, "research export must be a single sheet");

  const sheet = workbook.worksheets[0];
  assert.match(String(sheet.getCell("A1").value), /AAPL Test Corp \(AAPL\)/);
  const view = sheet.views?.[0] as { state?: string; ySplit?: number } | undefined;
  assert.equal(view?.state, "frozen");
  assert.ok(view?.ySplit, "title banner should be frozen");

  // The sheet flows: KEY STATS then FUNDAMENTALS then ANALYSIS section banners.
  const sectionRows: string[] = [];
  sheet.eachRow((row) => {
    const v = row.getCell(1).value;
    if (typeof v === "string" && ["KEY STATS", "FUNDAMENTALS", "ANALYSIS"].includes(v)) sectionRows.push(v);
  });
  assert.deepEqual(sectionRows, ["KEY STATS", "FUNDAMENTALS", "ANALYSIS"]);

  // Numeric cells must be typed numbers with number formats (usable in Excel),
  // and every fixture metric value must appear somewhere as a real number.
  let typedNumericCells = 0;
  const numericValues = new Set<number>();
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "number") {
        numericValues.add(cell.value);
        if (cell.numFmt) typedNumericCells += 1;
      }
    });
  });
  assert.ok(typedNumericCells >= 15, `expected many formatted numeric cells, got ${typedNumericCells}`);
  assert.ok(numericValues.has(211.45), "price should be a typed number");
  assert.ok(numericValues.has(3_210_000_000_000), "market cap should be a typed number");
  assert.ok(numericValues.has(0.2431), "profit margin should be a typed raw fraction with percent format");
});

test("research workbook handles a company data error without crashing", async () => {
  const buffer = await generateResearchWorkbook({
    ...researchFixture,
    company: { ticker: "AAPL", name: "AAPL Test Corp", metrics: {}, error: "Yahoo lookup failed" },
  });
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "PK");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.equal(workbook.worksheets.length, 1);
});

test("comparison workbook still produces a Comparison sheet plus one sheet per company", async () => {
  const fixture: AnalyzeResponse = {
    kind: "comparison",
    reportId: "99999999-8888-7777-6666-555555555555",
    generatedAt: "2026-07-06T12:00:00.000Z",
    companies: [fixtureCompany("AAPL"), fixtureCompany("MSFT", 100)],
  };

  const buffer = await generateComparisonWorkbook(fixture);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "PK");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.deepEqual(
    workbook.worksheets.map((s) => s.name),
    ["Comparison", "AAPL", "MSFT"]
  );
});
