import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function HowItWorksPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="How it works" title="A personal path from enquiry to experience." body={content.howItWorks} actionHref="/Enquiry" actionLabel="Browse experiences" />;
}
