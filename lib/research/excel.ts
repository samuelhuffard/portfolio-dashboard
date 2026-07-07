import ExcelJS from "exceljs";
import type { CompanyData, ResearchResponse, AnalyzeResponse, MetricFormat } from "@/lib/research/types";
import { METRIC_REGISTRY, METRIC_CATEGORIES } from "@/lib/research/registry";
import { EXCEL_NUMBER_FORMATS } from "@/lib/research/format";

const DESCRIPTION_COLUMN_WIDTH = 70;

/** Research sheet column widths: Metric | Value | What it means. */
const RESEARCH_COLUMN_WIDTHS = [28, 18, DESCRIPTION_COLUMN_WIDTH];
/** Approximate characters per wrapped line across all three merged research columns. */
const RESEARCH_FULL_WIDTH = RESEARCH_COLUMN_WIDTHS.reduce((a, b) => a + b, 0);

export const CATEGORY_COLORS: Record<string, string> = {
  Market: "FFE8F0FE",
  Valuation: "FFFCE8E6",
  Profitability: "FFE6F4EA",
  Growth: "FFFEF7E0",
  "Financial Health": "FFF3E8FD",
  "Per Share & Income": "FFE8F5F3",
};

const NAVY = "FF1E3A5F";
const NAVY_LIGHT = "FF2C4E7A";
const SNAPSHOT_LABEL_FILL = "FFEDF2F9";
const SNAPSHOT_VALUE_FILL = "FFF8FAFD";

const NAVY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: NAVY },
};

const NAVY_LIGHT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: NAVY_LIGHT },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD3DCE8" } },
  bottom: { style: "thin", color: { argb: "FFD3DCE8" } },
  left: { style: "thin", color: { argb: "FFD3DCE8" } },
  right: { style: "thin", color: { argb: "FFD3DCE8" } },
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function categoryFill(category: string): ExcelJS.Fill {
  return solidFill(CATEGORY_COLORS[category] ?? "FFF3F4F6");
}

/** Excel sheet names: max 31 chars, no : \ / ? * [ ], and must be unique within the workbook. */
function sanitizeSheetName(name: string, workbook: ExcelJS.Workbook): string {
  const base = (name.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Sheet").trim();
  let candidate = base;
  let suffix = 2;
  while (workbook.getWorksheet(candidate)) {
    candidate = `${base.slice(0, 28)} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Single-ticker research workbook — ONE sheet that flows top to bottom:
// title banner → key-stats snapshot grid → full metric table → analysis note.
// ---------------------------------------------------------------------------

/** Metric ids surfaced in the 3x3 key-stats snapshot grid, in reading order. */
const SNAPSHOT_METRIC_IDS = [
  "currentPrice",
  "marketCap",
  "trailingPE",
  "profitMargins",
  "revenueGrowth",
  "returnOnEquity",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "freeCashflow",
] as const;

export async function generateResearchWorkbook(data: ResearchResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portfolio Manager";
  workbook.created = new Date(data.generatedAt);

  const sheet = workbook.addWorksheet(sanitizeSheetName(`${data.ticker} Research`, workbook));
  RESEARCH_COLUMN_WIDTHS.forEach((width, i) => (sheet.getColumn(i + 1).width = width));

  const bannerRows = addTitleBanner(sheet, data);
  sheet.views = [{ state: "frozen", ySplit: bannerRows }];
  sheet.addRow([]);

  if (data.company.error) {
    const errorRow = sheet.addRow(["Error", data.company.error]);
    errorRow.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
    errorRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
  } else {
    addSnapshotGrid(sheet, data.company);
    sheet.addRow([]);
    addMetricTable(sheet, data.company);
  }

  sheet.addRow([]);
  addAnalysisSection(sheet, data);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Navy banner: company + ticker, sector/industry, generated date (+ optional focus). Returns row count. */
function addTitleBanner(sheet: ExcelJS.Worksheet, data: ResearchResponse): number {
  const paintBanner = (row: ExcelJS.Row, fill: ExcelJS.Fill) => {
    for (let i = 1; i <= 3; i++) row.getCell(i).fill = fill;
    sheet.mergeCells(row.number, 1, row.number, 3);
  };

  const titleRow = sheet.addRow([`${data.company.name} (${data.ticker})`]);
  titleRow.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleRow.height = 28;
  titleRow.getCell(1).alignment = { vertical: "middle" };
  paintBanner(titleRow, NAVY_FILL);

  const subtitleParts = [data.company.sector, data.company.industry].filter(Boolean);
  const subtitleRow = sheet.addRow([subtitleParts.join(" / ") || "Equity Research"]);
  subtitleRow.font = { italic: true, size: 11, color: { argb: "FFC9D6E8" } };
  paintBanner(subtitleRow, NAVY_FILL);

  const dateRow = sheet.addRow([`Generated ${new Date(data.generatedAt).toLocaleString()}`]);
  dateRow.font = { size: 9, color: { argb: "FF9FB3CC" } };
  paintBanner(dateRow, NAVY_FILL);

  let rows = 3;
  if (data.focus) {
    const focusRow = sheet.addRow([`Focus: ${data.focus}`]);
    focusRow.font = { italic: true, size: 10, color: { argb: "FFE3ECF7" } };
    focusRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    setWrappedRowHeight(focusRow, `Focus: ${data.focus}`, RESEARCH_FULL_WIDTH);
    paintBanner(focusRow, NAVY_LIGHT_FILL);
    rows += 1;
  }
  return rows;
}

/** 3x3 grid of headline numbers: alternating small-caps label rows and bold typed-value rows. */
function addSnapshotGrid(sheet: ExcelJS.Worksheet, company: CompanyData) {
  addSectionHeader(sheet, "Key Stats");

  const metrics = SNAPSHOT_METRIC_IDS.map((id) => METRIC_REGISTRY.find((m) => m.id === id)).filter(
    (m): m is (typeof METRIC_REGISTRY)[number] => !!m
  );

  for (let start = 0; start < metrics.length; start += 3) {
    const trio = metrics.slice(start, start + 3);

    const labelRow = sheet.addRow(trio.map((m) => m.label.toUpperCase()));
    labelRow.height = 14;
    labelRow.eachCell((cell) => {
      cell.font = { bold: true, size: 8, color: { argb: "FF64748B" } };
      cell.fill = solidFill(SNAPSHOT_LABEL_FILL);
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "bottom" };
    });

    const valueRow = sheet.addRow(trio.map((m) => company.metrics[m.id] ?? "—"));
    valueRow.height = 22;
    trio.forEach((m, i) => {
      const cell = valueRow.getCell(i + 1);
      cell.font = { bold: true, size: 13, color: { argb: "FF1E293B" } };
      cell.fill = solidFill(SNAPSHOT_VALUE_FILL);
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle" };
      if (typeof cell.value === "number") cell.numFmt = excelFormatFor(m.format);
    });
  }
}

/** Full metric table (Metric | Value | What it means) with category band rows. */
function addMetricTable(sheet: ExcelJS.Worksheet, company: CompanyData) {
  addSectionHeader(sheet, "Fundamentals");

  const headerRow = sheet.addRow(["Metric", "Value", "What it means"]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => (cell.fill = NAVY_LIGHT_FILL));

  for (const category of METRIC_CATEGORIES) {
    const categoryRow = sheet.addRow([category]);
    categoryRow.font = { bold: true };
    categoryRow.eachCell((cell) => (cell.fill = categoryFill(category)));
    sheet.mergeCells(categoryRow.number, 1, categoryRow.number, 3);

    const metrics = METRIC_REGISTRY.filter((m) => m.category === category);
    for (const metric of metrics) {
      const row = sheet.addRow([
        metric.label,
        company.metrics[metric.id] ?? null,
        metric.description,
      ]);
      row.getCell(2).numFmt = excelFormatFor(metric.format);
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      row.getCell(3).font = { size: 10, color: { argb: "FF475569" } };
      setWrappedRowHeight(row, metric.description, DESCRIPTION_COLUMN_WIDTH);
    }
  }
}

/** The AI analysis note, broken into styled header/bullet/paragraph rows merged across the sheet. */
function addAnalysisSection(sheet: ExcelJS.Worksheet, data: ResearchResponse) {
  addSectionHeader(sheet, "Analysis");
  for (const line of data.analysis.split("\n")) {
    addAnalysisLine(sheet, line);
  }
}

/** Navy sub-banner row that separates the major blocks of the single research sheet. */
function addSectionHeader(sheet: ExcelJS.Worksheet, label: string) {
  const row = sheet.addRow([label.toUpperCase()]);
  row.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  row.height = 20;
  row.getCell(1).alignment = { vertical: "middle" };
  for (let i = 1; i <= 3; i++) row.getCell(i).fill = NAVY_FILL;
  sheet.mergeCells(row.number, 1, row.number, 3);
}

function excelFormatFor(format: MetricFormat): string {
  return EXCEL_NUMBER_FORMATS[format];
}

function addAnalysisLine(sheet: ExcelJS.Worksheet, line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    sheet.addRow([]);
    return;
  }

  const headerMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const row = sheet.addRow([stripInlineMarkdown(headerMatch[2])]);
    row.font = { bold: true, size: level === 1 ? 13 : level === 2 ? 12 : 11, color: { argb: NAVY } };
    row.getCell(1).alignment = { wrapText: true, vertical: "middle" };
    row.height = 20;
    if (level <= 2) {
      for (let i = 1; i <= 3; i++) row.getCell(i).fill = solidFill("FFE8F0FE");
    }
    sheet.mergeCells(row.number, 1, row.number, 3);
    return;
  }

  const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
  const text = bulletMatch ? bulletMatch[1] : trimmed;
  const row = sheet.addRow([richTextCell(text, !!bulletMatch)]);
  row.getCell(1).font = { size: 11 };
  row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  setWrappedRowHeight(row, text, RESEARCH_FULL_WIDTH);
  sheet.mergeCells(row.number, 1, row.number, 3);
}

/** Splits "**bold**" runs out of a line into ExcelJS rich text segments. */
function richTextCell(text: string, bullet: boolean): ExcelJS.CellValue {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  const runs: { text: string; font?: Partial<ExcelJS.Font> }[] = [];

  if (bullet) runs.push({ text: "•  " });

  for (const segment of segments) {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      runs.push({ text: segment.slice(2, -2), font: { bold: true } });
    } else {
      runs.push({ text: segment });
    }
  }

  if (runs.length === 1 && !runs[0].font) return runs[0].text;
  return { richText: runs };
}

function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

/** Estimates how many wrapped lines a cell will need at the given column width (in characters). */
function setWrappedRowHeight(row: ExcelJS.Row, text: string, columnWidth: number) {
  const charsPerLine = Math.max(10, columnWidth - 4);
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  row.height = lines * 15;
}

// ---------------------------------------------------------------------------
// Multi-company comparison workbook (unchanged layout: Comparison sheet + one
// data sheet per company).
// ---------------------------------------------------------------------------

export async function generateComparisonWorkbook(data: AnalyzeResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portfolio Manager";
  workbook.created = new Date(data.generatedAt);

  addComparisonSheet(workbook, data.companies);
  for (const company of data.companies) {
    addCompanyMetricsSheet(workbook, company);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Adds a sheet with the company header, sector/industry, and all metrics grouped by category. */
function addCompanyMetricsSheet(
  workbook: ExcelJS.Workbook,
  company: CompanyData,
  sheetName?: string,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName ?? company.ticker, workbook));

  const titleRow = sheet.addRow([`${company.name} (${company.ticker})`, "", ""]);
  titleRow.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleRow.eachCell((cell) => (cell.fill = NAVY_FILL));
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 3);

  if (company.sector || company.industry) {
    const subtitleRow = sheet.addRow([
      [company.sector, company.industry].filter(Boolean).join(" / "),
    ]);
    subtitleRow.font = { italic: true, color: { argb: "FF6B7280" } };
    sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, 3);
  }
  sheet.addRow([]);

  if (company.error) {
    const errorRow = sheet.addRow(["Error", company.error]);
    errorRow.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 50;
    return sheet;
  }

  const headerRow = sheet.addRow(["Metric", "Value", "What it means"]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => (cell.fill = NAVY_FILL));

  for (const category of METRIC_CATEGORIES) {
    const categoryRow = sheet.addRow([category]);
    categoryRow.font = { bold: true };
    categoryRow.eachCell((cell) => (cell.fill = categoryFill(category)));
    sheet.mergeCells(categoryRow.number, 1, categoryRow.number, 3);

    const metrics = METRIC_REGISTRY.filter((m) => m.category === category);
    for (const metric of metrics) {
      const row = sheet.addRow([
        metric.label,
        company.metrics[metric.id] ?? null,
        metric.description,
      ]);
      row.getCell(2).numFmt = excelFormatFor(metric.format);
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      setWrappedRowHeight(row, metric.description, DESCRIPTION_COLUMN_WIDTH);
    }
  }

  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = DESCRIPTION_COLUMN_WIDTH;
  return sheet;
}

/** Adds the side-by-side "Comparison" sheet: one column per company, plus a "What it means" column. */
function addComparisonSheet(workbook: ExcelJS.Workbook, companies: CompanyData[]) {
  const sheet = workbook.addWorksheet("Comparison");
  const validCompanies = companies.filter((c) => !c.error);

  const titleRow = sheet.addRow([`Comparison: ${validCompanies.map((c) => c.ticker).join(", ")}`]);
  titleRow.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).fill = NAVY_FILL;
  sheet.mergeCells(titleRow.number, 1, titleRow.number, validCompanies.length + 2);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    "Metric",
    ...validCompanies.map((c) => `${c.ticker} — ${c.name}`),
    "What it means",
  ]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => (cell.fill = NAVY_FILL));

  for (const category of METRIC_CATEGORIES) {
    const categoryRow = sheet.addRow([category]);
    categoryRow.font = { bold: true };
    categoryRow.eachCell((cell) => (cell.fill = categoryFill(category)));
    sheet.mergeCells(categoryRow.number, 1, categoryRow.number, validCompanies.length + 2);

    const metrics = METRIC_REGISTRY.filter((m) => m.category === category);
    for (const metric of metrics) {
      const row = sheet.addRow([
        metric.label,
        ...validCompanies.map((c) => c.metrics[metric.id] ?? null),
        metric.description,
      ]);
      for (let i = 0; i < validCompanies.length; i++) {
        row.getCell(i + 2).numFmt = excelFormatFor(metric.format);
      }
      const descCell = row.getCell(validCompanies.length + 2);
      descCell.alignment = { wrapText: true, vertical: "top" };
      setWrappedRowHeight(row, metric.description, DESCRIPTION_COLUMN_WIDTH);
    }
  }

  sheet.getColumn(1).width = 26;
  for (let i = 2; i <= validCompanies.length + 1; i++) {
    sheet.getColumn(i).width = 16;
  }
  sheet.getColumn(validCompanies.length + 2).width = DESCRIPTION_COLUMN_WIDTH;
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
}
