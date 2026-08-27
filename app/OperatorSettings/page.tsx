import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { getOperatorSettings, requireOperatorProfile } from "@/lib/supabase/operator";
import { buildOperatorIcalFeedUrl } from "@/lib/calendar/ical";
import { getGoogleCalendarConfigStatus, getOperatorCalendarIntegration } from "@/lib/calendar/google";
import { revokeOperatorSessionAction, updateOperatorSettingsAction } from "./actions";
import { CalendarFeedCopyButton } from "@/components/operator/CalendarFeedCopyButton";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";
import { formatDate, formatDateTime } from "@/lib/format/date";

type OperatorSettingsPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    calendar?: string;
    calendar_error?: string;
  }>;
};

export default async function OperatorSettingsPage({ searchParams }: OperatorSettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const profile = await requireOperatorProfile();
  const settings = await getOperatorSettings(profile.id);
  const calendarIntegration = await getOperatorCalendarIntegration(profile.id);
  const googleCalendarConfig = getGoogleCalendarConfigStatus();
  const calendarFeedUrl = buildOperatorIcalFeedUrl(profile.id);
  const savedMessage = resolvedSearchParams.saved ? "Operator settings saved." : null;
  const errorMessage = resolvedSearchParams.error
    ? getFriendlyFeedbackMessage(resolvedSearchParams.error, "We could not save operator settings. Please try again.")
    : null;
  const calendarMessage = resolvedSearchParams.calendar === "connected" ? "Google Calendar connected." : null;
  const calendarErrorMessage = resolvedSearchParams.calendar_error
    ? getFriendlyFeedbackMessage(resolvedSearchParams.calendar_error, "Google Calendar is not configured yet.")
    : null;

  const operatorPreferences = [
    { label: "Response cadence", value: settings.response_cadence },
    { label: "Booking workflow", value: settings.booking_workflow },
    { label: "Customer records", value: settings.customer_records },
    { label: "Communication mode", value: settings.communication_mode },
  ];
  const notificationPreferences = [
    {
      name: "inquiry_received_enabled",
      label: "Enquiry received",
      enabled: settings.inquiry_received_enabled,
    },
    {
      name: "booking_approved_enabled",
      label: "Booking approved",
      enabled: settings.booking_approved_enabled,
    },
    {
      name: "guest_message_enabled",
      label: "Guest message",
      enabled: settings.guest_message_enabled,
    },
    {
      name: "customer_note_enabled",
      label: "Customer note",
      enabled: settings.customer_note_enabled,
    },
  ];

  const operatorSessions = [
    {
      device: "Operator workspace",
      location: profile.email,
      status: profile.is_active ? "Active now" : "Suspended",
      note: profile.last_seen_at ? `Last seen ${formatDateTime(profile.last_seen_at)}` : "No tracked activity yet",
    },
    {
      device: "Account created",
      location: formatDate(profile.created_at),
      status: "Profile record",
      note: "Current operator profile linked to Supabase auth.",
    },
    {
      device: "Settings saved",
      location: formatDateTime(settings.updated_at),
      status: "Latest update",
      note: "Last change to workflow controls and inbox routing.",
    },
  ];

  return (
    <PageShell variant="operator">
      <main className="portal-list-page">
        {savedMessage ? (
          <StatusMessage tone="success" className="mb-6">
            {savedMessage}
          </StatusMessage>
        ) : null}
        {errorMessage ? (
          <StatusMessage tone="error" className="mb-6">
            {errorMessage}
          </StatusMessage>
        ) : null}
        {calendarMessage ? (
          <StatusMessage tone="success" className="mb-6">
            {calendarMessage}
          </StatusMessage>
        ) : null}
        {calendarErrorMessage ? (
          <StatusMessage tone="warning" className="mb-6">
            {calendarErrorMessage}
          </StatusMessage>
        ) : null}
        <style>{`
          .operator-settings-form select,
        .operator-settings-form input[type="text"] {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid rgba(206, 197, 185, 0.35);
          padding: 8px 0;
          color: var(--on-background);
          outline: none;
        }

        .operator-settings-form input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--secondary);
        }

        .notice {
          padding: 14px 18px;
          border-radius: 16px;
          border: 1px solid rgba(206, 197, 185, 0.2);
          background: rgba(255, 255, 255, 0.5);
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
        }

        .notice.success {
          border-color: rgba(160, 64, 27, 0.2);
          color: var(--secondary);
        }

        .notice.error {
          border-color: rgba(186, 26, 26, 0.2);
          color: var(--error);
        }

          .operator-settings-form select:focus,
          .operator-settings-form input[type="text"]:focus {
            border-bottom-color: var(--secondary);
          }

          .operator-settings-form select:focus-visible,
          .operator-notification-toggle:focus-visible {
            outline: 2px solid var(--secondary);
            outline-offset: 3px;
          }

          .operator-settings-form label {
            display: block;
            margin-bottom: 8px;
            font-size: 10px;
            line-height: 16px;
            letter-spacing: 0.15em;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--secondary);
          }
        `}</style>
        <div className="section-shell">
          <div className="flex flex-col gap-3">
            <p className="label-caps text-secondary">Operator settings</p>
            <h1 className="font-display text-[48px] leading-14 tracking-[-0.02em] font-light text-on-background">
              Configure the operator workspace.
            </h1>
            <p className="max-w-[720px] text-[18px] leading-7 font-light text-on-surface-variant">
              Manage operator identity, customer communication preferences, enquiry handling, and availability routing without touching traveller or admin settings.
            </p>
          </div>
        </div>

        <section className="section-shell grid min-w-0 grid-cols-1 gap-gutter lg:grid-cols-12">
          <div className="min-w-0 space-y-gutter lg:col-span-7">
            <GlassCardProfile profile={profile} />
            <form action={updateOperatorSettingsAction} className="mt-gutter">
              <input name="return_to" type="hidden" value="/OperatorSettings" />
              <WorkflowCard
                notificationPreferences={notificationPreferences}
                preferences={operatorPreferences}
              />
            </form>
          </div>

          <div className="min-w-0 space-y-gutter lg:col-span-5">
            <GlassPanel className="min-w-0 overflow-hidden p-gutter">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>Security</p>
                  <h3 className="font-display text-[30px] leading-9 font-light text-on-background">
                    Operator access and sessions
                  </h3>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Review authenticated activity and account state for the operator workspace.
                  </p>
                </div>
                <span className="material-symbols-outlined text-secondary">security</span>
              </div>

              <div className="mt-6 space-y-4">
                {operatorSessions.map((session) => (
                  <div key={`${session.device}-${session.location}`} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <div className="font-body-md text-on-background">{session.device}</div>
                        <div className="break-all text-sm text-on-surface-variant">{session.location}</div>
                        <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70 mt-2">
                          {session.note}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                        <div className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-secondary">
                          {session.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>Calendar sync</p>
                  <h3 className="font-display text-[30px] leading-9 font-light text-on-background">
                    Google Calendar and iCal
                  </h3>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Connect Google Calendar for trip syncing and copy a secure iCal feed for external calendars.
                  </p>
                </div>
                <span className="material-symbols-outlined text-secondary">calendar_month</span>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                  <div className="label-caps text-secondary mb-1">Google Calendar</div>
                  <div className="font-body-md text-on-background">
                    {calendarIntegration ? "Connected" : "Not connected"}
                  </div>
                  <div className="text-sm text-on-surface-variant mt-2">
                    {calendarIntegration
                      ? `Calendar ID: ${calendarIntegration.calendar_id || "primary"}`
                      : "Connect once to create and update booking events automatically."}
                  </div>
                  {!googleCalendarConfig.configured ? (
                    <div className="mt-3 rounded-2xl border border-outline-variant/20 bg-background/60 px-4 py-3 text-sm text-on-surface-variant">
                      {googleCalendarConfig.message}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {googleCalendarConfig.configured ? (
                      <a className="btn-outline" href="/api/google/calendar/connect">
                        Connect Google Calendar
                      </a>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-outline-variant/20 px-4 py-2 text-sm text-on-surface-variant">
                        Google Calendar setup required
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                  <div className="label-caps text-secondary mb-1">iCal feed</div>
                  <div className="font-body-md text-on-background">Secure booking feed</div>
                  <div className="text-sm text-on-surface-variant mt-2">
                    Copy the feed link into an external calendar app to subscribe to confirmed operator bookings.
                  </div>
                  <div className="mt-4">
                    <CalendarFeedCopyButton feedUrl={calendarFeedUrl} />
                  </div>
                </div>
              </div>
            </GlassPanel>

            <form action={revokeOperatorSessionAction}>
              <GlassPanel className="p-gutter">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 6 }}>Session control</p>
                    <h3 className="font-display text-[30px] leading-9 font-light text-on-background">
                      Revoke current session
                    </h3>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Sign out the current browser session without changing any stored operator settings.
                    </p>
                  </div>
                  <Button variant="outline" type="submit">
                    Revoke Session
                  </Button>
                </div>
              </GlassPanel>
            </form>
          </div>
        </section>
      </main>
    </PageShell>
  );
}

function GlassCardProfile({ profile }: { profile: Awaited<ReturnType<typeof requireOperatorProfile>> }) {
  return (
    <div className="glass-panel min-w-0 overflow-hidden p-gutter">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Operator identity</div>
          <h3 className="font-display text-[30px] leading-9 font-light text-on-background">
            Operator profile
          </h3>
          <p className="mt-2 text-sm text-on-surface-variant">
            This identity appears inside the operator workspace and customer coordination tools.
          </p>
        </div>
        <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-outline-variant/30 bg-surface-container-low">
          {profile.profile_image_url ? (
            <Image fill alt={profile.full_name} className="object-cover" sizes="96px" src={profile.profile_image_url} />
          ) : (
            <span className="font-display text-2xl tracking-[-0.04em] text-secondary">
              {profile.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="label-caps text-secondary mb-1">Name</div>
          <div className="font-body-md text-on-background">{profile.full_name}</div>
        </div>
        <div>
          <div className="label-caps text-secondary mb-1">Email</div>
          <div className="break-all font-body-md text-on-background">{profile.email}</div>
        </div>
        <div>
          <div className="label-caps text-secondary mb-1">Status</div>
          <div className="font-body-md text-on-background">{profile.is_active ? "Active" : "Suspended"}</div>
        </div>
        <div>
          <div className="label-caps text-secondary mb-1">Last seen</div>
          <div className="font-body-md text-on-background">
            {profile.last_seen_at ? formatDateTime(profile.last_seen_at) : "No recent activity"}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({
  notificationPreferences,
  preferences,
}: {
  notificationPreferences: { name: string; label: string; enabled: boolean }[];
  preferences: { label: string; value: string }[];
}) {
  return (
    <div className="glass-panel p-gutter">
      <div className="eyebrow" style={{ marginBottom: 6 }}>Workflow policy</div>
      <h3 className="font-display text-[30px] leading-9 font-light text-on-background">
        Control enquiry and booking behaviour.
      </h3>
      <p className="mt-2 text-sm text-on-surface-variant">
        Keep the operator workspace responsive, premium, and easy to hand off between concierge staff.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 operator-settings-form">
        {preferences.map((item) => {
          const fieldName = settingsKeyForLabel(item.label);
          const fieldId = `operator-${fieldName}`;

          return (
            <div key={item.label} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
              <label htmlFor={fieldId}>{item.label}</label>
              <select id={fieldId} name={fieldName} defaultValue={item.value} required>
                {optionsForLabel(item.label).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <fieldset className="mt-6">
        <legend className="label-caps text-secondary">Notification routing</legend>
        <p className="mt-2 text-sm text-on-surface-variant">
          Choose which operator workspace events create inbox alerts.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {notificationPreferences.map((item) => {
            const fieldId = `operator-${item.name}`;

            return (
              <label
                key={item.name}
                htmlFor={fieldId}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4"
              >
                <span className="font-body-md text-on-background">{item.label}</span>
                <input
                  className="operator-notification-toggle h-[18px] w-[18px] shrink-0 accent-secondary"
                  defaultChecked={item.enabled}
                  id={fieldId}
                  name={item.name}
                  type="checkbox"
                  value="true"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" type="submit">
          Save Operator Settings
        </Button>
      </div>
    </div>
  );
}

function settingsKeyForLabel(label: string) {
  switch (label) {
    case "Response cadence":
      return "response_cadence";
    case "Booking workflow":
      return "booking_workflow";
    case "Customer records":
      return "customer_records";
    case "Communication mode":
    default:
      return "communication_mode";
  }
}

function optionsForLabel(label: string) {
  switch (label) {
    case "Response cadence":
      return [
        { value: "fast_turnaround", label: "Fast turnaround" },
        { value: "same_day", label: "Same day" },
        { value: "daily", label: "Daily" },
      ];
    case "Booking workflow":
      return [
        { value: "inquiry_first", label: "Enquiry first" },
        { value: "review_then_confirm", label: "Review then confirm" },
        { value: "manual_hold", label: "Manual hold" },
      ];
    case "Customer records":
      return [
        { value: "documented", label: "Documented" },
        { value: "concierge_notes", label: "Concierge notes" },
        { value: "shared_vault", label: "Shared vault" },
      ];
    case "Communication mode":
    default:
      return [
        { value: "email", label: "Email" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "email_whatsapp", label: "Email + WhatsApp" },
      ];
  }
}
