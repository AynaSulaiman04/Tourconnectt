import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { getOperatorCustomerDirectory, requireOperatorProfile } from "@/lib/supabase/operator";
import { formatDate, formatDateTime } from "@/lib/format/date";

type OperatorUserManagePageProps = {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    page?: string;
    updated?: string;
    error?: string;
  }>;
};

type DirectoryRole = "all" | "traveler" | "operator" | "admin";
type DirectoryStatus = "all" | "active" | "suspended" | "recent";

type OperatorCustomer = Awaited<ReturnType<typeof getOperatorCustomerDirectory>>[number];

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2);
}

function normalizeRole(value?: string): DirectoryRole {
  if (value === "traveler" || value === "operator" || value === "admin") {
    return value;
  }

  return "all";
}

function normalizeStatus(value?: string): DirectoryStatus {
  if (value === "active" || value === "suspended" || value === "recent") {
    return value;
  }

  return "all";
}

function relativeStatus(profile: {
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  status_reason: string | null;
}) {
  if (!profile.is_active) {
    return profile.status_reason ?? "Suspended";
  }

  const lastSeenSource = profile.last_seen_at ?? profile.created_at;
  const lastSeen = new Date(lastSeenSource).getTime();
  const diffMs = Date.now() - lastSeen;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return "Active now";
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
}

function formatPresenceDetail(profile: {
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  status_reason: string | null;
}) {
  if (!profile.is_active) {
    return `Suspended: ${profile.status_reason ?? "Account disabled"}`;
  }

  if (profile.last_seen_at) {
    return `Last seen ${formatDateTime(profile.last_seen_at)}`;
  }

  return `Created ${formatDate(profile.created_at)}`;
}

function buildHref(params: { q?: string; role?: DirectoryRole; status?: DirectoryStatus; page?: number }) {
  const query = new URLSearchParams();

  if (params.q) {
    query.set("q", params.q);
  }

  if (params.role && params.role !== "all") {
    query.set("role", params.role);
  }

  if (params.status && params.status !== "all") {
    query.set("status", params.status);
  }

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  const qs = query.toString();

  return qs ? `/OperatorUserManage?${qs}` : "/OperatorUserManage";
}

export default async function ManagementDirectoryPage({ searchParams }: OperatorUserManagePageProps) {
  const resolvedSearchParams = await searchParams;
  const operatorProfile = await requireOperatorProfile();
  let customers: OperatorCustomer[] = [];
  let loadError: string | null = null;

  try {
    customers = await getOperatorCustomerDirectory(operatorProfile);
  } catch (error) {
    console.error("Unable to load operator customer directory", {
      operatorId: operatorProfile.id,
      error,
    });
    loadError = "We couldn't load this customer directory right now. Please try again.";
  }

  const query = resolvedSearchParams.q?.trim().toLowerCase() ?? "";
  const role = normalizeRole(resolvedSearchParams.role);
  const status = normalizeStatus(resolvedSearchParams.status);
  const currentPage = Math.max(1, Number.parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  const filteredProfiles = customers.filter((profile) => {
    const matchesQuery =
      !query ||
      [
        profile.full_name,
        profile.email,
        profile.latest_listing_title ?? "",
        profile.latest_listing_location ?? "",
        profile.latest_inquiry_status,
        profile.latest_message_preview ?? "",
        profile.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesRole = role === "all" || profile.role === role;

    const matchesStatus =
      status === "all" ||
      (status === "active" && profile.is_active) ||
      (status === "suspended" && !profile.is_active) ||
      (status === "recent" && profile.is_active && Boolean(profile.last_seen_at));

    return matchesQuery && matchesRole && matchesStatus;
  });

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visibleProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize);

  const totalUsers = customers.length;
  const activeUsers = customers.filter((profile) => profile.is_active && Boolean(profile.latest_conversation_id)).length;
  const prevHref = page > 1 ? buildHref({ q: query, role, status, page: page - 1 }) : null;
  const nextHref = page < totalPages ? buildHref({ q: query, role, status, page: page + 1 }) : null;
  const hasNoCustomers = !loadError && customers.length === 0;
  const hasNoResults = !loadError && customers.length > 0 && visibleProfiles.length === 0;

  return (
    <PageShell variant="operator">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--outline-variant); border-radius: 2px; }
        .main {
          margin-left: 0;
          min-height: 100vh;
          padding-bottom: 160px;
        }

        .page-header {
          padding: 64px 80px 48px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 32px;
        }

        .page-header h1 {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 64px;
          line-height: 60px;
          letter-spacing: -0.03em;
          font-weight: 200;
          color: var(--on-background);
        }

        .page-header p {
          margin: 8px 0 0;
          max-width: 576px;
          color: var(--on-surface-variant);
          font-size: 18px;
          line-height: 28px;
          font-weight: 300;
        }

        .search-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          max-width: 100%;
          box-sizing: border-box;
          padding: 0.9rem 1rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.5rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }
        .search-wrap .material-symbols-outlined {
          color: var(--secondary);
        }
        .search-wrap input {
          flex: 1 1 auto;
          min-width: 0;
          width: 256px;
          min-height: 2.95rem;
          background: rgba(255, 253, 248, 0.94);
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1rem;
          padding: 0.82rem 1rem;
          outline: none;
          color: var(--on-background);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .search-wrap input::placeholder { color: var(--outline-variant); }
        .search-wrap input:focus {
          border-color: rgba(197, 22, 29, 0.35);
          box-shadow: 0 0 0 3px rgba(197, 22, 29, 0.12);
        }
        .search-submit {
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .filters-section {
          padding: 0 80px;
          margin-bottom: 48px;
        }

        .filters-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          padding: 16px 18px;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.75rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }

        .filter-pill {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 20px;
          border-radius: 999px;
          border: 1px solid rgba(197, 22, 29, 0.28);
          background: rgba(255, 253, 248, 0.92);
        }

        .filter-pill .tc-filter-label {
          color: var(--secondary);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .filter-pill select {
          min-width: 0;
          background: transparent;
          border: 0;
          padding: 0;
          color: var(--secondary);
          outline: none;
          cursor: pointer;
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .filter-pill select:focus-visible {
          outline: 2px solid rgba(197, 22, 29, 0.35);
          outline-offset: 4px;
        }

        .spacer { flex: 1; }
        .mini-stats { display: flex; gap: 32px; text-align: right; }
        .mini-stat p { margin: 0; }
        .mini-stat p:first-child {
          color: var(--outline);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .mini-stat p:last-child {
          font-family: 'Raleway', sans-serif;
          font-size: 32px;
          line-height: 40px;
          letter-spacing: -0.01em;
          font-weight: 300;
          color: var(--on-background);
        }
        .mini-stat.active p:last-child { color: var(--secondary); }
        .vertical-divider {
          width: 1px;
          height: 40px;
          background: rgba(206, 197, 185, 0.3);
          align-self: center;
        }

        .table-wrap { padding: 0 80px; }
        .table-card {
          overflow: hidden;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        thead tr { border-bottom: 1px solid rgba(206, 197, 185, 0.2); }
        th {
          padding: 24px 32px;
          color: var(--on-surface-variant);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        th:last-child { text-align: right; }
        tbody tr {
          border-bottom: 1px solid rgba(206, 197, 185, 0.1);
          transition: background 0.2s ease;
        }
        tbody tr:hover { background: rgba(246, 243, 242, 0.5); }
        tbody tr.suspended {
          opacity: 0.7;
          background: rgba(220, 217, 217, 0.2);
        }
        td { padding: 24px 32px; }

        .identity-cell {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(206, 197, 185, 0.3);
          flex-shrink: 0;
          background: var(--surface-container-low);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: grayscale(100%);
          transition: filter 0.7s ease;
        }
        tbody tr:hover .avatar img { filter: grayscale(0); }
        tbody tr.suspended:hover .avatar img { filter: grayscale(100%); }
        .avatar span {
          color: var(--secondary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.15em;
        }
        .person-name {
          margin: 0;
          color: var(--on-background);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .person-email {
          margin: 0;
          color: rgba(75, 70, 61, 0.7);
          font-size: 12px;
          line-height: 18px;
        }

        .role-badge {
          display: inline-flex;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 10px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }
        .role-traveler { border: 1px solid var(--secondary); color: var(--secondary); }
        .role-operator { border: 1px solid var(--tertiary); color: var(--tertiary); }
        .role-muted { border: 1px solid var(--outline); color: var(--outline); }

        .presence-main {
          margin: 0;
          color: var(--on-surface);
          font-size: 14px;
          line-height: 22px;
        }
        .presence-sub {
          margin: 0;
          color: rgba(75, 70, 61, 0.6);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }
        .presence-sub.error { color: var(--error); }

        .operations {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 32px;
        }
        .toggle-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-label {
          color: var(--on-surface-variant);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }
        .toggle-label.error { color: var(--error); }
        .toggle {
          width: 40px;
          height: 20px;
          border: 0;
          border-radius: 999px;
          position: relative;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .toggle.on { background: var(--secondary); }
        .toggle.off { background: var(--outline-variant); }
        .toggle-knob {
          position: absolute;
          top: 4px;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 999px;
        }
        .toggle.on .toggle-knob { right: 4px; }
        .toggle.off .toggle-knob { left: 4px; }
        .table-footer {
          padding: 24px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(206, 197, 185, 0.1);
        }
        .table-footer p {
          margin: 0;
          color: rgba(75, 70, 61, 0.6);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .pager {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .pager button {
          border: 0;
          background: transparent;
          color: var(--on-surface-variant);
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .pager button:disabled {
          color: rgba(75, 70, 61, 0.4);
          cursor: not-allowed;
        }
        .pager button:not(:disabled):hover { color: var(--secondary); }
        .pager span {
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }

        .footer {
          margin-left: 0;
          padding: 160px 80px;
          background: var(--surface-container-lowest);
          border-top: 1px solid rgba(206, 197, 185, 0.1);
        }
        .footer-inner {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .footer-brand { display: flex; flex-direction: column; gap: 8px; }
        .footer-logo {
          font-family: 'Raleway', sans-serif;
          font-size: 32px;
          line-height: 40px;
          letter-spacing: -0.01em;
          font-weight: 300;
          color: var(--primary);
          text-transform: lowercase;
        }
        .footer-brand p {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }
        .footer nav { display: flex; gap: 32px; flex-wrap: wrap; }
        .footer a {
          color: rgba(75, 70, 61, 0.6);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
          transition: all 0.2s ease;
        }
        .footer a:hover {
          color: var(--on-surface);
          text-decoration: underline;
          text-decoration-color: var(--outline-variant);
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

        @media (min-width: 768px) {
          .footer-inner { flex-direction: row; }
        }

        @media (max-width: 1100px) {
          .main { padding-bottom: 80px; }
          .page-header,
          .filters-section,
          .table-wrap,
          .footer {
            padding-left: 24px;
            padding-right: 24px;
          }
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .search-wrap { width: min(100%, 36rem); }
          .table-card { overflow-x: auto; }
          table { min-width: 920px; }
          .mini-stats { width: 100%; justify-content: flex-start; text-align: left; }
        }

        @media (max-width: 640px) {
          .main {
            padding-bottom: 64px;
          }

          .page-header,
          .filters-section,
          .table-wrap,
          .footer {
            padding-left: 16px;
            padding-right: 16px;
          }

          .page-header {
            gap: 24px;
            padding-top: 32px;
            padding-bottom: 24px;
          }

          .page-header h1 {
            font-size: 40px;
            line-height: 44px;
          }

          .page-header p {
            font-size: 15px;
            line-height: 24px;
          }

          .search-wrap {
            width: 100%;
            gap: 0.5rem;
            padding: 0.75rem;
          }

          .search-wrap > .material-symbols-outlined {
            display: none;
          }

          .search-wrap input {
            width: auto;
            padding-inline: 0.75rem;
            letter-spacing: 0.08em;
          }

          .filters-section {
            margin-bottom: 24px;
          }

          .filters-row {
            gap: 12px;
            padding: 12px;
            border-radius: 20px;
          }

          .filter-pill {
            width: 100%;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
          }

          .filter-pill select {
            width: 100%;
          }

          .filters-row > button {
            width: 100%;
          }

          .spacer {
            display: none;
          }

          .mini-stats {
            width: 100%;
            justify-content: space-between;
            gap: 16px;
          }

          .mini-stat p:last-child {
            font-size: 28px;
            line-height: 36px;
          }

          .directory-page .table-card {
            overflow: visible;
            background: transparent;
            border-radius: 0;
            box-shadow: none;
          }

          .directory-page table,
          .directory-page tbody {
            display: block;
            min-width: 0;
            width: 100%;
          }

          .directory-page thead {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }

          .directory-page tbody {
            display: grid;
            gap: 16px;
          }

          .directory-page tbody tr {
            display: block;
            overflow: hidden;
            border: 1px solid rgba(206, 197, 185, 0.25);
            border-radius: 20px;
            background: rgba(255, 253, 248, 0.92);
            box-shadow: 0 12px 32px rgba(53, 39, 33, 0.06);
          }

          .directory-page td {
            display: block;
            width: 100%;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(206, 197, 185, 0.14);
          }

          .directory-page td:last-child {
            border-bottom: 0;
          }

          .directory-page td[data-label]::before {
            content: attr(data-label);
            display: block;
            margin-bottom: 8px;
            color: var(--outline);
            font-size: 10px;
            line-height: 16px;
            letter-spacing: 0.15em;
            font-weight: 700;
            text-transform: uppercase;
          }

          .identity-cell {
            align-items: flex-start;
          }

          .identity-cell > div:last-child {
            min-width: 0;
          }

          .person-email,
          .presence-sub {
            overflow-wrap: anywhere;
          }

          .operations {
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 8px;
          }

          .operations .btn-outline {
            flex: 1 1 100%;
            justify-content: center;
          }

          .table-footer {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            margin-top: 16px;
            padding: 16px;
            border: 1px solid rgba(206, 197, 185, 0.2);
            border-radius: 20px;
            background: rgba(255, 253, 248, 0.92);
          }

          .pager {
            width: 100%;
            justify-content: space-between;
            gap: 16px;
          }
        }
      `}</style>

      <div className="directory-page">
        <div aria-hidden="true" className="grain-overlay" />
        <main className="main">
          <header className="page-header">
            <div>
              <h1>Customers</h1>
              <p>Travellers who have already interacted with this operator through enquiries, messages, or bookings.</p>
            </div>
            <form className="search-wrap tc-filter-panel" method="get">
              <span aria-hidden="true" className="material-symbols-outlined">search</span>
              <label className="sr-only" htmlFor="operator-customer-search">Search customer directory</label>
              <input
                aria-label="Search customer directory"
                defaultValue={query}
                id="operator-customer-search"
                name="q"
                placeholder="SEARCH DIRECTORY"
                type="search"
              />
              <input name="role" type="hidden" value={role} />
              <input name="status" type="hidden" value={status} />
              <input name="page" type="hidden" value="1" />
              <button className="btn-primary btn-sm search-submit" type="submit">
                Search
              </button>
            </form>
          </header>

          <section className="filters-section">
            <form className="filters-row tc-filter-tabs" method="get">
              <div className="filter-pill glass-panel tc-filter-pill">
                <label className="tc-filter-label" htmlFor="customer-role-filter">Scope</label>
                <select id="customer-role-filter" name="role" defaultValue={role}>
                  <option value="all">ALL CUSTOMERS</option>
                  <option value="traveler">TRAVELLERS</option>
                  <option value="operator">OPERATORS</option>
                  <option value="admin">ADMINS</option>
                </select>
              </div>

              <div className="filter-pill glass-panel tc-filter-pill">
                <label className="tc-filter-label" htmlFor="customer-status-filter">Status</label>
                <select id="customer-status-filter" name="status" defaultValue={status}>
                  <option value="all">ANY STATUS</option>
                  <option value="active">ACTIVE</option>
                  <option value="suspended">SUSPENDED</option>
                  <option value="recent">RECENT</option>
                </select>
              </div>

              <input name="q" type="hidden" value={query} />
              <input name="page" type="hidden" value="1" />

              <button className="label-caps tc-filter-pill tc-filter-pill-active" type="submit">
                Apply Filters
              </button>

              <div className="spacer" />

              <div className="mini-stats">
                <div className="mini-stat">
                  <p>TOTAL CUSTOMERS</p>
                  <p>{totalUsers}</p>
                </div>
                <div className="vertical-divider" />
                <div className="mini-stat active">
                  <p>ACTIVE THREADS</p>
                  <p>{activeUsers}</p>
                </div>
              </div>
            </form>
          </section>

          <div className="table-wrap">
            <div className="table-card glass-panel custom-scrollbar">
              <table>
                <thead>
                  <tr>
                    <th>IDENTIFICATION</th>
                    <th>DESIGNATION</th>
                    <th>PRESENCE</th>
                    <th>OPERATIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadError ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="notice error" role="alert">{loadError}</div>
                      </td>
                    </tr>
                  ) : hasNoCustomers ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="notice">
                          Customers will appear here when travelers submit inquiries or bookings.
                        </div>
                      </td>
                    </tr>
                  ) : hasNoResults ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="notice">No customers match the current filters.</div>
                      </td>
                    </tr>
                  ) : (
                    visibleProfiles.map((profile: OperatorCustomer) => (
                      <tr key={profile.id} className={!profile.is_active ? "suspended" : ""}>
                        <td data-label="Identification">
                          <div className="identity-cell">
                            <div className="avatar relative">
                              {profile.profile_image_url ? (
                                <Image
                                  fill
                                  alt={profile.full_name}
                                  className="object-cover"
                                  sizes="48px"
                                  src={profile.profile_image_url}
                                />
                              ) : (
                                <span>{getInitials(profile.full_name)}</span>
                              )}
                            </div>
                            <div>
                              <p className="person-name">{profile.full_name}</p>
                              <p className="person-email">{profile.email}</p>
                              <p className="person-email">
                                {profile.latest_listing_title
                                  ? `Latest inquiry: ${profile.latest_listing_title}`
                                  : profile.latest_conversation_id
                                    ? `Latest conversation: ${profile.latest_listing_location ?? "Direct request"}`
                                    : `Direct request: ${profile.latest_listing_location ?? "Direct request"}`}
                              </p>
                              {profile.latest_message_preview ? (
                                <p className="person-email">
                                  Latest message: {profile.latest_message_preview}
                                </p>
                              ) : null}
                              {profile.care_profile ? (
                                <details className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container-low/70 p-3 text-sm">
                                  <summary className="cursor-pointer font-semibold text-secondary">Guest care details</summary>
                                  <div className="mt-3 grid gap-2 text-on-surface-variant">
                                    <p><strong>Phone:</strong> {profile.care_profile.phone_number || profile.traveler_phone || "Not provided"}</p>
                                    <p><strong>Pickup:</strong> {[profile.care_profile.default_pickup_location, profile.care_profile.preferred_pickup_time].filter(Boolean).join(" ? ") || "Not provided"}</p>
                                    <p><strong>15-minute walk:</strong> {profile.care_profile.can_walk_15_minutes === true ? "Yes" : profile.care_profile.can_walk_15_minutes === false ? "No" : "Unsure"}</p>
                                    <p><strong>Allergies:</strong> {profile.care_profile.allergies || "None provided"}</p>
                                    <p><strong>Dietary restrictions:</strong> {profile.care_profile.dietary_restrictions || "None provided"}</p>
                                    <p><strong>Mobility requirements:</strong> {profile.care_profile.mobility_requirements || "None provided"}</p>
                                    <p><strong>Relevant medical notes:</strong> {profile.care_profile.medical_notes || "None provided"}</p>
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td data-label="Designation">
                          <span
                            className={`role-badge ${
                              profile.role === "traveler"
                                ? "role-traveler"
                                : profile.role === "operator"
                                  ? "role-operator"
                                  : "role-muted"
                            }`}
                          >
                            {profile.role === "traveler"
                              ? "Elite Traveller"
                              : profile.role === "operator"
                                ? "Certified Operator"
                                : "Administrator"}
                          </span>
                          <p className="presence-sub" style={{ marginTop: 8 }}>
                            {profile.latest_inquiry_status ? profile.latest_inquiry_status.toUpperCase() : "DIRECT CHAT"} ?{" "}
                            {profile.inquiry_count} {profile.inquiry_count === 1 ? "enquiry" : "enquiries"}
                          </p>
                          <p className="presence-sub" style={{ marginTop: 6 }}>
                            {profile.confirmed_booking_count} confirmed booking
                            {profile.confirmed_booking_count === 1 ? "" : "s"}
                          </p>
                        </td>
                        <td data-label="Presence">
                          <p className="presence-main">{profile.is_active ? relativeStatus(profile) : "Suspended"}</p>
                          <p className={`presence-sub ${!profile.is_active ? "error" : ""}`}>
                            {formatPresenceDetail(profile)}
                            {profile.preferred_start_date ? ` ? Preferred ${formatDate(profile.preferred_start_date)}` : ""}
                          </p>
                          <p className="presence-sub" style={{ marginTop: 6 }}>
                            Last activity {formatDateTime(profile.latest_activity_at)}
                          </p>
                        </td>
                        <td data-label="Operations">
                          <div className="operations">
                            {profile.latest_inquiry_id ? (
                              <Link className="btn-outline btn-sm" href={`/ConfirmationPage?inquiryId=${profile.latest_inquiry_id}`}>
                                <span aria-hidden="true" className="material-symbols-outlined">description</span>
                                Open enquiry
                              </Link>
                            ) : null}
                            {profile.latest_conversation_id ? (
                              <Link className="btn-outline btn-sm" href={`/OperatorMessages?conversation=${profile.latest_conversation_id}`}>
                                <span aria-hidden="true" className="material-symbols-outlined">forum</span>
                                Open Messages
                              </Link>
                            ) : null}
                            {profile.confirmed_booking_count > 0 ? (
                              <Link
                                className="btn-outline btn-sm"
                                href={`/OperatorBookings?q=${encodeURIComponent(profile.latest_listing_title ?? profile.full_name)}`}
                              >
                                <span aria-hidden="true" className="material-symbols-outlined">book_online</span>
                                Booking Details
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <footer className="table-footer">
                <p>
                  SHOWING {loadError ? 0 : visibleProfiles.length} OF {loadError ? 0 : filteredProfiles.length} CUSTOMERS
                </p>
                <div className="pager">
                  {prevHref ? (
                    <Link href={prevHref} className="btn-icon" aria-label="Previous page">
                      <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                    </Link>
                  ) : (
                    <button type="button" disabled className="btn-icon" aria-label="Previous page">
                      <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                    </button>
                  )}
                  <span>PAGE {String(page).padStart(2, "0")}</span>
                  {nextHref ? (
                    <Link href={nextHref} className="btn-icon" aria-label="Next page">
                      <span aria-hidden="true" className="material-symbols-outlined">chevron_right</span>
                    </Link>
                  ) : (
                    <button type="button" disabled className="btn-icon" aria-label="Next page">
                      <span aria-hidden="true" className="material-symbols-outlined">chevron_right</span>
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </div>
        </main>
      </div>
    </PageShell>
  );
}



