import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const OPERATOR_DOCUMENTS_BUCKET = "operator-documents";

export async function GET(request: NextRequest) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile || profileContext.profile.role !== "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documentId = request.nextUrl.searchParams.get("document_id")?.trim();

  if (!documentId) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: document, error } = await admin
    .from("operator_documents")
    .select("id,file_path,file_name,operator_id")
    .eq("id", documentId)
    .eq("operator_id", profileContext.profile.id)
    .maybeSingle();

  if (error || !document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: signedUrl, error: signedUrlError } = await admin.storage
    .from(OPERATOR_DOCUMENTS_BUCKET)
    .createSignedUrl(document.file_path, 60 * 60);

  if (signedUrlError || !signedUrl?.signedUrl) {
    console.error("Unable to create operator document signed URL", {
      documentId,
      error: signedUrlError?.message ?? "Unknown error",
    });
    return NextResponse.json(
      {
        error: "We could not access document storage. Please check the operator-documents bucket setup.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    fileName: document.file_name,
    shareUrl: signedUrl.signedUrl,
    expiresInSeconds: 60 * 60,
  });
}
