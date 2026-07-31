import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getAdminPageShellProps } from "@/lib/admin/page-shell-props";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getLandingSlideshowImages } from "@/lib/supabase/analytics";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";
import { formatDateTime } from "@/lib/format/date";
import { getWiPayConfigStatus } from "@/lib/payments/wipay";
import { LandingSlideshowUploadForm } from "@/components/admin/LandingSlideshowUploadForm";
import {
  deleteLandingSlideshowImageAction,
  signOutAdminAction,
  toggleAdminWorkspaceAlertAction,
  updateAdminProfileAction,
  updateAdminWorkspaceSettingsAction,
} from "./actions";

type AdminSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
  const [workspace, slideshowImages] = await Promise.all([
    getAdminWorkspaceData(),
    getLandingSlideshowImages(),
  ]);
  const resolvedSearchParams = await searchParams;
  const statusMessage = resolvedSearchParams.saved ? "Admin settings saved." : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not save the admin settings. Please try again.",
  );
  const settings = workspace.settings;
  const enabledAlertCount = [
    settings.criticalApprovalsEnabled,
    settings.listingRejectsEnabled,
    settings.bookingEscalationsEnabled,
    settings.systemAlertsEnabled,
  ].filter(Boolean).length;
  const workspaceStatusMessage =
    enabledAlertCount > 0
      ? `${enabledAlertCount} of 4 admin alert routes are currently active, and session monitoring remains enabled.`
      : "All admin alert routes are currently paused, while session monitoring remains enabled.";
  const wipayStatus = getWiPayConfigStatus();
  const adminSessions = [
    { device: "Current browser", location: workspace.profile.email, status: "Active now" },
    {
      device: "Last update",
      location: workspace.profile.updated_at ? formatDateTime(workspace.profile.updated_at) : "Unknown",
      status: "Profile record",
    },
  ];

  return (
    <PageShell {...getAdminPageShellProps(workspace.profile)}>
      <main className="portal-list-page">
        <style>{`
          .admin-settings-toggle:focus-visible {
            outline: 2px solid var(--secondary);
            outline-offset: 4px;
          }
        `}</style>
        <SectionHeader
          level={1}
          eyebrow="Admin settings"
          title="Configure the administrator workspace."
          description="Manage identity, access, moderation rules, and alert routing from one clean admin control surface."
          action={
            <div className="flex flex-wrap gap-3">
              <Button href="/AdminContent" variant="outline" className="gap-2">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  home
                </span>
                Home & content
              </Button>
              <form action={signOutAdminAction}>
                <Button variant="outline" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          }
        />
        {statusMessage ? (
          <div className="mt-6">
            <StatusMessage tone="success">{statusMessage}</StatusMessage>
          </div>
        ) : null}
        {resolvedSearchParams.error ? (
          <div className="mt-4">
            <StatusMessage tone="error">{actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
          <div className="xl:col-span-5 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-3">Administrator identity</div>

              <div className="flex items-start gap-5">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant/30 bg-surface-container-low">
                  {workspace.profile.profile_image_url ? (
                    <Image
                      alt=""
                      className="h-full w-full object-cover"
                      fill
                      sizes="80px"
                      src={workspace.profile.profile_image_url}
                    />
                  ) : (
                    <span className="font-display text-2xl tracking-[-0.04em] text-secondary">
                      {workspace.profile.full_name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("") || "TT"}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-on-background">
                    Administrator profile
                  </h2>
                  <p className="section-copy mt-2">
                    This identity appears inside internal reviews.
                  </p>

                  <form action={updateAdminProfileAction} className="mt-5 grid gap-3">
                    <div>
                      <label className="label-caps text-secondary mb-1 block" htmlFor="admin-full-name">
                        Name
                      </label>
                      <input
                        autoComplete="name"
                        className="tc-filter-input"
                        defaultValue={workspace.profile.full_name}
                        id="admin-full-name"
                        name="full_name"
                        required
                        type="text"
                      />
                    </div>
                    <div>
                      <div className="label-caps text-secondary mb-1">Email</div>
                      <div className="font-body-md text-on-background break-all">{workspace.profile.email}</div>
                    </div>
                    <Button variant="primary" type="submit">
                      Save Identity
                    </Button>
                  </form>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-3">Moderation policy</div>

              <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-on-background">
                Approval behavior
              </h2>
              <p className="section-copy mt-2">
                Keep reviews strict, consistent, and easy to audit.
              </p>

              <form action={updateAdminWorkspaceSettingsAction} className="mt-6 grid gap-4 tc-filter-panel">
                <div className="tc-filter-grid tc-filter-grid--2">
                  <label className="tc-filter-field rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="tc-filter-label">Approval intensity</div>
                    <select name="approval_intensity" defaultValue={settings.approvalIntensity} className="tc-filter-select">
                      <option value="strict">Strict</option>
                      <option value="balanced">Balanced</option>
                      <option value="fast">Fast</option>
                    </select>
                  </label>
                  <label className="tc-filter-field rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="tc-filter-label">Notification mode</div>
                    <select name="notification_mode" defaultValue={settings.notificationMode} className="tc-filter-select">
                      <option value="realtime">Realtime</option>
                      <option value="digest">Digest</option>
                    </select>
                  </label>
                  <label className="tc-filter-field rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="tc-filter-label">Moderation window</div>
                    <input
                      className="tc-filter-input"
                      defaultValue={settings.moderationWindowHours}
                      min={1}
                      max={168}
                      name="moderation_window_hours"
                      required
                      type="number"
                    />
                  </label>
                  <label className="tc-filter-field rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="tc-filter-label">Default visibility</div>
                    <select name="default_visibility" defaultValue={settings.defaultVisibility} className="tc-filter-select">
                      <option value="private_until_approved">Private until approved</option>
                      <option value="manual">Manual review</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                </div>

                <div className="admin-toggle-grid tc-filter-grid tc-filter-grid--2">
                  {[
                    ["critical_approvals_enabled", "Critical approvals", settings.criticalApprovalsEnabled],
                    ["listing_rejects_enabled", "Listing rejects", settings.listingRejectsEnabled],
                    ["booking_escalations_enabled", "Booking escalations", settings.bookingEscalationsEnabled],
                    ["system_alerts_enabled", "System alerts", settings.systemAlertsEnabled],
                  ].map(([key, label, enabled]) => (
                    <label
                      key={String(key)}
                      className="admin-toggle-card"
                    >
                      <span className="font-body-md text-on-background">{label}</span>
                      <input
                        className="admin-settings-toggle"
                        defaultChecked={Boolean(enabled)}
                        name={String(key)}
                        type="checkbox"
                        value="true"
                        aria-label={String(label)}
                      />
                    </label>
                  ))}
                </div>

                <div className="tc-filter-actions">
                  <Button href="/AdminListings" variant="outline" className="tc-filter-pill">
                    Review Listings
                  </Button>
                  <Button type="submit" variant="primary" className="tc-filter-primary">
                    Save Policy &amp; Alerts
                  </Button>
                </div>
              </form>
            </GlassPanel>
          </div>

          <div className="xl:col-span-7">
            <GlassPanel className="px-gutter py-5 md:py-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
                <div>
                  <div className="label-caps text-secondary mb-3">Security</div>
                  <h2 className="font-display text-[30px] leading-[1.05] tracking-[-0.04em] text-on-background">
                    Admin access
                  </h2>
                  <p className="section-copy mt-2">
                    Review authenticated devices and session visibility.
                  </p>

                  <div className="mt-4 grid gap-3">
                    {adminSessions.map((session) => (
                      <div
                        key={`${session.device}-${session.location}`}
                        className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-body-md text-on-background">{session.device}</div>
                            <div className="text-sm text-on-surface-variant">{session.location}</div>
                          </div>
                          <Badge tone="soft">{session.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>

                <div>
                  <div className="label-caps text-secondary mb-3">Notification routing</div>
                  <h2 className="font-display text-[30px] leading-[1.05] tracking-[-0.04em] text-on-background">
                    Admin inbox
                  </h2>
                  <p className="section-copy mt-2">
                    Route platform alerts without touching traveller settings.
                  </p>

                  <div className="mt-4 grid gap-3">
                    {[
                      ["Critical approvals", settings.criticalApprovalsEnabled],
                      ["Listing rejects", settings.listingRejectsEnabled],
                      ["Booking escalations", settings.bookingEscalationsEnabled],
                      ["System alerts", settings.systemAlertsEnabled],
                    ].map(([item, enabled]) => (
                      <div
                        key={String(item)}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                      >
                        <div className="font-body-md text-on-background">{item}</div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge tone={enabled ? "accent" : "soft"}>
                            {enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <form action={toggleAdminWorkspaceAlertAction}>
                            <input
                              name="setting_name"
                              type="hidden"
                              value={
                                item === "Critical approvals"
                                  ? "critical_approvals_enabled"
                                  : item === "Listing rejects"
                                    ? "listing_rejects_enabled"
                                    : item === "Booking escalations"
                                      ? "booking_escalations_enabled"
                                      : "system_alerts_enabled"
                              }
                            />
                            <input name="next_value" type="hidden" value={enabled ? "false" : "true"} />
                            <Button
                              aria-label={`${enabled ? "Disable" : "Enable"} ${String(item).toLowerCase()} alerts`}
                              type="submit"
                              variant={enabled ? "outline" : "primary"}
                            >
                              {enabled ? "Turn off" : "Turn on"}
                            </Button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 admin-action-group">
                    <Button href="/AdminAnalytics" variant="outline">
                      View Platform Analytics
                    </Button>
                  </div>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="mt-8 p-gutter">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
                <div>
                  <div className="label-caps text-secondary mb-2">Workspace status</div>
                  <p className="section-copy">
                    {workspaceStatusMessage}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 md:justify-end">
                  <Button variant="outline" href="/AdminDashboard">
                    Back to Dashboard
                  </Button>
                  <Button variant="primary" href="/AdminUsers">
                    Manage Users
                  </Button>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="mt-8 p-gutter">
              <div id="landing-slideshow">
              <div className="label-caps text-secondary mb-2">Landing slideshow</div>
              <h2 className="font-display text-[30px] leading-[1.05] tracking-[-0.04em] text-on-background">
                Upload destination images for the landing page
              </h2>
              <p className="section-copy mt-2">
                Add new images here to populate the auto-rotating showcase beneath the hero section.
              </p>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {slideshowImages.length ? (
                    slideshowImages.map((image) => (
                      <article
                        key={image.path}
                        className="overflow-hidden rounded-[24px] border border-outline-variant/20 bg-surface-container-low/70"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container-low">
                          <Image
                            alt={image.name}
                            className="h-full w-full object-cover"
                            fill
                            loading="lazy"
                            sizes="(min-width: 1280px) 20vw, (min-width: 640px) 40vw, 100vw"
                            src={image.publicUrl}
                          />
                        </div>
                        <div className="grid gap-3 px-4 py-4">
                          <div className="min-w-0">
                            <div className="label-caps text-secondary mb-1">Current slide</div>
                            <p className="truncate text-sm text-on-background">{image.name}</p>
                            <p className="text-xs text-on-surface-variant">
                              {image.createdAt ? formatDateTime(image.createdAt) : "Uploaded recently"}
                            </p>
                          </div>
                          <form action={deleteLandingSlideshowImageAction}>
                            <input name="image_path" type="hidden" value={image.path} />
                            <Button className="w-full justify-center" type="submit" variant="danger">
                              Remove image
                            </Button>
                          </form>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-outline-variant/25 bg-surface-container-low/40 px-5 py-6 text-sm text-on-surface-variant sm:col-span-2 xl:col-span-3">
                      No slideshow images have been uploaded yet.
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-5">
                <LandingSlideshowUploadForm />
              </div>
              </div>
            </GlassPanel>

            <GlassPanel className="mt-8 p-gutter">
              <div className="label-caps text-secondary mb-2">Payments</div>
              <h2 className="font-display text-[30px] leading-[1.05] tracking-[-0.04em] text-on-background">
                WiPay checkout status
              </h2>
              <p className="section-copy mt-2">
                Payment credentials are managed through deployment environment variables. This panel shows whether checkout is ready for travellers.
              </p>
              <div className="mt-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-body-md text-on-background">
                      {wipayStatus.configured ? "WiPay is configured" : "WiPay is not configured"}
                    </div>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      {wipayStatus.configured
                        ? `Environment: ${wipayStatus.environment} · Currency: ${wipayStatus.currency} · Country: ${wipayStatus.countryCode}`
                        : wipayStatus.message}
                    </p>
                  </div>
                  <Badge tone={wipayStatus.configured ? "accent" : "soft"}>
                    {wipayStatus.configured ? "Live ready" : "Action required"}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button href="/AdminBookings?tab=payments" variant="outline">
                  Review payments
                </Button>
                <Button href="/AdminContent" variant="ghost">
                  Adjust home page
                </Button>
              </div>
            </GlassPanel>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
