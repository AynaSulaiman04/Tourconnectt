import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function AboutUsPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="About us" title="Local knowledge, thoughtfully connected." body={content.aboutUs} />;
}
