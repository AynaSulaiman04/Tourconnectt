import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "artifacts");
const outputFile = path.join(outputDir, "platform-test-workbook.xlsx");

const generatedAt = new Date().toISOString();

const summaryRows = [
  ["Generated at", generatedAt],
  ["Environment", "Local production server (`next start`)"],
  ["Build status", "Passed"],
  ["Commission model", "20% admin commission / 80% operator payout"],
  ["SMTP test", "Passed via /api/test-email"],
  ["WiPay verification", "Passed via simulated callback against local route"],
  ["Messaging verification", "Passed for traveler send + operator reply"],
  ["Notes", "Real mailbox inbox verification and real external WiPay card checkout remain manual follow-up items."],
];

const useCases = [
  {
    id: "TC-001",
    area: "Public landing",
    route: "/LandingPage",
    method: "Playwright",
    status: "Passed",
    priority: "High",
    result: "Landing page loaded and hero CTA rendered.",
    notes: "Verified hero text and page title in browser session.",
  },
  {
    id: "TC-002",
    area: "Inquiry access",
    route: "/Inquiry",
    method: "Playwright",
    status: "Passed",
    priority: "High",
    result: "\"Message Operator\" redirects unauthenticated users to sign-up.",
    notes: "Confirmed first listing CTA pointed to /SignUp.",
  },
  {
    id: "TC-003",
    area: "Traveler auth",
    route: "/LoginPage -> /TravellerProfile",
    method: "Playwright",
    status: "Passed",
    priority: "Critical",
    result: "Traveler demo account reached dashboard successfully.",
    notes: "Used traveler.demo@ttconnect.test / DemoPass1234.",
  },
  {
    id: "TC-004",
    area: "Traveler messaging",
    route: "/api/direct-messages",
    method: "Playwright fetch",
    status: "Passed",
    priority: "Critical",
    result: "Traveler sent a direct message into inquiry conversation b6e78475-5109-4a8d-9b4c-d79a3d5625f2.",
    notes: "HTTP 200, message persisted with traveler sender role.",
  },
  {
    id: "TC-005",
    area: "Operator auth",
    route: "/LoginPage?expected_role=operator -> /OperatorDashboard",
    method: "Playwright",
    status: "Passed",
    priority: "Critical",
    result: "Operator demo account reached dashboard successfully.",
    notes: "Used operator.demo.20260522@example.com / DemoPass1234.",
  },
  {
    id: "TC-006",
    area: "Operator messaging",
    route: "/api/direct-messages",
    method: "Playwright fetch",
    status: "Passed",
    priority: "Critical",
    result: "Operator replied to the same conversation and unread state updated.",
    notes: "HTTP 200, reply persisted with operator sender role.",
  },
  {
    id: "TC-007",
    area: "Admin auth",
    route: "/LoginPage?expected_role=admin -> /AdminDashboard",
    method: "Playwright",
    status: "Passed",
    priority: "Critical",
    result: "Admin account reached dashboard and WiPay collections card rendered.",
    notes: "Used admin@ttconnect.com / Admin12345!.",
  },
  {
    id: "TC-008",
    area: "Admin commission view",
    route: "/AdminDashboard",
    method: "Playwright",
    status: "Passed",
    priority: "Critical",
    result: "Dashboard displayed gross, admin 20%, and operator 80% values.",
    notes: "Observed TTD 234.56 gross, TTD 46.91 admin, TTD 187.65 operator on live page.",
  },
  {
    id: "TC-009",
    area: "SMTP transport",
    route: "/api/test-email",
    method: "HTTP request",
    status: "Passed",
    priority: "Critical",
    result: "Route returned { ok: true }.",
    notes: "Confirms Nodemailer transport can send using configured SMTP credentials.",
  },
  {
    id: "TC-010",
    area: "WiPay callback settlement",
    route: "/api/payments/wipay/callback",
    method: "HTTP request + Supabase verification",
    status: "Passed",
    priority: "Critical",
    result: "Fresh payment wpmanual1783256741708 moved from pending to paid and stored settlement metadata.",
    notes: "Verified admin commission 180.00 and operator payout 720.00 on a 900.00 payment.",
  },
  {
    id: "TC-011",
    area: "WiPay emails",
    route: "/api/payments/wipay/callback",
    method: "Live route execution",
    status: "Passed with manual inbox follow-up",
    priority: "High",
    result: "Paid callback completed without server warning and email workflow was invoked.",
    notes: "Mailbox receipt itself was not programmatically inspectable from this environment.",
  },
  {
    id: "TC-012",
    area: "Real hosted WiPay checkout",
    route: "/api/payments/wipay/start -> external gateway",
    method: "Deferred/manual",
    status: "Not executed",
    priority: "High",
    result: "External card-entry checkout was not completed in this run.",
    notes: "Local validation used the confirmed callback path instead of a real third-party payment session.",
  },
];

const workbook = new ExcelJS.Workbook();
workbook.creator = "Codex";
workbook.company = "Tour ConnecTT";
workbook.created = new Date();
workbook.modified = new Date();

const summarySheet = workbook.addWorksheet("Summary", {
  views: [{ state: "frozen", ySplit: 1 }],
});

summarySheet.columns = [
  { header: "Metric", key: "metric", width: 28 },
  { header: "Value", key: "value", width: 96 },
];

summarySheet.getRow(1).font = { bold: true };
summarySheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFC5161D" },
};
summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

for (const [metric, value] of summaryRows) {
  summarySheet.addRow([metric, value]);
}

const casesSheet = workbook.addWorksheet("Use Cases", {
  views: [{ state: "frozen", ySplit: 1 }],
});

casesSheet.columns = [
  { header: "Case ID", key: "id", width: 12 },
  { header: "Area", key: "area", width: 22 },
  { header: "Route / Scope", key: "route", width: 34 },
  { header: "Method", key: "method", width: 22 },
  { header: "Priority", key: "priority", width: 12 },
  { header: "Status", key: "status", width: 26 },
  { header: "Result", key: "result", width: 52 },
  { header: "Notes", key: "notes", width: 76 },
];

casesSheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFC5161D" },
};
casesSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

for (const testCase of useCases) {
  casesSheet.addRow(testCase);
}

casesSheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) {
    return;
  }

  row.alignment = { vertical: "top", wrapText: true };
  const statusCell = row.getCell(6);
  const normalizedStatus = String(statusCell.value ?? "").toLowerCase();

  if (normalizedStatus.startsWith("passed")) {
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEAF5EA" },
    };
    statusCell.font = { color: { argb: "FF1E6B34" }, bold: true };
  } else if (normalizedStatus.includes("not executed")) {
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF4DB" },
    };
    statusCell.font = { color: { argb: "FF9A6700" }, bold: true };
  }
});

await fs.mkdir(outputDir, { recursive: true });
await workbook.xlsx.writeFile(outputFile);

console.log(outputFile);
