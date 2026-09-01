import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { TableWrapper } from "@/components/ui/TableWrapper";
import { getAdminPageShellProps } from "@/lib/admin/page-shell-props";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format/date";
import { formatListingPrice } from "@/lib/format/listing-price";
import { getPlatformEvents } from "@/lib/supabase/analytics";
import { createReferralCampaignAction, toggleReferralCampaignAction } from "../AdminPromotions/actions";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";
import {
  PLATFORM_ADMIN_COMMISSION_RATE,
  calculatePaymentSettlement,
  getWiPayPaymentsForInquiryIds,
  isSuccessfulWiPayPayment,
} from "@/lib/payments/wipay";

type AnalyticsRange = "7d" | "30d" | "1y";

type AdminAnalyticsPageProps = {
  searchParams: Promise<{
    range?: string;
    created?: string;
    updated?: string;
    error?: string;
  }>;
};

type OperatorCommissionRow = {
  id: string;
  name: string;
  inquiries: number;
  successfulPayments: number;
  gross: number;
  commission: number;
  payout: number;
};

function normalizeRange(value: string | undefined): AnalyticsRange {
  if (value === "7d" || value === "30d" || value === "1y") {
    return value;
  }

  return "30d";
}

function getRangeStart(range: AnalyticsRange) {
  const start = new Date();

  if (range === "1y") {
    start.setDate(start.getDate() - 365);
  } else {
    start.setDate(start.getDate() - (range === "7d" ? 7 : 30));
  }

  start.setHours(0, 0, 0, 0);
  return start;
}

function buildSeries(events: Awaited<ReturnType<typeof getPlatformEvents>>, range: AnalyticsRange) {
  const start = getRangeStart(range);
  const filtered = events.filter((event) => new Date(event.created_at) >= start);

  if (range === "1y") {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - index));
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    });

    const buckets = new Map(months.map((date) => [date.toISOString().slice(0, 7), 0]));
    filtered.forEach((event) => {
      const key = new Date(event.created_at).toISOString().slice(0, 7);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    });

    return {
      labels: months.map((date) => formatDate(date)),
      counts: months.map((date) => buckets.get(date.toISOString().slice(0, 7)) ?? 0),
      total: filtered.length,
    };
  }

  const days = Array.from({ length: range === "7d" ? 7 : 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((range === "7d" ? 7 : 30) - 1 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const buckets = new Map(days.map((date) => [date.toISOString().slice(0, 10), 0]));
  filtered.forEach((event) => {
    const key = new Date(event.created_at).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  });

  return {
    labels: days.map((date) => formatDate(date)),
    counts: days.map((date) => buckets.get(date.toISOString().slice(0, 10)) ?? 0),
    total: filtered.length,
  };
}

function buildChartLabels(labels: string[], range: AnalyticsRange) {
  if (range === "1y") {
    return labels;
  }

  if (range === "7d") {
    return labels;
  }

  return labels.map((label, index) => {
    const isEdge = index === 0 || index === labels.length - 1;
    return isEdge || index % 4 === 0 ? label : "";
  });
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function buildGrowthHref(base: string, params: Record<string, string>) {
  const url = new URL(base, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

function buildReferralLink(campaign: {
  code: string;
  landingPage: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}) {
  const url = new URL(campaign.landingPage || "/Enquiry", "http://tt-connect.local");
  url.searchParams.set("ref", campaign.code);
  url.searchParams.set("utm_source", campaign.utmSource);
  url.searchParams.set("utm_medium", campaign.utmMedium || "referral");
  url.searchParams.set("utm_campaign", campaign.utmCampaign);
  return `${url.pathname}${url.search}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TTD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedRange = normalizeRange(resolvedSearchParams.range);
  const workspace = await getAdminWorkspaceData();
  const platformEvents = await getPlatformEvents(2000);
  const paymentRows = await getWiPayPaymentsForInquiryIds(workspace.inquiries.map((item) => item.id)).catch(() => []);
  const series = buildSeries(platformEvents, selectedRange);
  const selectedStart = getRangeStart(selectedRange);
  const chartLabels = buildChartLabels(series.labels, selectedRange);
  const successfulPayments = paymentRows.filter((payment) => isSuccessfulWiPayPayment(payment.status));

  const inquiriesInRange = workspace.inquiries.filter((item) => new Date(item.created_at) >= selectedStart);
  const confirmedInRange = inquiriesInRange.filter((item) => item.status === "confirmed");
  const listingsInRange = workspace.listings.filter((item) => new Date(item.created_at) >= selectedStart).length;
  const profileViewsInRange = platformEvents.filter(
    (event) => event.event_type === "profile_view" && new Date(event.created_at) >= selectedStart,
  ).length;
  const maxActivity = Math.max(1, ...series.counts);
  const hasActivity = series.total > 0;
  const selectedRangeLabel = selectedRange === "7d" ? "7 days" : selectedRange === "30d" ? "30 days" : "12 months";
  const reportRows = workspace.reports;
  const actionMessage = resolvedSearchParams.created ? "Campaign created." : resolvedSearchParams.updated ? "Campaign updated." : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not update that campaign. Please try again.",
  );
  const promotedTours = workspace.featuredListings.length ? workspace.featuredListings : workspace.recentListings;
  const activeCampaigns = workspace.promotions.filter((campaign) => campaign.status === "Active").length;
  const pausedCampaigns = workspace.promotions.length - activeCampaigns;
  const topCampaign =
    [...workspace.promotions].sort((left, right) => right.conversions - left.conversions || right.usage - left.usage)[0] ?? null;
  const activeRevenueSignal =
    workspace.stats.monthlyRevenue > 0
      ? `${workspace.stats.monthlyRevenue.toLocaleString()} in estimated revenue is already linked to confirmed bookings.`
      : "No confirmed booking revenue has been linked yet.";
  const growthHref = buildGrowthHref("/AdminAnalytics", { range: selectedRange });
  const commissionRate = PLATFORM_ADMIN_COMMISSION_RATE * 100;
  const operatorCommissionRows: OperatorCommissionRow[] = workspace.users
    .filter((user) => user.role === "operator")
    .map((operator) => {
      const operatorInquiries = workspace.inquiries.filter((item) => item.operator_id === operator.id);
      const operatorPayments = successfulPayments.filter((payment) =>
        operatorInquiries.some((inquiry) => inquiry.id === payment.inquiry_id),
      );
      const gross = operatorPayments.reduce((total, payment) => total + Number.parseFloat(payment.amount), 0);
      const commission = operatorPayments.reduce(
        (total, payment) => total + (calculatePaymentSettlement(payment.amount)?.adminCommissionAmount ?? 0),
        0,
      );

      return {
        id: operator.id,
        name: operator.full_name,
        inquiries: operatorInquiries.length,
        successfulPayments: operatorPayments.length,
        gross,
        commission,
        payout: operatorPayments.reduce(
          (total, payment) => total + (calculatePaymentSettlement(payment.amount)?.operatorPayoutAmount ?? 0),
          0,
        ),
      };
    })
    .filter((row) => row.gross > 0 || row.inquiries > 0)
    .sort((left, right) => right.commission - left.commission || right.gross - left.gross);
  const totalCommission = operatorCommissionRows.reduce((sum, row) => sum + row.commission, 0);

  return (
    <PageShell {...getAdminPageShellProps(workspace.profile)}>
      <main className="portal-list-page">
        <SectionHeader
          level={1}
          eyebrow="Analytics"
          title="Platform insights and reporting."
          description="A single dashboard for growth metrics, enquiry trends, booking performance, operator performance, and traveller behaviour."
          action={
            <div className="tc-filter-tabs">
              {(["7d", "30d"] as const).map((range) => (
                <Button
                  key={range}
                  href={`/AdminAnalytics?range=${range}`}
                  variant={range === selectedRange ? "primary" : "outline"}
                  className={`tc-filter-pill ${range === selectedRange ? "tc-filter-pill-active" : ""}`}
                >
                  {range.toUpperCase()}
                </Button>
              ))}
              <Button href="/api/admin/reports?format=pdf" variant="outline" download="tour-connecttt-admin-report.pdf" className="tc-filter-pill">
                PDF Export
              </Button>
              <Button href="/api/admin/reports?format=excel" variant="primary" download="tour-connecttt-admin-report.xlsx" className="tc-filter-pill tc-filter-pill-active">
                Excel Export
              </Button>
            </div>
          }
        />

        {actionMessage ? (
          <div className="mt-6">
            <StatusMessage tone="success">{actionMessage}</StatusMessage>
          </div>
        ) : null}
        {resolvedSearchParams.error ? (
          <div className="mt-4">
            <StatusMessage tone="error">{actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
          {[
            { label: "Activity events", value: `${series.total.toLocaleString()}`, note: selectedRangeLabel },
            {
              label: "Enquiry conversion",
              value: `${Math.round((confirmedInRange.length / Math.max(1, inquiriesInRange.length)) * 100)}%`,
              note: "Enquiry to booking momentum",
            },
            { label: "Live listings", value: `${listingsInRange.toLocaleString()}`, note: "Published in the selected range" },
            { label: "Profile views", value: `${profileViewsInRange.toLocaleString()}`, note: "Traveller and partner interest" },
          ].map((card, index) => (
            <GlassPanel key={card.label} className="p-gutter">
              <div className="label-caps text-secondary mb-2">{card.label}</div>
              <div
                className="font-display text-[56px] leading-none tracking-[-0.03em]"
                style={{
                  color:
                    index === 1
                      ? "var(--secondary)"
                      : index === 2
                        ? "var(--tertiary)"
                        : "var(--on-background)",
                }}
              >
                {card.value}
              </div>
              <p className="mt-4 text-sm text-on-surface-variant">{card.note}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="section-shell grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          <div className="lg:col-span-7 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter">
              <SectionHeader
                eyebrow="KPI dashboard"
                title="Visual reporting overview."
                description="A clean chart surface for platform activity, enquiry conversion, and booking performance."
              />
              {hasActivity ? (
                <div
                  className="mt-6 grid gap-1 sm:gap-3 items-end h-64"
                  style={{ gridTemplateColumns: `repeat(${series.labels.length}, minmax(0, 1fr))` }}
                >
                  {series.counts.map((count, index) => (
                    <div key={series.labels[index]} className="flex flex-col items-center gap-3">
                      <div className="w-full rounded-t-2xl bg-secondary/15 border border-secondary/15 flex items-end overflow-hidden" style={{ height: 240 }}>
                        <div
                          className="w-full bg-secondary transition-all"
                          style={{
                            height: count > 0 ? `${Math.max(12, (count / maxActivity) * 100)}%` : 0,
                          }}
                        />
                      </div>
                      <span className="min-h-[2rem] text-center text-[10px] uppercase tracking-[0.12em] leading-tight text-on-surface-variant whitespace-normal">
                        {chartLabels[index]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <StatusMessage tone="info">No platform activity for this period yet.</StatusMessage>
                </div>
              )}
            </GlassPanel>

            <GlassPanel className="p-0 overflow-hidden">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Format</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.name}>
                      <td className="font-body-md text-on-background">{row.name}</td>
                      <td className="text-sm text-on-surface-variant">{row.format}</td>
                      <td>
                        <Badge tone={row.status === "Ready" ? "accent" : "soft"}>{row.status}</Badge>
                      </td>
                      <td className="text-right">
                        <Button
                          href={`/api/admin/reports?format=${row.format.toLowerCase()}`}
                          variant="outline"
                          className="px-4 py-2 min-h-0"
                          download={
                            row.format.toLowerCase() === "excel"
                              ? "tour-connecttt-admin-report.xlsx"
                              : "tour-connecttt-admin-report.pdf"
                          }
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter">
              <SectionHeader
                eyebrow="Trend notes"
                title="Growth signals."
                description="A lightweight summary of what the numbers are doing."
              />
              <div className="mt-6 space-y-4">
                {workspace.trendNotes.map((item) => (
                  <div key={item} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4 text-sm text-on-background">
                    {item}
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <SectionHeader
                eyebrow="Export settings"
                title="Sharing workflow."
                description="Keep reporting ready for internal review and leadership summaries."
              />
              <div className="mt-6 space-y-4">
                {[
                  { label: "Weekly summary", value: reportRows[0]?.status ?? "Queued" },
                  { label: "Monthly PDF", value: reportRows[1]?.status ?? "Queued" },
                  { label: "Excel export", value: "Enabled" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="font-body-md text-on-background">{item.label}</div>
                    <Badge tone="accent">{item.value}</Badge>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </section>

        <section className="section-shell grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
          <div className="xl:col-span-8 flex flex-col">
            <SectionHeader
              eyebrow="Commissions"
              title="Operator commission ledger."
              description="Estimated commission is calculated from successful WiPay payments linked to each operator."
            />

            <GlassPanel className="mt-5 p-0 overflow-hidden flex-1">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Payments</th>
                    <th>Gross volume</th>
                    <th>Commission</th>
                    <th>Payout</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorCommissionRows.length ? (
                    operatorCommissionRows.map((row) => (
                      <tr key={row.id}>
                        <td className="align-middle">
                          <div className="font-body-md font-semibold text-on-background">{row.name}</div>
                          <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">
                            {row.inquiries} enquiries
                          </div>
                        </td>
                        <td className="align-middle text-sm text-on-surface-variant">{row.successfulPayments}</td>
                        <td className="align-middle text-sm text-on-surface-variant">{formatCurrency(row.gross)}</td>
                        <td className="align-middle text-sm text-on-surface-variant">{formatCurrency(row.commission)}</td>
                        <td className="align-middle text-sm text-on-surface-variant">{formatCurrency(row.payout)}</td>
                        <td className="align-middle text-right">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <Button
                              href={`/AdminBookings?tab=payments&paymentStatus=paid&q=${encodeURIComponent(row.name)}`}
                              variant="outline"
                              className="btn-sm"
                            >
                              Review payments
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-sm text-on-surface-variant">
                        No operator commissions are available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Commission summary</div>
              <div className="text-display-xl-mobile text-on-background">{formatCurrency(totalCommission)}</div>
              <p className="section-copy mt-2">
                Estimated admin commission using a {commissionRate.toFixed(1)}% platform rate on successful WiPay payments.
              </p>
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Payment review</div>
              <p className="section-copy">
                Use the bookings ledger to inspect successful payments, then request a withdrawal from the admin dashboard when the balance is ready.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button href="/AdminBookings?tab=payments&paymentStatus=paid" variant="outline">
                  Open paid payments
                </Button>
                <Button href="/AdminDashboard" variant="ghost">
                  Open dashboard
                </Button>
              </div>
            </GlassPanel>
          </div>
        </section>

        <section className="section-shell grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
          <div className="xl:col-span-8 flex flex-col">
            <SectionHeader
              eyebrow="Growth"
              title="Campaign momentum and referral performance."
              description="Review featured listings, partner activity, and the campaign signal behind the numbers."
            />

            <GlassPanel className="mt-5 p-0 overflow-hidden flex-1">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Tour</th>
                    <th>Placement</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {promotedTours.length ? (
                    promotedTours.map((tour) => (
                      <tr key={tour.id}>
                        <td>
                          <div className="flex min-w-[260px] items-center gap-4">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-container-high">
                              {tour.image_url ? (
                                <Image
                                  alt={tour.title}
                                  fill
                                  className="object-cover"
                                  sizes="48px"
                                  src={tour.image_url}
                                />
                              ) : null}
                            </div>
                            <div>
                              <div className="font-body-md font-semibold text-on-background">{tour.title}</div>
                              <div className="text-sm text-on-surface-variant">{tour.location}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-sm text-on-surface-variant">{tour.featured ? "Homepage hero" : "Editorial feature"}</td>
                        <td className="text-sm text-on-surface-variant">{formatListingPrice(tour.price) ?? "No price"}</td>
                        <td>
                          <Badge tone={tour.featured ? "accent" : "soft"}>{tour.featured ? "Live" : "Queued"}</Badge>
                        </td>
                        <td className="text-center">
                          <div className="tc-filter-tabs">
                            <Button href={`/AdminListings?listing=${tour.id}`} variant="outline" className="btn-sm tc-filter-pill">
                              Review listing
                            </Button>
                            <Button href="/AdminListings" variant="primary" className="btn-sm tc-filter-pill tc-filter-pill-active">
                              Open listings
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-sm text-on-surface-variant">
                        No featured listings are available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter flex-1">
              <div className="label-caps text-secondary mb-3">Growth signals</div>
              <div className="grid gap-3">
                {[
                  `${activeCampaigns} campaign${activeCampaigns === 1 ? "" : "s"} are live and sending traffic.`,
                  `${pausedCampaigns} campaign${pausedCampaigns === 1 ? "" : "s"} are paused and ready to reactivate.`,
                  topCampaign
                    ? `${topCampaign.code} is leading the table with ${topCampaign.conversions} conversions on ${topCampaign.landingPage}.`
                    : "Create a campaign below to start tracking partner growth.",
                  activeRevenueSignal,
                ].map((note) => (
                  <div key={note} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                    <div className="text-sm text-on-surface-variant">{note}</div>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Quick actions</div>
              <p className="section-copy">Move between analytics, bookings, and listing moderation without leaving the admin surface.</p>
              <div className="mt-4 tc-filter-tabs">
                <Button href="/AdminBookings" variant="outline" className="tc-filter-pill">
                  Open bookings
                </Button>
                <Button href="/AdminListings" variant="ghost" className="tc-filter-pill">
                  Open listings
                </Button>
              </div>
            </GlassPanel>
          </div>
        </section>

        <section className="section-shell grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
          <div className="xl:col-span-8 flex flex-col">
            <SectionHeader
              eyebrow="Affiliate tracking"
              title="Partner codes and usage."
              description="Track referral codes and usage without creating another oversized dashboard section."
            />

            <GlassPanel className="mt-5 p-0 overflow-hidden flex-1">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Partner</th>
                    <th>Usage</th>
                    <th>Landing page</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.promotions.length ? (
                    workspace.promotions.map((item) => (
                      <tr key={item.id}>
                        <td className="font-body-md text-on-background">{item.code}</td>
                        <td className="text-sm text-on-surface-variant">{item.partner}</td>
                        <td className="text-sm text-on-surface-variant">
                          {item.usage} uses · {item.conversions} conversions
                        </td>
                        <td className="text-sm text-on-surface-variant">{item.landingPage}</td>
                        <td>
                          <Badge tone={item.status === "Active" ? "accent" : "soft"}>{item.status}</Badge>
                        </td>
                        <td className="text-center">
                          <div className="tc-filter-tabs">
                            <CopyButton
                              value={buildReferralLink({
                                code: item.code,
                                landingPage: item.landingPage,
                                utmSource: item.utmSource,
                                utmMedium: item.utmMedium,
                                utmCampaign: item.utmCampaign,
                              })}
                            >
                              Copy link
                            </CopyButton>
                            <CopyButton value={item.code}>Copy</CopyButton>
                            <form action={toggleReferralCampaignAction}>
                              <input name="campaign_id" type="hidden" value={item.id} />
                              <input name="return_to" type="hidden" value={growthHref} />
                              <input name="is_active" type="hidden" value={String(!item.status || item.status !== "Active")} />
                              <FormSubmitButton
                                variant="ghost"
                                className="btn-sm tc-filter-pill"
                                pendingLabel={item.status === "Active" ? "Pausing..." : "Activating..."}
                              >
                                {item.status === "Active" ? "Pause" : "Activate"}
                              </FormSubmitButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-sm text-on-surface-variant">
                        No referral campaigns are set up yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="xl:col-span-4 flex flex-col">
            <GlassPanel className="p-gutter flex-1">
              <div className="label-caps text-secondary mb-2">Create campaign</div>
              <p className="section-copy">Generate affiliate links with commission-ready tracking.</p>

              <form action={createReferralCampaignAction} className="mt-5 grid gap-3">
                <input name="return_to" type="hidden" value={growthHref} />
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                  name="partner_name"
                  placeholder="Partner name"
                  required
                  type="text"
                />
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                  name="code"
                  placeholder="Code (optional)"
                  type="text"
                />
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                  name="landing_page"
                  placeholder="/Enquiry"
                  defaultValue="/Enquiry"
                  type="text"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                    name="utm_source"
                    placeholder="utm_source"
                    required
                    type="text"
                  />
                  <input
                    className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                    name="utm_medium"
                    placeholder="utm_medium"
                    defaultValue="referral"
                    type="text"
                  />
                </div>
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                  name="utm_campaign"
                  placeholder="utm_campaign"
                  required
                  type="text"
                />
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3 text-on-background outline-none"
                  name="commission_rate"
                  placeholder="Commission rate"
                  defaultValue="12.5"
                  min="0"
                  max="100"
                  step="0.5"
                  type="number"
                />
                <FormSubmitButton variant="primary" pendingLabel="Creating campaign...">
                  Create campaign
                </FormSubmitButton>
              </form>
              <div className="mt-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                <div className="label-caps text-secondary mb-2">How partners use it</div>
                <p className="section-copy">
                  Share the generated referral link with tourism partners or hotel partners. The code is tracked automatically through
                  the Enquiry flow, and any confirmed referral activity is captured in platform events for reporting.
                </p>
              </div>
            </GlassPanel>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
