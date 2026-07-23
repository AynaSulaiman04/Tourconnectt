export default function Loading() {
  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop py-10 flex items-center justify-center">
      <style>{`
        .tt-loading-orbit {
          width: 5.5rem;
          height: 5.5rem;
          margin: 0;
          border-radius: 999px;
          border: 1px solid rgba(197, 22, 29, 0.18);
          background:
            radial-gradient(circle at 50% 50%, rgba(180, 122, 22, 0.08), rgba(255, 253, 251, 0.94) 66%),
            linear-gradient(180deg, rgba(17, 19, 24, 0.02), rgba(17, 19, 24, 0.05));
          display: grid;
          place-items: center;
          color: var(--secondary);
          animation: tt-spin 1.6s linear infinite;
          box-shadow:
            inset 0 0 0 10px rgba(255, 253, 251, 0.3),
            0 18px 36px rgba(53, 39, 33, 0.08);
        }

        .tt-loading-globe {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 999px;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .tt-loading-globe::before,
        .tt-loading-globe::after {
          content: "";
          position: absolute;
          inset: 0.6rem;
          border-radius: 999px;
          border: 1px solid rgba(180, 122, 22, 0.18);
        }

        .tt-loading-globe::after {
          inset: 1.2rem;
          border-color: rgba(197, 22, 29, 0.14);
        }

        .tt-loading-plane {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.65rem;
          height: 2.65rem;
          border-radius: 999px;
          background: rgba(255, 253, 251, 0.92);
          box-shadow: 0 8px 18px rgba(53, 39, 33, 0.08);
          transform-origin: center;
        }

        .tt-loading-plane .material-symbols-outlined {
          font-size: 1.7rem;
          color: var(--secondary);
        }

        .tt-loading-orbit:hover .tt-loading-plane {
          animation: tt-plane 1.6s ease-in-out infinite;
        }

        .tt-loading-label {
          margin: 0;
          color: var(--secondary);
          font-size: 0.72rem;
          line-height: 1.4;
          letter-spacing: 0.22em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .tt-loading-title {
          margin: 0.85rem 0 0;
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.2rem);
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .tt-loading-copy {
          margin: 0.9rem auto 0;
          max-width: 30rem;
          color: var(--on-surface-variant);
          font-size: 0.98rem;
          line-height: 1.65;
        }

        @keyframes tt-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes tt-plane {
          0%,
          100% {
            transform: translateY(0) rotate(-6deg);
          }
          50% {
            transform: translateY(-2px) rotate(6deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tt-loading-orbit {
            animation: none;
          }

          .tt-loading-orbit:hover .tt-loading-plane {
            animation: none;
          }
        }
      `}</style>

      <div role="status" aria-live="polite" aria-busy="true">
        <div className="tt-loading-orbit" aria-hidden="true">
          <div className="tt-loading-globe">
            <span className="tt-loading-plane">
              <span className="material-symbols-outlined">flight</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
