/**
 * Shown in the content column while an admin page's data resolves.
 *
 * Because this sits inside the admin layout, the sidebar stays on screen and
 * interactive throughout: only this region swaps. Navigation therefore feels
 * immediate even when the page behind it is still querying.
 */
export default function AdminLoading() {
  return (
    <div className="admin-skeleton" role="status" aria-label="Loading">
      <div className="admin-skeleton-head">
        <span className="admin-skel admin-skel-eyebrow" />
        <span className="admin-skel admin-skel-title" />
      </div>

      <div className="admin-skeleton-tiles">
        {[0, 1, 2, 3].map((i) => (
          <span className="admin-skel admin-skel-tile" key={i} />
        ))}
      </div>

      <span className="admin-skel admin-skel-panel" />
      <span className="admin-skel admin-skel-panel admin-skel-panel-short" />
    </div>
  );
}
