import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TableWrapper } from "@/components/ui/TableWrapper";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import {
  updateInquiryPaymentAmountAction,
  updateInquiryStatusAction,
  updateWiPayPaymentStatusAction,
} from "./actions";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";
import {
  getWiPayPaymentsForInquiryIds,
  isPendingWiPayPayment,
  isSuccessfulWiPayPayment,
  type WiPayPaymentSummary,
} from "@/lib/payments/wipay";
import { formatDate } from "@/lib/format/date";

type AdminBookingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BookingFilter = "all" | "submitted" | "reviewed" | "confirmed" | "closed";
type BookingSort = "newest" | "oldest" | "status" | "upcoming";
type BookingTab = "bookings" | "payments";
type PaymentStatusFilter = "all" | "paid" | "pending" | "failed";

type AdminBookingPaymentRecord = WiPayPaymentSummary & {
  traveler_name: string;
  operator_name: string;
  listing_title: string | null;
  inquiry_status: string;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function normalizeFilter(value: string | undefined): BookingFilter {
  return value === "submitted" || value === "reviewed" || value === "confirmed" || value === "closed" ? value : "all";
}

function normalizeSort(value: string | undefined): BookingSort {
  return value === "oldest" || value === "status" || value === "upcoming" ? value : "newest";
}

function normalizeTab(value: string | undefined): BookingTab {
  return value === "payments" ? "payments" : "bookings";
}

function normalizePaymentFilter(value: string | undefined): PaymentStatusFilter {
  if (value === "paid" || value === "pending" || value === "failed") {
    return value;
  }

  return "all";
}

function buildBookingsHref(base: string, params: Record<string, string>) {
  const url = new URL(base, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

function getPaymentStatusLabel(status: WiPayPaymentSummary["status"]) {
  switch (status) {
    case "paid":
    case "completed":
    case "success":
      return "Paid";
    case "initiated":
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    case "error":
      return "Error";
    default:
      return "Pending";
  }
}

function formatPaymentAmount(payment: WiPayPaymentSummary) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: payment.currency === "USD" ? "USD" : "TTD",
    maximumFractionDigits: 2,
  }).format(Number.parseFloat(payment.amount));
}

function getBookingStatusLabel(status: string) {
  return status === "confirmed"
    ? "Confirmed"
    : status === "reviewed"
      ? "Under Review"
      : status === "closed"
        ? "Closed"
        : "Pending";
}

export default async function AdminBookingsPage({ searchParams }: AdminBookingsPageProps) {
  const workspace = await getAdminWorkspaceData();
  const resolvedSearchParams = await searchParams;
  const selectedId = getParam(resolvedSearchParams.inquiry);
  const query = getParam(resolvedSearchParams.q).trim();
  const tab = normalizeTab(getParam(resolvedSearchParams.tab));
  const statusFilter = normalizeFilter(getParam(resolvedSearchParams.status));
  const paymentStatusFilter = normalizePaymentFilter(getParam(resolvedSearchParams.paymentStatus));
  const sort = normalizeSort(getParam(resolvedSearchParams.sort));
  const actionMessage = resolvedSearchParams.updated ? "Booking updated." : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not update this booking. Please try again.",
  );
  const paymentErrorMessage = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not update this payment. Please try again.",
  );

  const escalatedBookings = workspace.inquiries.filter((item) => ["escalated", "flagged", "needs_admin"].includes(item.status)).length;

  const paymentRows = await getWiPayPaymentsForInquiryIds(workspace.inquiries.map((item) => item.id)).catch(() => []);
  const bookingPayments: AdminBookingPaymentRecord[] = paymentRows
    .map((payment) => {
      const inquiry = workspace.inquiries.find((item) => item.id === payment.inquiry_id) ?? null;
      const listing = inquiry?.listing ?? null;

      return {
        ...payment,
        traveler_name: inquiry?.traveler_name ?? "Traveller",
        operator_name: inquiry?.operator_name ?? listing?.operator_name ?? "Operator",
        listing_title: listing?.title ?? inquiry?.destination ?? null,
        inquiry_status: inquiry?.status ?? "submitted",
      };
    })
    .filter((payment) => {
      if (paymentStatusFilter === "paid") {
        return isSuccessfulWiPayPayment(payment.status);
      }

      if (paymentStatusFilter === "pending") {
        return isPendingWiPayPayment(payment.status);
      }

      if (paymentStatusFilter === "failed") {
        return payment.status === "failed" || payment.status === "error";
      }

      return true;
    })
    .filter((payment) => {
      if (!query) {
        return true;
      }

      const haystack = [
        payment.traveler_name,
        payment.operator_name,
        payment.listing_title ?? "",
        payment.order_id,
        payment.transaction_id ?? "",
        payment.inquiry_id,
        payment.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query.toLowerCase());
    });

  const filteredBookings = workspace.inquiries
    .filter((booking) => {
      const matchesSearch =
        !query ||
        [booking.traveler_name, booking.operator_name, booking.listing?.title ?? booking.destination, booking.id, booking.notes ?? ""].some(
          (field) => field.toLowerCase().includes(query.toLowerCase()),
        );
      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      if (sort === "status") {
        return left.status.localeCompare(right.status);
      }

      if (sort === "upcoming") {
        const leftDate = left.preferred_start_date ? new Date(left.preferred_start_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDate = right.preferred_start_date ? new Date(right.preferred_start_date).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      }

      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

  const selectedInquiry = filteredBookings.find((inquiry) => inquiry.id === selectedId) ?? null;
  const selectedPayment = bookingPayments.find((payment) => payment.inquiry_id === selectedId) ?? null;

  const pendingRequests = workspace.inquiries.filter((item) => item.status === "submitted").length;
  const reviewedRequests = workspace.inquiries.filter((item) => item.status === "reviewed").length;
  const confirmedRequests = workspace.inquiries.filter((item) => item.status === "confirmed").length;
  const closedRequests = workspace.inquiries.filter((item) => item.status === "closed").length;
  const bookingPaymentCounts = {
    all: paymentRows.length,
    paid: paymentRows.filter((payment) => isSuccessfulWiPayPayment(payment.status)).length,
    pending: paymentRows.filter((payment) => isPendingWiPayPayment(payment.status)).length,
    failed: paymentRows.filter((payment) => payment.status === "failed" || payment.status === "error").length,
  };

  return (
    <PageShell variant="admin">
      <main className="portal-list-page">
        <SectionHeader
          level={1}
          eyebrow="Booking oversight"
          title="Monitor every booking request from one place."
          description="This dedicated admin surface keeps enquiry flow, booking status, and customer communication visible without mixing it into operator tools."
          action={
            <Button href="/AdminAnalytics" variant="outline">
              Analytics Hub
            </Button>
          }
        />
        {actionMessage ? (
          <div className="mt-6">
            <StatusMessage tone="success">{actionMessage}</StatusMessage>
          </div>
        ) : null}
        {resolvedSearchParams.error ? (
          <div className="mt-4">
            <StatusMessage tone="error">{tab === "payments" ? paymentErrorMessage : actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter">
          {[
            ["Requests", workspace.inquiries.length.toLocaleString(), "Total booking-related records."],
            ["Confirmed", workspace.stats.confirmedBookings.toLocaleString(), "Travellers already scheduled."],
            ["Pending", workspace.stats.pendingBookings.toLocaleString(), "Waiting for operator response."],
            ["Escalated", escalatedBookings.toLocaleString(), "Requires admin attention."],
          ].map(([label, value, note]) => (
            <GlassPanel key={label} className="p-gutter h-full">
              <div className="label-caps text-secondary mb-3">{label}</div>
              <div className="text-display-xl-mobile text-on-background">{value}</div>
              <p className="section-copy mt-2">{note}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="section-shell">
          <GlassPanel className="p-gutter tc-filter-panel">
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_repeat(2,minmax(0,0.85fr))_auto] lg:items-end" method="get">
              <input name="tab" type="hidden" value={tab} />
              <div className="grid gap-2">
                <label className="tc-filter-label">Search</label>
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search traveller, operator, listing, or enquiry id"
                  className="tc-filter-input text-sm"
                />
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">Status</label>
                <select
                  name="status"
                  defaultValue={statusFilter}
                  className="tc-filter-select text-sm"
                >
                  <option value="all">All</option>
                  <option value="submitted">Pending</option>
                  <option value="reviewed">Under Review</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">Sort</label>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="tc-filter-select text-sm"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="status">Status</option>
                  <option value="upcoming">Upcoming date</option>
                </select>
              </div>
              <Button variant="primary" type="submit" className="btn-sm tc-filter-primary">
                Apply
              </Button>
            </form>

            <div className="mt-5 tc-filter-tabs">
              {[
                ["bookings", "Bookings"],
                ["payments", "Payments"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  href={buildBookingsHref("/AdminBookings", {
                    q: query,
                    tab: value,
                    status: statusFilter,
                    paymentStatus: paymentStatusFilter,
                    sort,
                  })}
                  variant={tab === value ? "primary" : "outline"}
                  className="btn-sm tc-filter-pill"
                >
                  {label}
                </Button>
              ))}
            </div>

            {tab === "bookings" ? (
              <div className="mt-5 tc-filter-tabs">
                {[
                  ["all", `All (${workspace.inquiries.length})`],
                  ["submitted", `Pending (${pendingRequests})`],
                  ["reviewed", `Under Review (${reviewedRequests})`],
                  ["confirmed", `Confirmed (${confirmedRequests})`],
                  ["closed", `Closed (${closedRequests})`],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    href={buildBookingsHref("/AdminBookings", {
                      q: query,
                      tab,
                      status: value,
                      paymentStatus: paymentStatusFilter,
                      sort,
                    })}
                    variant={statusFilter === value ? "primary" : "outline"}
                  className={`btn-sm tc-filter-pill ${statusFilter === value ? "tc-filter-pill-active" : ""}`}
                >
                  {label}
                </Button>
                ))}
              </div>
            ) : (
              <div className="mt-5 tc-filter-tabs">
                {[
                  ["all", `All (${bookingPaymentCounts.all})`],
                  ["paid", `Paid (${bookingPaymentCounts.paid})`],
                  ["pending", `Pending (${bookingPaymentCounts.pending})`],
                  ["failed", `Failed (${bookingPaymentCounts.failed})`],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    href={buildBookingsHref("/AdminBookings", {
                      q: query,
                      tab,
                      status: statusFilter,
                      paymentStatus: value,
                      sort,
                    })}
                    variant={paymentStatusFilter === value ? "primary" : "outline"}
                  className={`btn-sm tc-filter-pill ${paymentStatusFilter === value ? "tc-filter-pill-active" : ""}`}
                >
                  {label}
                </Button>
                ))}
              </div>
            )}
          </GlassPanel>
        </section>

        <section className="section-shell grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          <div className="lg:col-span-8 flex flex-col">
            <SectionHeader
              eyebrow={tab === "bookings" ? "Booking list" : "Payment ledger"}
              title={tab === "bookings" ? "Requests and status updates." : "WiPay payments and manual actions."}
              description={
                tab === "bookings"
                  ? "Track each booking request alongside the operator, communication channel, and current state."
                  : "Track traveller payments, their current status, and manual refund or cancellation actions."
              }
            />

            <GlassPanel className="mt-6 p-0 overflow-hidden flex-1">
              {tab === "bookings" ? (
                <TableWrapper>
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Experience</th>
                    <th>Operator</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.length ? (
                    filteredBookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="align-middle">
                          <div className="min-w-[120px]">
                            <div className="font-body-md font-semibold text-on-background">{booking.traveler_name}</div>
                            <div className="text-sm text-on-surface-variant">{formatDate(booking.created_at)}</div>
                          </div>
                        </td>
                        <td className="align-middle text-sm text-on-surface-variant">
                          <div>{booking.listing?.title ?? booking.destination}</div>
                          <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">
                            {booking.preferred_start_date || booking.preferred_end_date
                              ? `${booking.preferred_start_date ?? "Flexible"} · ${booking.preferred_end_date ?? "Open"}`
                              : "Date on request"}
                          </div>
                        </td>
                        <td className="align-middle text-sm text-on-surface-variant">{booking.operator_name}</td>
                        <td className="align-middle text-sm text-on-surface-variant">{booking.channel}</td>
                        <td className="align-middle">
                          <Badge tone={booking.status === "confirmed" ? "accent" : "soft"}>
                            {getBookingStatusLabel(booking.status)}
                          </Badge>
                        </td>
                        <td className="align-middle text-center">
                          <div className="admin-action-group whitespace-nowrap">
                            <Button href={`/AdminBookings?inquiry=${booking.id}`} variant="outline" className="btn-sm">
                              Open
                            </Button>
                            <form action={updateInquiryStatusAction}>
                              <input name="inquiry_id" type="hidden" value={booking.id} />
                              <input name="return_to" type="hidden" value={`/AdminBookings?inquiry=${booking.id}`} />
                              <input name="status" type="hidden" value="reviewed" />
                              <FormSubmitButton variant="ghost" className="btn-sm" pendingLabel="Updating...">
                                Review
                              </FormSubmitButton>
                            </form>
                            <form action={updateInquiryStatusAction}>
                              <input name="inquiry_id" type="hidden" value={booking.id} />
                              <input name="return_to" type="hidden" value={`/AdminBookings?inquiry=${booking.id}`} />
                              <input name="status" type="hidden" value="confirmed" />
                              <FormSubmitButton variant="primary" className="btn-sm" pendingLabel="Confirming...">
                                Confirm
                              </FormSubmitButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="px-6 py-10 text-center">
                          <p className="font-body-md text-on-background">No bookings match your filters.</p>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            Booking requests will appear here when travellers submit enquiries.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                </TableWrapper>
              ) : (
                <TableWrapper>
                  <thead>
                    <tr>
                      <th>Traveller</th>
                      <th>Experience</th>
                      <th>Operator</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingPayments.length ? (
                      bookingPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="align-middle">
                            <div className="min-w-[140px]">
                              <div className="font-body-md font-semibold text-on-background">{payment.traveler_name}</div>
                              <div className="text-sm text-on-surface-variant">{formatDate(payment.created_at)}</div>
                            </div>
                          </td>
                          <td className="align-middle text-sm text-on-surface-variant">
                            <div>{payment.listing_title ?? "Travel payment"}</div>
                            <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">{payment.order_id}</div>
                          </td>
                          <td className="align-middle text-sm text-on-surface-variant">{payment.operator_name}</td>
                          <td className="align-middle text-sm text-on-surface-variant">{formatPaymentAmount(payment)}</td>
                          <td className="align-middle">
                            <Badge tone={isSuccessfulWiPayPayment(payment.status) ? "accent" : "soft"}>
                              {getPaymentStatusLabel(payment.status)}
                            </Badge>
                          </td>
                        <td className="align-middle text-center">
                          <div className="admin-action-group whitespace-nowrap">
                              <Button href={`/AdminBookings?inquiry=${payment.inquiry_id}&tab=payments`} variant="outline" className="btn-sm">
                                Open
                              </Button>
                              {isPendingWiPayPayment(payment.status) ? (
                                <form action={updateWiPayPaymentStatusAction}>
                                  <input name="order_id" type="hidden" value={payment.order_id} />
                                  <input name="return_to" type="hidden" value={`/AdminBookings?tab=payments&paymentStatus=${paymentStatusFilter}`} />
                                  <input name="status" type="hidden" value="cancelled" />
                                  <FormSubmitButton variant="ghost" className="btn-sm" pendingLabel="Cancelling...">
                                    Cancel
                                  </FormSubmitButton>
                                </form>
                              ) : isSuccessfulWiPayPayment(payment.status) ? (
                                <form action={updateWiPayPaymentStatusAction}>
                                  <input name="order_id" type="hidden" value={payment.order_id} />
                                  <input name="return_to" type="hidden" value={`/AdminBookings?tab=payments&paymentStatus=${paymentStatusFilter}`} />
                                  <input name="status" type="hidden" value="refunded" />
                                  <FormSubmitButton variant="primary" className="btn-sm" pendingLabel="Refunding...">
                                    Refund
                                  </FormSubmitButton>
                                </form>
                              ) : (
                                <span className="text-xs uppercase tracking-[0.18em] text-on-surface-variant/70">No action</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>
                          <div className="px-6 py-10 text-center">
                            <p className="font-body-md text-on-background">No payments match your filters.</p>
                            <p className="mt-2 text-sm text-on-surface-variant">
                              WiPay transactions will appear here as travellers checkout, cancel, or complete payments.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </TableWrapper>
              )}
            </GlassPanel>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter flex-1">
              <SectionHeader
                eyebrow={tab === "bookings" ? "Selected enquiry" : "Selected payment"}
                title={
                  tab === "bookings"
                    ? selectedInquiry
                      ? selectedInquiry.traveler_name
                      : "No inquiries yet"
                    : selectedPayment
                      ? selectedPayment.traveler_name
                      : "No payments yet"
                }
                description={
                  tab === "bookings"
                    ? selectedInquiry
                      ? selectedInquiry.notes ?? "No notes were provided."
                      : "Inquiries will appear here automatically."
                    : selectedPayment
                      ? `Payment for ${selectedPayment.listing_title ?? "this booking"} is currently ${getPaymentStatusLabel(
                          selectedPayment.status,
                        ).toLowerCase()}.`
                      : "Payments will appear here automatically."
                }
              />

              {tab === "bookings" && selectedInquiry ? (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Experience</div>
                    <div className="font-body-md text-on-background">{selectedInquiry.listing?.title ?? selectedInquiry.destination}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Channel</div>
                    <div className="font-body-md text-on-background">{selectedInquiry.channel}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Submitted</div>
                    <div className="font-body-md text-on-background">{formatDate(selectedInquiry.created_at)}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Status</div>
                    <div className="font-body-md text-on-background">{getBookingStatusLabel(selectedInquiry.status)}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Payment quote</div>
                    <div className="font-body-md text-on-background">
                      {selectedInquiry.payment_amount ?? selectedInquiry.listing?.price ?? "Not set yet"}
                    </div>
                    <form action={updateInquiryPaymentAmountAction} className="mt-3 grid gap-2">
                      <input name="inquiry_id" type="hidden" value={selectedInquiry.id} />
                      <input
                        name="return_to"
                        type="hidden"
                        value={`/AdminBookings?inquiry=${selectedInquiry.id}&tab=bookings`}
                      />
                      <input
                        name="payment_amount"
                        className="w-full rounded-xl border border-outline-variant/30 bg-background px-3 py-2 text-sm text-on-background outline-none"
                        defaultValue={selectedInquiry.payment_amount ?? selectedInquiry.listing?.price ?? ""}
                        inputMode="decimal"
                        placeholder="Enter payment amount"
                      />
                      <FormSubmitButton variant="outline" className="w-full" pendingLabel="Saving...">
                        Save payment quote
                      </FormSubmitButton>
                    </form>
                  </div>
                </div>
              ) : null}

              {tab === "bookings" && selectedInquiry ? (
                <div className="mt-6 grid gap-3">
                  {["reviewed", "confirmed", "closed"].map((status) => (
                    <form action={updateInquiryStatusAction} key={status}>
                      <input name="inquiry_id" type="hidden" value={selectedInquiry.id} />
                      <input name="return_to" type="hidden" value={`/AdminBookings?inquiry=${selectedInquiry.id}&tab=bookings`} />
                      <input name="status" type="hidden" value={status} />
                      <FormSubmitButton
                        variant={status === "confirmed" ? "primary" : "outline"}
                        className="w-full"
                        pendingLabel={status === "reviewed" ? "Marking..." : status === "confirmed" ? "Confirming..." : "Closing..."}
                      >
                        {status === "reviewed" ? "Mark Reviewed" : status === "confirmed" ? "Confirm Trip" : "Close Enquiry"}
                      </FormSubmitButton>
                    </form>
                  ))}
                </div>
              ) : tab === "payments" && selectedPayment ? (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Amount</div>
                    <div className="font-body-md text-on-background">{formatPaymentAmount(selectedPayment)}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Order</div>
                    <div className="font-body-md text-on-background">{selectedPayment.order_id}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Enquiry status</div>
                    <div className="font-body-md text-on-background">{getBookingStatusLabel(selectedPayment.inquiry_status)}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Payment status</div>
                    <div className="font-body-md text-on-background">{getPaymentStatusLabel(selectedPayment.status)}</div>
                  </div>
                  <div className="grid gap-3">
                    {selectedPayment.status === "pending" ? (
                      <form action={updateWiPayPaymentStatusAction}>
                        <input name="order_id" type="hidden" value={selectedPayment.order_id} />
                        <input
                          name="return_to"
                          type="hidden"
                          value={`/AdminBookings?inquiry=${selectedPayment.inquiry_id}&tab=payments&paymentStatus=${paymentStatusFilter}`}
                        />
                        <input name="status" type="hidden" value="cancelled" />
                        <FormSubmitButton variant="outline" className="w-full" pendingLabel="Cancelling...">
                          Cancel payment
                        </FormSubmitButton>
                      </form>
                    ) : isSuccessfulWiPayPayment(selectedPayment.status) ? (
                      <form action={updateWiPayPaymentStatusAction}>
                        <input name="order_id" type="hidden" value={selectedPayment.order_id} />
                        <input
                          name="return_to"
                          type="hidden"
                          value={`/AdminBookings?inquiry=${selectedPayment.inquiry_id}&tab=payments&paymentStatus=${paymentStatusFilter}`}
                        />
                        <input name="status" type="hidden" value="refunded" />
                        <FormSubmitButton variant="primary" className="w-full" pendingLabel="Refunding...">
                          Mark refunded
                        </FormSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Admin action</div>
              <p className="section-copy">
                Keep this page available for platform-wide oversight while operators continue managing their own enquiry inboxes.
              </p>
                <div className="mt-6 admin-action-group">
                  <Link className="btn-outline" href="/AdminDashboard">
                    Dashboard
                  </Link>
                <Button href="/AdminAnalytics" variant="primary">
                  Analytics
                </Button>
              </div>
            </GlassPanel>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
