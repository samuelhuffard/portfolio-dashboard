import ExcelJS from "exceljs";
import type { CompanyData, ResearchResponse, AnalyzeResponse } from "@/lib/research/types";
import { METRIC_REGISTRY, METRIC_CATEGORIES } from "@/lib/research/registry";
import { EXCEL_NUMBER_FORMATS } from "@/lib/research/format";

const ANALYSIS_COLUMN_WIDTH = 100;
const DESCRIPTION_COLUMN_WIDTH = 70;

export const CATEGORY_COLORS: Record<string, string> = {
  Market: "FFE8F0FE",
  Valuation: "FFFCE8E6",
  Profitability: "FFE6F4EA",
  Growth: "FFFEF7E0",
  "Financial Health": "FFF3E8FD",
  "Per Share & Income": "FFE8F5F3",
};

const NAVY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

function categoryFill(category: string): ExcelJS.Fill {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: CATEGORY_COLORS[category] ?? "FFF3F4F6" },
  };
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
      row.getCell(2).numFmt = EXCEL_NUMBER_FORMATS[metric.format];
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      setWrappedRowHeight(row, metric.description, DESCRIPTION_COLUMN_WIDTH);
    }
  }

  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = DESCRIPTION_COLUMN_WIDTH;
  return sheet;
}

/** Builds the single-company research workbook: an "Analysis" sheet (AI summary) plus a "Data" sheet. */
export async function generateResearchWorkbook(data: ResearchResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portfolio Manager";
  workbook.created = new Date(data.generatedAt);

  addAnalysisSheet(workbook, data);
  addCompanyMetricsSheet(workbook, data.company, "Data");

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Builds the multi-company comparison workbook: a "Comparison" sheet plus one data sheet per company. */
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
        row.getCell(i + 2).numFmt = EXCEL_NUMBER_FORMATS[metric.format];
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

function addAnalysisSheet(workbook: ExcelJS.Workbook, data: ResearchResponse) {
  const sheet = workbook.addWorksheet("Analysis");

  const titleRow = sheet.addRow([`${data.company.name} (${data.ticker})`]);
  titleRow.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).fill = NAVY_FILL;

  if (data.company.sector || data.company.industry) {
    const subtitleRow = sheet.addRow([
      [data.company.sector, data.company.industry].filter(Boolean).join(" / "),
    ]);
    subtitleRow.font = { italic: true, color: { argb: "FF6B7280" } };
  }

  const dateRow = sheet.addRow([`Generated ${new Date(data.generatedAt).toLocaleString()}`]);
  dateRow.font = { size: 9, color: { argb: "FF9CA3AF" } };

  if (data.focus) {
    sheet.addRow([]);
    const focusLabelRow = sheet.addRow(["Focus of this analysis"]);
    focusLabelRow.font = { bold: true, italic: true };
    const focusRow = sheet.addRow([data.focus]);
    focusRow.font = { italic: true, color: { argb: "FF4B5563" } };
    focusRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    setWrappedRowHeight(focusRow, data.focus);
  }

  sheet.addRow([]);

  for (const line of data.analysis.split("\n")) {
    addAnalysisLine(sheet, line);
  }

  sheet.getColumn(1).width = ANALYSIS_COLUMN_WIDTH;
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
    row.font = { bold: true, size: level === 1 ? 14 : level === 2 ? 12.5 : 11.5 };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    return;
  }

  const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
  const text = bulletMatch ? bulletMatch[1] : trimmed;
  const row = sheet.addRow([richTextCell(text, !!bulletMatch)]);
  row.getCell(1).font = { size: 11 };
  row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  setWrappedRowHeight(row, text);
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

/** Estimates how many wrapped lines a cell will need at the given column width. */
function setWrappedRowHeight(row: ExcelJS.Row, text: string, columnWidth = ANALYSIS_COLUMN_WIDTH) {
  const charsPerLine = columnWidth - 4;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  row.height = lines * 15;
}
