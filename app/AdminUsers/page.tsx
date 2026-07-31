import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TableWrapper } from "@/components/ui/TableWrapper";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getAdminPageShellProps } from "@/lib/admin/page-shell-props";
import { updateTravelerCareProfileAction, updateUserAccessAction } from "./actions";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UserStatus = "active" | "suspended" | "restricted" | "under_review";
type UserSort = "newest" | "oldest" | "name" | "activity";

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function getUserStatus(person: { is_active: boolean; status_reason: string | null }) {
  if (person.is_active) {
    return "active" as const;
  }

  const reason = (person.status_reason ?? "").toLowerCase();

  if (reason.includes("under review")) {
    return "under_review" as const;
  }

  if (reason.includes("restricted")) {
    return "restricted" as const;
  }

  return "suspended" as const;
}

function getUserStatusLabel(status: UserStatus) {
  return status === "active"
    ? "Active"
    : status === "restricted"
      ? "Restricted"
      : status === "under_review"
        ? "Under Review"
        : "Suspended";
}

function normalizeRoleFilter(value: string | undefined) {
  return value === "traveler" || value === "operator" || value === "admin" ? value : "all";
}

function normalizeStatusFilter(value: string | undefined) {
  return value === "active" || value === "suspended" || value === "restricted" || value === "under_review"
    ? value
    : "all";
}

function normalizeSort(value: string | undefined): UserSort {
  return value === "oldest" || value === "name" || value === "activity" ? value : "newest";
}

function buildUsersHref(base: string, params: Record<string, string>) {
  const url = new URL(base, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const workspace = await getAdminWorkspaceData();
  const resolvedSearchParams = await searchParams;
  const selectedId = getParam(resolvedSearchParams.user);
  const query = getParam(resolvedSearchParams.q).trim();
  const roleFilter = normalizeRoleFilter(getParam(resolvedSearchParams.role));
  const statusFilter = normalizeStatusFilter(getParam(resolvedSearchParams.status));
  const sort = normalizeSort(getParam(resolvedSearchParams.sort));
  const actionMessage =
    resolvedSearchParams.updated === "care"
      ? "Guest care profile saved."
      : resolvedSearchParams.updated
        ? "User access updated."
        : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not update that user. Please try again.",
  );

  const filteredUsers = workspace.users
    .filter((user) => {
      const status = getUserStatus(user);
      const searchTerm = query.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        [user.full_name, user.email, user.role, user.status_reason ?? ""].some((field) =>
          field.toLowerCase().includes(searchTerm),
        );
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((left, right) => {
      if (sort === "name") {
        return left.full_name.localeCompare(right.full_name);
      }

      if (sort === "activity") {
        return new Date(right.last_seen_at ?? right.updated_at).getTime() - new Date(left.last_seen_at ?? left.updated_at).getTime();
      }

      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

  const selectedUser = selectedId
    ? workspace.users.find((user) => user.id === selectedId) ?? null
    : filteredUsers[0] ?? null;
  const selectedUserTours = selectedUser
    ? workspace.inquiries.filter((inquiry) => inquiry.user_id === selectedUser.id)
    : [];
  const isSelectedSelf = Boolean(selectedUser && selectedUser.id === workspace.profile.id);
  const totalUsers = workspace.stats.totalUsers;
  const activeUsers = workspace.users.filter((user) => getUserStatus(user) === "active").length;
  const suspendedUsers = workspace.users.filter((user) => getUserStatus(user) === "suspended").length;
  const restrictedUsers = workspace.users.filter((user) => getUserStatus(user) === "restricted").length;
  const underReviewUsers = workspace.users.filter((user) => getUserStatus(user) === "under_review").length;

  return (
    <PageShell {...getAdminPageShellProps(workspace.profile)}>
      <main className="portal-list-page">
        <SectionHeader
          level={1}
          eyebrow="Admin users"
          title="Control platform access across travellers and operators."
          description="Review credentials, verify operators, manage access tiers, and keep the account surface aligned with Tour ConnecTT policy."
          action={
            <Button href="/AdminSettings" variant="outline">
              Workspace Settings
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
            <StatusMessage tone="error">{actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid grid-cols-1 xl:grid-cols-5 gap-gutter">
          <GlassPanel className="p-gutter">
            <div className="label-caps text-secondary mb-3">Total users</div>
            <div className="text-display-xl-mobile text-on-background">{totalUsers.toLocaleString()}</div>
            <p className="section-copy mt-2">Across all roles and access tiers.</p>
          </GlassPanel>
          <GlassPanel className="p-gutter">
            <div className="label-caps text-secondary mb-3">Active users</div>
            <div className="text-display-xl-mobile text-on-background">{activeUsers.toLocaleString()}</div>
            <p className="section-copy mt-2">Currently able to access the platform.</p>
          </GlassPanel>
          <GlassPanel className="p-gutter">
            <div className="label-caps text-secondary mb-3">Suspended users</div>
            <div className="text-display-xl-mobile text-on-background">{suspendedUsers.toLocaleString()}</div>
            <p className="section-copy mt-2">Suspended for policy or quality issues.</p>
          </GlassPanel>
          <GlassPanel className="p-gutter">
            <div className="label-caps text-secondary mb-3">Restricted users</div>
            <div className="text-display-xl-mobile text-on-background">{restrictedUsers.toLocaleString()}</div>
            <p className="section-copy mt-2">Accounts restricted for access control.</p>
          </GlassPanel>
          <GlassPanel className="p-gutter">
            <div className="label-caps text-secondary mb-3">Under review</div>
            <div className="text-display-xl-mobile text-on-background">{underReviewUsers.toLocaleString()}</div>
            <p className="section-copy mt-2">Accounts awaiting moderation decisions.</p>
          </GlassPanel>
        </section>

        <section className="section-shell">
          <GlassPanel className="p-gutter tc-filter-panel">
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))_auto] lg:items-end" method="get">
              <div className="grid gap-2">
                <label className="tc-filter-label">Search</label>
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search by name or email"
                  className="tc-filter-input text-sm"
                />
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">Role</label>
                <select
                  name="role"
                  defaultValue={roleFilter}
                  className="tc-filter-select text-sm"
                >
                  <option value="all">All roles</option>
                  <option value="traveler">Traveller</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">Status</label>
                <select
                  name="status"
                  defaultValue={statusFilter}
                  className="tc-filter-select text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="restricted">Restricted</option>
                  <option value="under_review">Under review</option>
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
                  <option value="name">Name</option>
                  <option value="activity">Latest activity</option>
                </select>
              </div>
              <Button variant="primary" type="submit" className="px-5 py-3 min-h-0 tc-filter-primary">
                Apply
              </Button>
            </form>

            <div className="mt-5 tc-filter-tabs">
              {[
                ["all", "All"],
                ["active", "Active"],
                ["suspended", "Suspended"],
                ["restricted", "Restricted"],
                ["under_review", "Under review"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  href={buildUsersHref("/AdminUsers", {
                    q: query,
                    role: roleFilter,
                    status: value,
                    sort,
                  })}
                  variant={statusFilter === value ? "primary" : "outline"}
                  className={`px-4 py-2 min-h-0 tc-filter-pill ${statusFilter === value ? "tc-filter-pill-active" : ""}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="section-shell grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-8">
            <SectionHeader
              eyebrow="Access control"
              title="Users and operator credentials."
              description="Approve, suspend, restrict, or inspect accounts while keeping the platform's role separation clear."
            />
            <GlassPanel className="mt-6 p-0 overflow-hidden">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length ? (
                    filteredUsers.map((person) => {
                      const status = getUserStatus(person);

                      return (
                        <tr key={person.id}>
                        <td className="align-middle">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-surface-container-high">
                              {person.profile_image_url ? (
                                <Image
                                  alt={person.full_name}
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                  src={person.profile_image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-secondary">
                                  {person.full_name
                                    .split(" ")
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((part) => part[0]?.toUpperCase())
                                    .join("")}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-body-md font-semibold text-on-background">{person.full_name}</div>
                              <div className="text-sm text-on-surface-variant">{person.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="align-middle">
                          <Badge tone={person.role === "admin" ? "accent" : "soft"}>{person.role}</Badge>
                        </td>
                        <td className="align-middle text-sm text-on-surface-variant">
                          {person.role === "admin"
                            ? "Full Platform"
                            : person.role === "operator"
                              ? "Listings + Inquiries"
                              : "Traveller Profile"}
                        </td>
                        <td className="align-middle">
                          <Badge tone={status === "active" ? "accent" : "soft"}>{getUserStatusLabel(status)}</Badge>
                        </td>
                        <td className="align-middle text-center">
                          <div className="admin-action-group whitespace-nowrap">
                            <Button href={`/AdminUsers?user=${person.id}`} variant="outline" className="px-4 py-2 min-h-0">
                              Review
                            </Button>
                            {person.id === workspace.profile.id ? (
                              <span className="rounded-full border border-outline-variant/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-on-surface-variant">
                                Protected
                              </span>
                            ) : (
                              <form action={updateUserAccessAction}>
                                <input name="profile_id" type="hidden" value={person.id} />
                                <input name="return_to" type="hidden" value={`/AdminUsers?user=${person.id}`} />
                                <input name="is_active" type="hidden" value={String(!person.is_active)} />
                                <FormSubmitButton
                                  variant="ghost"
                                  className="px-4 py-2 min-h-0"
                                  pendingLabel={person.is_active ? "Suspending..." : "Restoring..."}
                                >
                                  {person.is_active ? "Suspend" : "Reactivate"}
                                </FormSubmitButton>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="px-6 py-10 text-center">
                          <p className="font-body-md text-on-background">No users match your filters.</p>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            Try clearing search or adjusting role and access filters.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="lg:col-span-4 space-y-gutter">
            <GlassPanel className="p-gutter">
              <SectionHeader
                eyebrow="Credential checks"
                title={selectedUser ? selectedUser.full_name : "No users yet"}
                description={
                  selectedUser
                    ? `${selectedUser.listing_count} listings · ${selectedUser.inquiry_count} enquiries`
                    : "User detail will appear here automatically."
                }
              />

              {selectedUser ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Email</div>
                    <div className="font-body-md text-on-background break-all">{selectedUser.email}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Role</div>
                    <div className="font-body-md text-on-background">{selectedUser.role}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Status</div>
                    <div className="font-body-md text-on-background">{getUserStatusLabel(getUserStatus(selectedUser))}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Activity</div>
                    <div className="font-body-md text-on-background">{selectedUser.inquiry_count} enquiries</div>
                  </div>
                  {selectedUser.role === "traveler" ? (
                    <>
                      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                        <div className="label-caps text-secondary mb-2">Booked tours and inquiries</div>
                        {selectedUserTours.length ? (
                          <div className="grid gap-2 text-sm text-on-background">
                            {selectedUserTours.map((inquiry) => (
                              <div key={inquiry.id}>
                                {inquiry.listing?.title ?? inquiry.destination} · {inquiry.status}
                              </div>
                            ))}
                          </div>
                        ) : <div className="font-body-md text-on-surface-variant">No tour inquiries yet.</div>}
                      </div>

                      <form action={updateTravelerCareProfileAction} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 p-4 grid gap-4">
                        <input name="profile_id" type="hidden" value={selectedUser.id} />
                        <input name="return_to" type="hidden" value={`/AdminUsers?user=${selectedUser.id}`} />
                        <div>
                          <div className="label-caps text-secondary mb-1">Guest care profile</div>
                          <p className="text-sm text-on-surface-variant">Private details collected from the traveller or by staff over the phone.</p>
                        </div>
                        <div className="admin-filter-grid--2 grid gap-3">
                          <label className="grid gap-2 text-sm">Phone number<input className="admin-filter-control" name="phone_number" defaultValue={selectedUser.care_profile?.phone_number ?? ""} /></label>
                          <label className="grid gap-2 text-sm">15-minute walk<select className="admin-filter-control" name="can_walk_15_minutes" defaultValue={selectedUser.care_profile?.can_walk_15_minutes === true ? "yes" : selectedUser.care_profile?.can_walk_15_minutes === false ? "no" : "unsure"}><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label>
                          <label className="grid gap-2 text-sm">Default pickup location<input className="admin-filter-control" name="default_pickup_location" defaultValue={selectedUser.care_profile?.default_pickup_location ?? ""} /></label>
                          <label className="grid gap-2 text-sm">Preferred pickup time<input className="admin-filter-control" name="preferred_pickup_time" defaultValue={selectedUser.care_profile?.preferred_pickup_time ?? ""} /></label>
                        </div>
                        <label className="grid gap-2 text-sm">Allergies<textarea className="admin-filter-control min-h-24" name="allergies" maxLength={1000} defaultValue={selectedUser.care_profile?.allergies ?? ""} /></label>
                        <label className="grid gap-2 text-sm">Dietary restrictions<textarea className="admin-filter-control min-h-24" name="dietary_restrictions" maxLength={1000} defaultValue={selectedUser.care_profile?.dietary_restrictions ?? ""} /></label>
                        <label className="grid gap-2 text-sm">Mobility requirements<textarea className="admin-filter-control min-h-24" name="mobility_requirements" maxLength={1000} defaultValue={selectedUser.care_profile?.mobility_requirements ?? ""} /></label>
                        <label className="grid gap-2 text-sm">Relevant medical notes<textarea className="admin-filter-control min-h-28" name="medical_notes" maxLength={2000} defaultValue={selectedUser.care_profile?.medical_notes ?? ""} /></label>
                        <FormSubmitButton variant="primary" pendingLabel="Saving care profile...">Save Guest Care Profile</FormSubmitButton>
                      </form>
                    </>
                  ) : null}
                </div>
              ) : null}

              {selectedUser ? (
                <div className="mt-6 grid gap-3">
                  {isSelectedSelf ? (
                    <p className="text-sm text-on-surface-variant">
                      Your own admin account is protected from suspension or restriction.
                    </p>
                  ) : (
                    <form action={updateUserAccessAction}>
                      <input name="profile_id" type="hidden" value={selectedUser.id} />
                      <input name="return_to" type="hidden" value={`/AdminUsers?user=${selectedUser.id}`} />
                      <input name="is_active" type="hidden" value={String(!selectedUser.is_active)} />
                      <FormSubmitButton
                        variant="outline"
                        className="w-full"
                        pendingLabel={selectedUser.is_active ? "Suspending..." : "Restoring..."}
                      >
                        {selectedUser.is_active ? "Suspend Account" : "Reactivate Account"}
                      </FormSubmitButton>
                    </form>
                  )}

                  <form action={updateUserAccessAction} className="grid gap-3">
                    <input name="profile_id" type="hidden" value={selectedUser.id} />
                    <input name="return_to" type="hidden" value={`/AdminUsers?user=${selectedUser.id}`} />
                    <label className="label-caps text-secondary">Role</label>
                    <select name="role" defaultValue={selectedUser.role} className="admin-filter-control">
                      <option value="traveler">traveller</option>
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                    </select>
                    <FormSubmitButton variant="primary" pendingLabel="Saving role...">
                      Save Role
                    </FormSubmitButton>
                  </form>

                  {isSelectedSelf ? null : (
                    <div className="admin-toggle-grid admin-filter-grid--2">
                      {[
                        ["active", "Activate"],
                        ["suspended", "Suspend"],
                        ["restricted", "Restrict"],
                        ["under_review", "Under Review"],
                      ].map(([value, label]) => (
                        <form action={updateUserAccessAction} key={value}>
                          <input name="profile_id" type="hidden" value={selectedUser.id} />
                          <input name="return_to" type="hidden" value={`/AdminUsers?user=${selectedUser.id}`} />
                          <input name="account_status" type="hidden" value={value} />
                          <FormSubmitButton
                            variant={value === "active" ? "primary" : "outline"}
                            className="w-full"
                            pendingLabel="Updating..."
                          >
                            {label}
                          </FormSubmitButton>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Platform note</div>
              <p className="section-copy">
                Keep the admin surface separate from operator tools so the platform can maintain centralized control without confusing the role experience.
              </p>
              <div className="mt-6 admin-action-group">
                <Button href="/AdminDashboard" variant="outline">
                  Dashboard
                </Button>
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
