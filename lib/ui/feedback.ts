import { toBritishUserCopy } from "@/lib/copy/british-english";

const MESSAGE_MAP: Record<string, string> = {
  "missing-inquiry": "We could not find that enquiry. Please go back and try again.",
  "invalid-status": "That status is not available for this item.",
  "missing-file": "Please choose a document before uploading.",
  "invalid-file-type": "That file type is not supported here.",
  "file-too-large": "That file is too large. Please choose a smaller file.",
  "missing-details": "Please add the guest name and document type before uploading.",
  "documents-unavailable": "We could not access document storage. Please check the operator-documents bucket setup.",
  "invalid-inquiry": "That enquiry could not be linked. Please refresh and try again.",
  "missing-document": "We could not find that document.",
  "missing-share-target": "Choose who you want to share the document with.",
  "invalid-share-level": "That share level is not available.",
  "invalid-share-target": "We could not find that team member.",
  "missing-campaign-data": "Please fill in the partner name, source, and campaign fields.",
  "missing-campaign": "We could not find that campaign.",
  "missing-profile": "We could not find that user.",
  "cannot-demote-self": "You cannot remove your own admin access from this screen.",
  "missing-changes": "Please change at least one setting before saving.",
  "missing-user": "We could not find that user.",
  "self-suspend": "You cannot suspend your own operator session.",
  "missing-listing": "We could not find that listing.",
  "admin-profile-save-failed": "We could not save the admin profile. Please try again.",
  "admin-settings-save-failed": "We could not save the admin settings. Please try again.",
  "home-settings-save-failed": "We could not save the home page settings. Please try again.",
  "invalid-home-settings": "Please check the home page fields and try again.",
};

export function getFriendlyFeedbackMessage(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (MESSAGE_MAP[trimmed]) {
    return MESSAGE_MAP[trimmed];
  }

  if (
    trimmed.includes("schema cache") ||
    trimmed.includes("relation") ||
    trimmed.includes("does not exist") ||
    trimmed.includes("Could not find the table") ||
    trimmed.includes("Could not find the relation")
  ) {
    return fallback;
  }

  return toBritishUserCopy(trimmed);
}
