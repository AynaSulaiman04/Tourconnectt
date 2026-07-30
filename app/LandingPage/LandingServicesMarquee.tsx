import { LANDING_SERVICE_MARQUEE_ITEMS } from "@/lib/landing-services-marquee";

const marqueeTrack = [...LANDING_SERVICE_MARQUEE_ITEMS, ...LANDING_SERVICE_MARQUEE_ITEMS];

export function LandingServicesMarquee() {
  return (
    <section aria-label="Tour ConnecTT platform services" className="lp-marquee">
      <div className="lp-marquee-edge lp-marquee-edge-start" aria-hidden="true" />
      <div className="lp-marquee-viewport">
        <div className="lp-marquee-track">
          {marqueeTrack.map((item, index) => (
            <div className="lp-marquee-item" key={`${item.label}-${index}`}>
              <span className="material-symbols-outlined lp-marquee-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="lp-marquee-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="lp-marquee-edge lp-marquee-edge-end" aria-hidden="true" />
    </section>
  );
}
