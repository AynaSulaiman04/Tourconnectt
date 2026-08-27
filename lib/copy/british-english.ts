export const BRITISH_COPY = {
  enquiry: "Enquiry",
  enquiries: "Enquiries",
  traveller: "Traveller",
  travellers: "Travellers",
  enquiryRoute: "/Enquiry",
} as const;

export function toBritishUserCopy(value: string) {
  return value
    .replace(/\bInquiries\b/g, "Enquiries")
    .replace(/\bInquiry\b/g, "Enquiry")
    .replace(/\binquiries\b/g, "enquiries")
    .replace(/\binquiry\b/g, "enquiry")
    .replace(/\bTravelers\b/g, "Travellers")
    .replace(/\bTraveler\b/g, "Traveller")
    .replace(/\btravelers\b/g, "travellers")
    .replace(/\btraveler\b/g, "traveller")
    .replace(/\bpersonalized\b/g, "personalised")
    .replace(/\bpersonalize\b/g, "personalise")
    .replace(/\borganize\b/g, "organise")
    .replace(/\borganized\b/g, "organised")
    .replace(/\brecognize\b/g, "recognise")
    .replace(/\brecognized\b/g, "recognised")
    .replace(/\bfavorite\b/g, "favourite")
    .replace(/\bfavorites\b/g, "favourites")
    .replace(/\bcustomize\b/g, "customise")
    .replace(/\bcustomized\b/g, "customised")
    .replace(/\bcanceled\b/g, "cancelled")
    .replace(/\bcanceling\b/g, "cancelling")
    .replace(/\bcatalog\b/g, "catalogue")
    .replace(/\binquire\b/g, "enquire")
    .replace(/\bInquire\b/g, "Enquire")
    .replace(/\bbehavior\b/g, "behaviour")
    .replace(/\bBehavior\b/g, "Behaviour")
    .replace(/\bHelp center\b/g, "Help centre")
    .replace(/\bhelp center\b/g, "help centre")
    .replace(/\bat the center\b/g, "at the centre")
    .replace(/\bCenter\b/g, "Centre")
    .replace(/\bcenter\b/g, "centre");
}
