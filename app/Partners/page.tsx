import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function PartnersPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="Our partners" title="Built with Caribbean experience at the centre." body={content.partners} actionHref="/ContactUs" actionLabel="Become a partner" />;
}
