import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const workspace = await getAdminWorkspaceData();
    const format = (request.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();

    if (format === "excel" || format === "xlsx" || format === "csv") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Tour ConnecTT";
      workbook.company = "Tour ConnecTT";
      workbook.title = "Tour ConnecTT Admin Report";
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 28 },
        { header: "Value", key: "value", width: 20 },
      ];
      summarySheet.addRows([
        { metric: "Total users", value: workspace.stats.totalUsers },
        { metric: "Active operators", value: workspace.stats.activeOperators },
        { metric: "Live listings", value: workspace.stats.liveListings },
        { metric: "Pending bookings", value: workspace.stats.pendingBookings },
        { metric: "Gross WiPay collections", value: workspace.stats.monthlyRevenue },
        { metric: "Admin commission (20%)", value: workspace.stats.adminCommissionTotal },
        { metric: "Operator payout pool (80%)", value: workspace.stats.operatorPayoutTotal },
        { metric: "Profile views", value: workspace.stats.profileViews },
      ]);

      const bookingsSheet = workbook.addWorksheet("Bookings");
      bookingsSheet.columns = [
        { header: "Guest", key: "guest", width: 24 },
        { header: "Experience", key: "experience", width: 36 },
        { header: "Operator", key: "operator", width: 24 },
        { header: "Status", key: "status", width: 14 },
        { header: "Created", key: "created", width: 18 },
      ];
      bookingsSheet.addRows(
        workspace.recentBookings.map((booking) => ({
          guest: booking.traveler_name,
          experience: booking.listing?.title ?? booking.destination,
          operator: booking.operator_name,
          status: booking.status,
          created: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(booking.created_at)),
        })),
      );

      const campaignsSheet = workbook.addWorksheet("Campaigns");
      campaignsSheet.columns = [
        { header: "Code", key: "code", width: 24 },
        { header: "Partner", key: "partner", width: 24 },
        { header: "Usage", key: "usage", width: 14 },
        { header: "Conversions", key: "conversions", width: 14 },
        { header: "Status", key: "status", width: 12 },
      ];
      campaignsSheet.addRows(
        workspace.promotions.map((campaign) => ({
          code: campaign.code,
          partner: campaign.partner,
          usage: campaign.usage,
          conversions: campaign.conversions,
          status: campaign.status,
        })),
      );

      [summarySheet, bookingsSheet, campaignsSheet].forEach((sheet) => {
        const header = sheet.getRow(1);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC5161D" } };
        header.alignment = { horizontal: "center" };
      });

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      return new NextResponse(buffer, {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition":
            "attachment; filename=\"tour-connecttt-admin-report.xlsx\"; filename*=UTF-8''tour-connecttt-admin-report.xlsx",
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (format !== "pdf") {
      return new NextResponse("Unsupported report format. Use pdf or excel.", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    const pdfBuffer = await buildAdminPdfBuffer(workspace);

    return new NextResponse(pdfBuffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition":
          "attachment; filename=\"tour-connecttt-admin-report.pdf\"; filename*=UTF-8''tour-connecttt-admin-report.pdf",
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[admin/reports]", error);
    return new NextResponse("Unable to generate the admin report right now.", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}

async function buildAdminPdfBuffer(workspace: Awaited<ReturnType<typeof getAdminWorkspaceData>>) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await readFile(join(process.cwd(), "public", "branding", "tourconnecttt-logo.png"));
  const logo = await pdfDoc.embedPng(logoBytes);

  const width = page.getWidth();
  const height = page.getHeight();
  const left = 48;
  let cursorY = height - 162;

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.98, 0.96, 0.92),
  });

  page.drawRectangle({
    x: 0,
    y: height - 120,
    width,
    height: 120,
    color: rgb(0.77, 0.09, 0.11),
  });

  page.drawImage(logo, {
    x: left,
    y: height - 94,
    width: 138,
    height: 44,
  });

  page.drawText("Tour ConnecTT Admin Report", {
    x: left + 148,
    y: height - 66,
    size: 19,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText("Executive snapshot of bookings, listings, payments, and campaigns.", {
    x: left + 148,
    y: height - 82,
    size: 9,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  page.drawText(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date()), {
    x: width - 184,
    y: height - 66,
    size: 9,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  const drawSectionTitle = (title: string) => {
    page.drawText(title, {
      x: left,
      y: cursorY,
      size: 13,
      font: boldFont,
      color: rgb(0.12, 0.1, 0.09),
    });
    cursorY -= 22;
  };

  drawSectionTitle("Summary");

  const summaryPairs: Array<[string, string]> = [
    ["Total users", String(workspace.stats.totalUsers)],
    ["Active operators", String(workspace.stats.activeOperators)],
    ["Live listings", String(workspace.stats.liveListings)],
    ["Pending bookings", String(workspace.stats.pendingBookings)],
    [
      "Gross WiPay collections",
      new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(
        workspace.stats.monthlyRevenue,
      ),
    ],
    [
      "Admin commission (20%)",
      new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(
        workspace.stats.adminCommissionTotal,
      ),
    ],
    [
      "Operator payout pool (80%)",
      new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(
        workspace.stats.operatorPayoutTotal,
      ),
    ],
    ["Profile views", String(workspace.stats.profileViews)],
  ];

  summaryPairs.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const boxWidth = 230;
    const boxHeight = 44;
    const x = column === 0 ? left : width - left - boxWidth;
    const y = cursorY - row * 54;

    page.drawRectangle({
      x,
      y: y - 2,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.88, 0.83, 0.75),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    page.drawText(label, {
      x: x + 12,
      y: y + 14,
      size: 8,
      font: regularFont,
      color: rgb(0.42, 0.39, 0.34),
    });
    page.drawText(value, {
      x: x + 12,
      y: y + 2,
      size: 11,
      font: boldFont,
      color: rgb(0.12, 0.1, 0.09),
    });
  });

  cursorY -= 120;

  drawSectionTitle("Recent bookings");
  workspace.recentBookings.slice(0, 4).forEach((booking) => {
    page.drawText(`${booking.traveler_name} · ${booking.status}`, {
      x: left,
      y: cursorY,
      size: 10,
      font: boldFont,
      color: rgb(0.12, 0.1, 0.09),
    });
    cursorY -= 14;
    page.drawText(`${booking.listing?.title ?? booking.destination} · ${booking.operator_name}`, {
      x: left,
      y: cursorY,
      size: 9,
      font: regularFont,
      color: rgb(0.42, 0.39, 0.34),
    });
    cursorY -= 18;
  });

  drawSectionTitle("Referral campaigns");
  workspace.promotions.slice(0, 4).forEach((campaign) => {
    page.drawText(`${campaign.code} · ${campaign.partner}`, {
      x: left,
      y: cursorY,
      size: 10,
      font: boldFont,
      color: rgb(0.12, 0.1, 0.09),
    });
    cursorY -= 14;
    page.drawText(`Usage ${campaign.usage} · Conversions ${campaign.conversions} · ${campaign.status}`, {
      x: left,
      y: cursorY,
      size: 9,
      font: regularFont,
      color: rgb(0.42, 0.39, 0.34),
    });
    cursorY -= 18;
  });

  page.drawText("Generated by Tour ConnecTT", {
    x: left,
    y: 26,
    size: 9,
    font: regularFont,
    color: rgb(0.42, 0.39, 0.34),
  });

  return Buffer.from(await pdfDoc.save());
}
