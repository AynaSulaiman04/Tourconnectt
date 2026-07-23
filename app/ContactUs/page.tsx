import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function ContactUsPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="Contact us" title="We are here to help." body={`${content.contactUs}\n\nEmail: ${content.contactEmail}`} actionHref="/ConciergeChat" actionLabel="Open concierge" />;
}
