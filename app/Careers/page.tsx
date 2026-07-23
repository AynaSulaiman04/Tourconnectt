import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function CareersPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="Careers" title="Help shape meaningful Caribbean travel." body={content.careers} actionHref="/ContactUs" actionLabel="Contact our team" />;
}
