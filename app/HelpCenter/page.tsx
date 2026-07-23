import { InformationPage } from "@/components/marketing/InformationPage";
import { getSiteContent } from "@/lib/site-content";

export default async function HelpCenterPage() {
  const content = await getSiteContent();
  return <InformationPage eyebrow="Help center" title="Support for every step of your journey." body={content.helpCenter} actionHref="/ContactUs" actionLabel="Contact support" />;
}
