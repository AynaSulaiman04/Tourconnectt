"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireOperatorProfile } from "@/lib/supabase/operator";
import { recordPlatformEvent } from "@/lib/supabase/analytics";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const OPERATOR_DOCUMENTS_BUCKET = "operator-documents";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/OperatorDocuments";
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isSchemaCacheOrMissingTableError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

async function ensureOperatorDocumentsBucket(admin: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const { data, error } = await admin.storage.getBucket(OPERATOR_DOCUMENTS_BUCKET);

  if (data && !error) {
    if (data.public) {
      const { error: updateError } = await admin.storage.updateBucket(OPERATOR_DOCUMENTS_BUCKET, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: [...ALLOWED_MIME_TYPES],
      });

      if (!updateError) {
        return true;
      }
    }

    return true;
  }

  const { error: createError } = await admin.storage.createBucket(OPERATOR_DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });

  if (createError) {
    return false;
  }

  return true;
}

export async function uploadOperatorDocumentAction(formData: FormData) {
  const profile = await requireOperatorProfile();
  const returnTo = getReturnTo(formData);
  const fileEntry = formData.get("document_file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (!file) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-file" }));
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-file-type" }));
  }

  if (file.size > MAX_FILE_SIZE) {
    redirect(buildRedirectUrl(returnTo, { error: "file-too-large" }));
  }

  const guestName = String(formData.get("guest_name") ?? "").trim();
  const documentType = String(formData.get("document_type") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim() || null;

  if (!guestName || !documentType) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-details" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const bucketReady = await ensureOperatorDocumentsBucket(admin);

  if (!bucketReady) {
    redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
  }

  if (inquiryId) {
    const { data: inquiry } = await admin
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId)
      .eq("operator_name", profile.full_name)
      .maybeSingle();

    if (!inquiry) {
      redirect(buildRedirectUrl(returnTo, { error: "invalid-inquiry" }));
    }
  }

  const fileExtension = getExtensionFromType(file.type);
  const filePath = `${profile.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name || `document.${fileExtension}`)}`;
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(OPERATOR_DOCUMENTS_BUCKET)
    .upload(filePath, fileBytes, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (uploadError) {
    if (uploadError.message?.includes("Bucket not found") || uploadError.message?.includes("bucket not found")) {
      const ensured = await ensureOperatorDocumentsBucket(admin);

      if (ensured) {
        const retry = await admin.storage
          .from(OPERATOR_DOCUMENTS_BUCKET)
          .upload(filePath, fileBytes, {
            upsert: true,
            contentType: file.type,
            cacheControl: "3600",
          });

        if (!retry.error) {
          const { data: createdDocument, error: insertError } = await admin
            .from("operator_documents")
            .insert({
            operator_id: profile.id,
            inquiry_id: inquiryId,
            booking_id: inquiryId,
            guest_name: guestName,
            document_type: documentType,
            file_name: file.name || `document.${fileExtension}`,
            file_path: filePath,
            file_url: filePath,
            mime_type: file.type,
            status: "pending",
            access_level: inquiryId ? "shared" : "private",
            notes: notes || null,
            uploaded_by: profile.id,
          })
            .select("id")
            .single();

          if (!insertError) {
            await recordPlatformEvent({
              event_type: "document_uploaded",
              actor_profile_id: profile.id,
              actor_role: "operator",
              document_id: createdDocument?.id ?? null,
              metadata: {
                inquiryId,
                documentType,
                guestName,
              },
            });
            revalidatePath("/OperatorDocuments");
            revalidatePath("/AdminAnalytics");
            redirect(buildRedirectUrl(returnTo, { uploaded: "1" }));
          }

          await admin.storage.from(OPERATOR_DOCUMENTS_BUCKET).remove([filePath]);

          if (insertError) {
            if (isSchemaCacheOrMissingTableError(insertError)) {
              redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
            }

            console.error("Unable to save uploaded document record after retry", {
              profileId: profile.id,
              inquiryId,
              error: insertError.message,
            });
            redirect(buildRedirectUrl(returnTo, { error: "We could not save the document record. Please try again." }));
          }
        }
      }
    }

    if (isSchemaCacheOrMissingTableError(uploadError)) {
      redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
    }

    console.error("Unable to upload operator document", {
      profileId: profile.id,
      inquiryId,
      error: uploadError.message,
    });
    redirect(buildRedirectUrl(returnTo, { error: "We could not upload the document. Please try again." }));
  }

  const { data: createdDocument, error: insertError } = await admin
    .from("operator_documents")
    .insert({
    operator_id: profile.id,
    inquiry_id: inquiryId,
    booking_id: inquiryId,
    guest_name: guestName,
    document_type: documentType,
    file_name: file.name || `document.${fileExtension}`,
    file_path: filePath,
    file_url: filePath,
    mime_type: file.type,
    status: "pending",
    access_level: inquiryId ? "shared" : "private",
    notes: notes || null,
    uploaded_by: profile.id,
  })
    .select("id")
    .single();

  if (insertError) {
    await admin.storage.from(OPERATOR_DOCUMENTS_BUCKET).remove([filePath]);
    if (isSchemaCacheOrMissingTableError(insertError)) {
      redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
    }

    console.error("Unable to create operator document record", {
      profileId: profile.id,
      inquiryId,
      error: insertError.message,
    });
    redirect(buildRedirectUrl(returnTo, { error: "We could not save the document record. Please try again." }));
  }

  await recordPlatformEvent({
    event_type: "document_uploaded",
    actor_profile_id: profile.id,
    actor_role: "operator",
    document_id: createdDocument?.id ?? null,
    metadata: {
      inquiryId,
      documentType,
      guestName,
    },
  });

  revalidatePath("/OperatorDocuments");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { uploaded: "1" }));
}

export async function updateOperatorDocumentStatusAction(formData: FormData) {
  const profile = await requireOperatorProfile();
  const returnTo = getReturnTo(formData);
  const documentId = String(formData.get("document_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!documentId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-document" }));
  }

  if (!["pending", "shared", "complete", "sensitive", "archived"].includes(status)) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-status" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("operator_documents")
    .update({ status })
    .eq("id", documentId)
    .eq("operator_id", profile.id);

  if (error) {
    if (isSchemaCacheOrMissingTableError(error)) {
      redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
    }

    console.error("Unable to update operator document status", {
      profileId: profile.id,
      documentId,
      error: error.message,
    });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update the document. Please try again." }));
  }

  await recordPlatformEvent({
    event_type: "document_uploaded",
    actor_profile_id: profile.id,
    actor_role: "operator",
    document_id: documentId,
    metadata: { status },
  });

  revalidatePath("/OperatorDocuments");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}

export async function shareOperatorDocumentAction(formData: FormData) {
  const profile = await requireOperatorProfile();
  const returnTo = getReturnTo(formData);
  const documentId = String(formData.get("document_id") ?? "").trim();
  const sharedWithProfileId = String(formData.get("shared_with_profile_id") ?? "").trim();
  const accessLevel = String(formData.get("access_level") ?? "viewer").trim();

  if (!documentId || !sharedWithProfileId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-share-target" }));
  }

  if (!["viewer", "editor"].includes(accessLevel)) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-share-level" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", sharedWithProfileId)
    .in("role", ["operator", "admin"])
    .maybeSingle();

  if (!targetProfile) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-share-target" }));
  }

  const { error } = await admin.from("operator_document_shares").upsert(
    {
      document_id: documentId,
      shared_with_profile_id: sharedWithProfileId,
      shared_by_profile_id: profile.id,
      access_level: accessLevel,
    },
    { onConflict: "document_id,shared_with_profile_id" },
  );

  if (error) {
    if (isSchemaCacheOrMissingTableError(error)) {
      redirect(buildRedirectUrl(returnTo, { error: "documents-unavailable" }));
    }

    console.error("Unable to share operator document", {
      profileId: profile.id,
      documentId,
      sharedWithProfileId,
      error: error.message,
    });
    redirect(buildRedirectUrl(returnTo, { error: "We could not share the document. Please try again." }));
  }

  const { error: documentUpdateError } = await admin
    .from("operator_documents")
    .update({
      access_level: "shared",
    })
    .eq("id", documentId)
    .eq("operator_id", profile.id);

  if (documentUpdateError) {
    console.error("Unable to update shared document status", {
      profileId: profile.id,
      documentId,
      error: documentUpdateError.message,
    });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update the document access level. Please try again." }));
  }

  await recordPlatformEvent({
    event_type: "document_shared",
    actor_profile_id: profile.id,
    actor_role: "operator",
    document_id: documentId,
    target_profile_id: sharedWithProfileId,
    metadata: { accessLevel },
  });

  revalidatePath("/OperatorDocuments");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { shared: "1" }));
}

function getExtensionFromType(fileType: string) {
  switch (fileType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    default:
      return "jpg";
  }
}
