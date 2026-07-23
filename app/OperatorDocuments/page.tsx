import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { DocumentShareButton } from "@/components/operator/DocumentShareButton";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import {
  getOperatorDocuments,
  getOperatorDocumentShares,
  getOperatorTeamProfiles,
  getOperatorWorkspaceData,
} from "@/lib/supabase/operator";
import {
  shareOperatorDocumentAction,
  updateOperatorDocumentStatusAction,
  uploadOperatorDocumentAction,
} from "./actions";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";

type OperatorDocumentsPageProps = {
  searchParams: Promise<{
    updated?: string;
    uploaded?: string;
    error?: string;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getStatusTone(status: string) {
  switch (status) {
    case "shared":
      return "tertiary";
    case "complete":
      return "";
    case "sensitive":
      return "muted";
    case "archived":
      return "muted";
    default:
      return "";
  }
}

export default async function OperatorDocumentsPage({ searchParams }: OperatorDocumentsPageProps) {
  const resolvedSearchParams = await searchParams;
  const workspace = await getOperatorWorkspaceData();
  const [documents, teamProfiles, documentShares] = await Promise.all([
    getOperatorDocuments(workspace.profile.id),
    getOperatorTeamProfiles(workspace.profile.id),
    getOperatorDocumentShares(workspace.profile.id),
  ]);
  const inquiryById = new Map(workspace.inquiries.map((inquiry) => [inquiry.id, inquiry]));

  const recentInquiries = workspace.inquiries.slice(0, 6);
  const totalDocs = documents.length;
  const pendingDocs = documents.filter((document) => document.status === "pending").length;
  const expiringSoon = documents.filter((document) => document.status === "sensitive").length;
  const sharesByDocument = new Map<string, number>();

  documentShares.forEach((share) => {
    sharesByDocument.set(share.document_id, (sharesByDocument.get(share.document_id) ?? 0) + 1);
  });

  const uploadMessage = resolvedSearchParams.uploaded ? "Document uploaded successfully." : null;
  const updateMessage = resolvedSearchParams.updated ? "Document status updated." : null;
  const errorMessage = resolvedSearchParams.error
    ? getFriendlyFeedbackMessage(resolvedSearchParams.error, "We could not update the document. Please try again.")
    : null;

  return (
    <PageShell
      travelerProfile={{
        id: workspace.profile.id,
        full_name: workspace.profile.full_name,
        profile_image_url: workspace.profile.profile_image_url,
        role: workspace.profile.role,
      }}
      variant="operator"
    >
      <style>{`
        .operator-documents {
          min-height: 100vh;
          padding: 16px 80px 120px;
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .documents-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
        }

        .eyebrow {
          margin: 0 0 10px;
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .documents-header h2,
        .section-title {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 48px;
          line-height: 56px;
          letter-spacing: -0.02em;
          font-weight: 300;
        }

        .documents-header p {
          margin: 12px 0 0;
          max-width: 700px;
          color: rgba(75, 70, 61, 0.74);
          font-size: 18px;
          line-height: 28px;
          font-weight: 300;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }

        .stat-card {
          padding: 28px;
        }

        .stat-label {
          margin: 0 0 10px;
          color: rgba(75, 70, 61, 0.72);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .stat-value {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 56px;
          line-height: 1;
          letter-spacing: -0.02em;
          font-weight: 300;
        }

        .stat-copy {
          margin: 14px 0 0;
          color: rgba(75, 70, 61, 0.72);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .document-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }

        .document-card {
          padding: 26px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .document-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .document-card-head h3 {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 28px;
          line-height: 36px;
          font-weight: 300;
        }

        .document-card-head p {
          margin: 6px 0 0;
          color: rgba(75, 70, 61, 0.72);
          font-size: 14px;
          line-height: 22px;
        }

        .document-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255, 219, 207, 0.8);
          color: var(--secondary);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
          white-space: nowrap;
          text-decoration: none;
        }

        .document-chip.alt {
          background: rgba(243, 225, 186, 0.5);
          color: var(--tertiary);
        }

        .upload-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .upload-form .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .upload-form label {
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .upload-form input,
        .upload-form select,
        .upload-form textarea {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid rgba(206, 197, 185, 0.35);
          padding: 8px 0;
          color: var(--on-background);
          outline: none;
        }

        .upload-form textarea {
          min-height: 88px;
          resize: vertical;
        }

        .upload-form input[type="file"] {
          border-bottom: 0;
          padding: 0;
        }

        .upload-form .full-width {
          grid-column: 1 / -1;
        }

        .upload-form .actions {
          display: flex;
          align-items: center;
          gap: 12px;
          grid-column: 1 / -1;
          flex-wrap: wrap;
        }

        .upload-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .upload-item {
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(206, 197, 185, 0.18);
          background: rgba(255, 255, 255, 0.44);
        }

        .upload-item strong {
          display: block;
          margin-bottom: 6px;
          color: var(--on-background);
          font-size: 14px;
          line-height: 22px;
        }

        .upload-item p {
          margin: 0;
          color: rgba(75, 70, 61, 0.72);
          font-size: 13px;
          line-height: 20px;
        }

        .table-card {
          overflow: hidden;
          padding: 0;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        th,
        td {
          padding: 22px 26px;
          border-bottom: 1px solid rgba(206, 197, 185, 0.12);
          vertical-align: top;
        }

        th {
          color: rgba(75, 70, 61, 0.66);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-pill {
          display: inline-flex;
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(255, 135, 92, 0.12);
          color: var(--secondary);
          font-size: 10px;
          line-height: 14px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .status-pill.muted {
          background: rgba(235, 231, 231, 0.8);
          color: var(--on-surface-variant);
        }

        .status-pill.tertiary {
          background: rgba(243, 225, 186, 0.5);
          color: var(--tertiary);
        }

        .table-caption {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }

        .table-caption h3 {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 30px;
          line-height: 38px;
          font-weight: 300;
        }

        .table-caption p {
          margin: 8px 0 0;
          color: rgba(75, 70, 61, 0.72);
          font-size: 14px;
          line-height: 22px;
        }

        .row-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .document-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          color: var(--secondary);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.1em;
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: none;
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

        @media (max-width: 1100px) {
          .operator-documents {
            padding: 40px 24px 96px;
          }

          .documents-header,
          .table-caption {
            flex-direction: column;
            align-items: flex-start;
          }

          .stats-grid,
          .document-grid,
          .upload-list,
          .upload-form {
            grid-template-columns: 1fr;
          }

          .table-card {
            overflow-x: auto;
          }
        }
      `}</style>

      <main className="operator-documents">
        <header className="documents-header">
          <div>
            <p className="eyebrow">Document management</p>
            <h2>Customer Files</h2>
            <p>Store and review guest documents in a luxury, file-vault layout that matches the rest of the operator portal.</p>
          </div>
          <div className="document-chip">
            <span className="material-symbols-outlined">folder_open</span>
            Secure archive
          </div>
        </header>

        {uploadMessage ? (
          <StatusMessage tone="success">{uploadMessage}</StatusMessage>
        ) : null}
        {updateMessage ? (
          <StatusMessage tone="success">{updateMessage}</StatusMessage>
        ) : null}
        {errorMessage ? (
          <StatusMessage tone="error">{errorMessage}</StatusMessage>
        ) : null}

        <section className="stats-grid">
          <div className="glass-panel stat-card">
            <p className="stat-label">Files uploaded</p>
            <p className="stat-value">{totalDocs}</p>
            <p className="stat-copy">Guest documents and trip assets currently available.</p>
          </div>
          <div className="glass-panel stat-card">
            <p className="stat-label">Pending review</p>
            <p className="stat-value" style={{ color: "var(--secondary)" }}>{String(pendingDocs).padStart(2, "0")}</p>
            <p className="stat-copy">New waivers and ID scans waiting for manual confirmation.</p>
          </div>
          <div className="glass-panel stat-card">
            <p className="stat-label">Expiring soon</p>
            <p className="stat-value" style={{ color: "var(--tertiary)" }}>{String(expiringSoon).padStart(2, "0")}</p>
            <p className="stat-copy">Documents marked sensitive or requiring follow-up.</p>
          </div>
        </section>

        <section className="document-grid">
          <div className="glass-panel document-card">
            <div className="document-card-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>Vault lanes</p>
                <h3>Upload Queue</h3>
                <p>Guest documents, operator notes, and shared itinerary assets.</p>
              </div>
              <span className="material-symbols-outlined" style={{ color: "var(--secondary)" }}>cloud_upload</span>
            </div>

            <form className="upload-form" action={uploadOperatorDocumentAction}>
              <input name="return_to" type="hidden" value="/OperatorDocuments" />
              <div className="field">
                <label htmlFor="guest_name">Guest Name</label>
                <input id="guest_name" name="guest_name" placeholder="Traveler or guest name" required type="text" />
              </div>
              <div className="field">
                <label htmlFor="document_type">Document Type</label>
                <input id="document_type" name="document_type" placeholder="Waiver, ID, itinerary" required type="text" />
              </div>
              <div className="field full-width">
                <label htmlFor="inquiry_id">Linked Inquiry</label>
                <select id="inquiry_id" name="inquiry_id" defaultValue="">
                  <option value="">No linked inquiry</option>
                  {recentInquiries.map((inquiry) => (
                    <option key={inquiry.id} value={inquiry.id}>
                      {inquiry.traveler_name} - {inquiry.destination}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full-width">
                <label htmlFor="document_file">Document File</label>
                <input
                  id="document_file"
                  name="document_file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  type="file"
                />
              </div>
              <div className="field full-width">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" placeholder="Optional handling notes or file context." />
              </div>
              <div className="actions">
                <FormSubmitButton className="btn-primary btn-sm" pendingLabel="Uploading...">
                  Upload Document
                </FormSubmitButton>
                <Link className="document-chip alt" href="/OperatorMessages">
                  Request missing file
                </Link>
              </div>
            </form>
          </div>

          <div className="glass-panel document-card">
            <div className="document-card-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>Quick controls</p>
                <h3>Vault Actions</h3>
                <p>Review, share, archive, or request additional customer files.</p>
              </div>
              <span className="material-symbols-outlined" style={{ color: "var(--tertiary)" }}>draw</span>
            </div>

            <div className="upload-list">
              <div className="upload-item">
                <strong>Request missing file</strong>
                <p>Send a follow-up prompt to the traveler or guest concierge.</p>
              </div>
              <div className="upload-item">
                <strong>Archive complete</strong>
                <p>Move closed trip files into the seasonal archive safely.</p>
              </div>
              <div className="upload-item">
                <strong>Share with team</strong>
                <p>Provide access to supporting operator staff and reservations.</p>
              </div>
              <div className="upload-item">
                <strong>Mark sensitive</strong>
                <p>Flag private documents for restricted handling.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel table-card">
          <div className="table-caption" style={{ padding: "26px 26px 0" }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Recent activity</p>
              <h3>File History</h3>
              <p>Track the latest document updates and guest record changes.</p>
            </div>
            <span className="document-chip alt">
              <span className="material-symbols-outlined">history</span>
              Live log
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>File</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length ? (
                documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.guest_name}</td>
                    <td>
                      <div>{doc.document_type}</div>
                      {doc.inquiry_id || doc.booking_id ? (
                        <p className="text-[12px] leading-5 text-on-surface-variant mt-2">
                          Booking: {inquiryById.get(doc.inquiry_id ?? doc.booking_id ?? "")?.traveler_name ?? "Linked inquiry"}
                        </p>
                      ) : null}
                      <a className="document-link" href={doc.file_url} target="_blank" rel="noreferrer">
                        {doc.file_name}
                        <span className="material-symbols-outlined">open_in_new</span>
                      </a>
                    </td>
                    <td>
                      <span className={`status-pill ${getStatusTone(doc.status)}`}>
                        {doc.status}
                      </span>
                      {doc.notes ? <p className="text-[12px] leading-5 text-on-surface-variant mt-2">{doc.notes}</p> : null}
                    </td>
                    <td>{formatDateTime(doc.updated_at)}</td>
                    <td>
                      <div className="row-actions">
                        <form action={updateOperatorDocumentStatusAction}>
                          <input name="return_to" type="hidden" value="/OperatorDocuments" />
                          <input name="document_id" type="hidden" value={doc.id} />
                          <input
                            name="status"
                            type="hidden"
                            value={
                              doc.status === "pending"
                                ? "shared"
                                : doc.status === "shared"
                                  ? "archived"
                                  : doc.status === "archived"
                                    ? "pending"
                                    : "archived"
                            }
                          />
                          <FormSubmitButton className="btn-outline btn-sm" pendingLabel="Updating...">
                            <span className="material-symbols-outlined">sync</span>
                            {doc.status === "pending" ? "Mark shared" : doc.status === "archived" ? "Restore" : "Archive"}
                          </FormSubmitButton>
                        </form>
                        <form action={shareOperatorDocumentAction} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <input name="return_to" type="hidden" value="/OperatorDocuments" />
                          <input name="document_id" type="hidden" value={doc.id} />
                          <select
                            defaultValue={teamProfiles[0]?.id ?? ""}
                            name="shared_with_profile_id"
                            style={{
                              borderRadius: "999px",
                              border: "1px solid rgba(206, 197, 185, 0.2)",
                              background: "rgba(255, 255, 255, 0.5)",
                              padding: "8px 10px",
                              color: "var(--on-background)",
                            }}
                          >
                            <option value="">Share with team</option>
                            {teamProfiles.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.full_name}
                              </option>
                            ))}
                          </select>
                          <input name="access_level" type="hidden" value="viewer" />
                          <FormSubmitButton className="btn-outline btn-sm" pendingLabel="Sharing...">
                            <span className="material-symbols-outlined">share</span>
                            Grant access
                          </FormSubmitButton>
                        </form>
                        <DocumentShareButton className="mt-2" documentId={doc.id} documentName={doc.file_name} />
                      </div>
                      <p className="text-[12px] leading-5 text-on-surface-variant mt-2">
                        Shared with {sharesByDocument.get(doc.id) ?? 0} team member{(sharesByDocument.get(doc.id) ?? 0) === 1 ? "" : "s"}
                      </p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "40px 26px" }}>
                    <StatusMessage tone="empty" title="No documents yet">
                      No operator documents have been uploaded yet. Add a file from the upload queue to begin the archive.
                    </StatusMessage>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </PageShell>
  );
}
