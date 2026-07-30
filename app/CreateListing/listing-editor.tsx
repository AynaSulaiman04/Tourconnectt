"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { calculateListingCompletion } from "@/lib/operator-listing-completion";
import type { OperatorListingDraftRecord } from "@/lib/supabase/operator-listings";

type ListingEditorProps = {
  operatorName: string;
  initialDraft: OperatorListingDraftRecord | null;
};

type ListingFormState = {
  title: string;
  location: string;
  country: string;
  duration: string;
  summary: string;
  category: string;
  price: string;
  availability: string;
  capacity: string;
  itinerary: string;
  inclusions: string;
  exclusions: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

const STEP_LABELS = ["Core Narrative", "Visual Gallery", "Experience Details"] as const;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LOCAL_DRAFT_KEY = "ttconnect-operator-listing-draft";

type StoredDraft = {
  formState: ListingFormState;
  imagePreview: string;
  imageCleared: boolean;
  draftId: string;
  step: number;
};

function readStoredDraftSnapshot(): Partial<StoredDraft> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(LOCAL_DRAFT_KEY);

    if (!stored) {
      return null;
    }

    return JSON.parse(stored) as Partial<StoredDraft>;
  } catch {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY);
    return null;
  }
}

function buildInitialState(initialDraft: OperatorListingDraftRecord | null): ListingFormState {
  return {
    title: initialDraft?.title ?? "",
    location: initialDraft?.location ?? "",
    country: initialDraft?.country ?? "",
    duration: initialDraft?.duration ?? "",
    summary: initialDraft?.summary ?? "",
    category: initialDraft?.category ?? "",
    price: initialDraft?.price ?? "",
    availability: initialDraft?.availability ?? "",
    capacity: initialDraft?.capacity?.toString() ?? "",
    itinerary: initialDraft?.itinerary ?? "",
    inclusions: initialDraft?.inclusions ?? "",
    exclusions: initialDraft?.exclusions ?? "",
    contactName: initialDraft?.contact_name ?? "",
    contactEmail: initialDraft?.contact_email ?? "",
    contactPhone: initialDraft?.contact_phone ?? "",
  };
}

export function ListingEditor({
  operatorName,
  initialDraft,
}: ListingEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState(() => {
    if (initialDraft) {
      return 0;
    }

    const stored = readStoredDraftSnapshot();

    if (typeof stored?.step === "number" && stored.step >= 0) {
      return Math.min(stored.step, STEP_LABELS.length - 1);
    }

    return 0;
  });
  const [draftId, setDraftId] = useState(() => {
    if (initialDraft) {
      return initialDraft.id;
    }

    const stored = readStoredDraftSnapshot();
    return typeof stored?.draftId === "string" ? stored.draftId : "";
  });
  const [formState, setFormState] = useState<ListingFormState>(() => {
    if (initialDraft) {
      return buildInitialState(initialDraft);
    }

    const stored = readStoredDraftSnapshot();
    return {
      ...buildInitialState(null),
      ...(stored?.formState ?? {}),
    };
  });
  const [imagePreview, setImagePreview] = useState(() => {
    if (initialDraft) {
      return initialDraft.image_base64 ?? initialDraft.image_url ?? "";
    }

    const stored = readStoredDraftSnapshot();
    return typeof stored?.imagePreview === "string"
      ? stored.imagePreview
      : "";
  });
  const [imageCleared, setImageCleared] = useState(() => {
    if (initialDraft) {
      return false;
    }

    const stored = readStoredDraftSnapshot();
    return typeof stored?.imageCleared === "boolean" ? stored.imageCleared : false;
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (initialDraft) {
      return;
    }

    const snapshot: StoredDraft = {
      formState,
      imagePreview,
      imageCleared,
      draftId,
      step,
    };

    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
  }, [draftId, formState, imageCleared, imagePreview, initialDraft, step]);

  function clearLocalDraft() {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY);
  }

  const completion = useMemo(
    () =>
      calculateListingCompletion({
        title: formState.title,
        location: formState.location,
        country: formState.country,
        duration: formState.duration,
        summary: formState.summary,
        category: formState.category,
        price: formState.price,
        availability: formState.availability,
        capacity: formState.capacity,
        itinerary: formState.itinerary,
        inclusions: formState.inclusions,
        exclusions: formState.exclusions,
        contact_name: formState.contactName,
        contact_email: formState.contactEmail,
        contact_phone: formState.contactPhone,
        image_url: imagePreview || null,
      }),
    [formState, imagePreview],
  );

  function updateField<K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function handleImagePick(file: File | null) {
    setNotice(null);

    if (!file) {
      setImageCleared(true);
      setImagePreview("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setNotice({
        type: "error",
        message: "Upload JPG, PNG, or WEBP files only.",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setNotice({
        type: "error",
        message: "Cover image must be 2MB or smaller.",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageCleared(false);
      setImagePreview(result);
    };

    reader.onerror = () => {
      setNotice({
        type: "error",
        message: "Unable to read the selected image.",
      });
    };

    reader.readAsDataURL(file);
  }

  async function saveListing(mode: "save" | "publish") {
    setSaving(true);
    setNotice(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

    try {
      const formData = new FormData();

      if (draftId) {
        formData.set("draft_id", draftId);
      }

      if (initialDraft?.published_listing_id) {
        formData.set("published_listing_id", initialDraft.published_listing_id);
      }

      formData.set("mode", mode);
      formData.set("title", formState.title);
      formData.set("location", formState.location);
      formData.set("country", formState.country);
      formData.set("duration", formState.duration);
      formData.set("summary", formState.summary);
      formData.set("category", formState.category);
      formData.set("price", formState.price);
      formData.set("availability", formState.availability);
      formData.set("capacity", formState.capacity);
      formData.set("itinerary", formState.itinerary);
      formData.set("inclusions", formState.inclusions);
      formData.set("exclusions", formState.exclusions);
      formData.set("contact_name", formState.contactName);
      formData.set("contact_email", formState.contactEmail);
      formData.set("contact_phone", formState.contactPhone);

      if (imagePreview.startsWith("data:")) {
        formData.set("image_base64", imagePreview);
      } else if (imageCleared) {
        formData.set("clear_image", "1");
      } else if (initialDraft?.image_base64 && !imagePreview) {
        formData.set("image_base64", initialDraft.image_base64);
      } else if (initialDraft?.image_url && !imagePreview) {
        formData.set("image_url", initialDraft.image_url);
      } else if (imagePreview && imagePreview.startsWith("http")) {
        formData.set("image_url", imagePreview);
      }

      const response = await fetch("/api/operator/listings", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        draft?: { id: string; image_url: string | null; image_base64: string | null };
        listing?: { id: string };
        completion?: number;
        local_only?: boolean;
      };

      if (!response.ok || !result.ok || !result.draft) {
        throw new Error(result.error ?? "Unable to save listing.");
      }

      setDraftId(result.draft.id);

      if (result.draft.image_url) {
        setImagePreview(result.draft.image_url);
        setImageCleared(false);
      } else if (result.draft.image_base64) {
        setImagePreview(result.draft.image_base64);
        setImageCleared(false);
      } else {
        setImagePreview("");
        setImageCleared(true);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (result.local_only) {
        window.localStorage.setItem(
          LOCAL_DRAFT_KEY,
          JSON.stringify({
            formState,
            imagePreview: result.draft.image_base64 || result.draft.image_url || imagePreview,
            imageCleared: false,
            draftId: result.draft.id,
            step,
          } satisfies StoredDraft),
        );
      } else {
        clearLocalDraft();
      }

      setNotice({
        type: "success",
        message:
          mode === "publish"
            ? "Listing submitted for review."
            : result.local_only
              ? "Draft saved locally until the operator listing tables are applied."
              : "Draft saved to Supabase.",
      });

      if (mode === "publish") {
        router.push("/OperatorDashboard?published=1");
      }

      return true;
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "Saving took too long. Check your connection and try again."
            : error instanceof Error && error.message
              ? error.message
              : "We could not save this listing. Please try again.",
      });

      return false;
    } finally {
      window.clearTimeout(timeoutId);
      setSaving(false);
    }
  }

  async function handleAdvance() {
    const saved = await saveListing("save");
    if (!saved) {
      return;
    }

    if (step < STEP_LABELS.length - 1) {
      setStep((current) => current + 1);
    }
  }

  const heroImage = imageCleared ? "" : imagePreview || initialDraft?.image_base64 || initialDraft?.image_url || "";

  return (
    <main className="portal-list-page max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span className="font-label-caps text-secondary block mb-2">
              Step {String(step + 1).padStart(2, "0")} of 03
            </span>
            <h1 className="font-headline-lg text-headline-lg">Create New Listing</h1>
          </div>

          <span className="font-body-md text-on-surface-variant">
            {completion.percentage}% Complete
          </span>
        </div>

        <div className="mt-5 h-1 w-full bg-outline-variant/20 overflow-hidden">
          <div
            className="h-full bg-secondary transition-all duration-500"
            style={{ width: `${completion.percentage}%` }}
          />
        </div>

        {notice ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              notice.type === "success"
                ? "border-secondary/20 bg-secondary/5 text-on-surface-variant"
                : "border-red-300/30 bg-red-50 text-red-700"
            }`}
          >
            {notice.message}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <div className="xl:col-span-8 flex flex-col">
          <section className="glass-panel p-gutter min-h-[650px] flex flex-col">
            {step === 0 && (
              <CoreNarrativeSection
                formState={formState}
                operatorName={operatorName}
                onChange={updateField}
              />
            )}
            {step === 1 && (
              <VisualGallerySection
                imagePreview={heroImage}
                completionPercentage={completion.percentage}
                fileInputRef={fileInputRef}
                onImagePick={handleImagePick}
                onUploadCover={() => fileInputRef.current?.click()}
                onRemoveImage={() => handleImagePick(null)}
              />
            )}
            {step === 2 && (
              <ExperienceDetailsSection formState={formState} onChange={updateField} />
            )}

            <div className="mt-auto pt-8 flex flex-col sm:flex-row justify-between gap-4 items-center border-t border-outline-variant/20">
              <Link className="btn-ghost btn-sm" href="/OperatorListings">
                Back to Listings
              </Link>

              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-ghost btn-sm"
                  disabled={saving}
                  type="button"
                  onClick={() => saveListing("save")}
                >
                  Save Draft
                </button>

                {step > 0 ? (
                  <button
                    className="btn-ghost btn-sm"
                    disabled={saving}
                    type="button"
                    onClick={() => setStep((value) => value - 1)}
                  >
                    Previous
                  </button>
                ) : null}

                <button
                  className="btn-primary btn-sm"
                  disabled={saving}
                  type="button"
                  onClick={step < STEP_LABELS.length - 1 ? handleAdvance : () => saveListing("publish")}
                >
                  {step < STEP_LABELS.length - 1 ? "Continue" : "Submit for Review"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="xl:col-span-4">
          <div className="grid gap-gutter h-full min-h-[650px]">
            <div className="glass-panel p-gutter">
              <h3 className="font-label-caps text-primary mb-3">Curation Tip</h3>
              <p className="text-body-md text-on-surface-variant font-light italic">
                &ldquo;Describe the local people, culture, landscape, access, and distinctive value of the experience.&rdquo;
              </p>
            </div>

            <div className="glass-panel p-gutter">
              <h3 className="font-label-caps text-on-surface-variant mb-4">Listing Quality</h3>

              <div className="flex items-center justify-between text-xs font-label-caps">
                <span>Completeness</span>
                <span>{completion.percentage}%</span>
              </div>

              <div className="mt-3 h-1 bg-outline-variant/10">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${completion.percentage}%` }}
                />
              </div>

              <ul className="mt-5 space-y-3">
                {completion.sections.map((section) => (
                  <li key={section.label} className="text-xs text-on-surface-variant">
                    {section.isComplete ? "Done" : "Open"} {section.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-3xl">
              {heroImage ? (
                heroImage.startsWith("blob:") ? (
                  <Image
                    fill
                    alt="Listing preview"
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    src={heroImage}
                    unoptimized
                  />
                ) : (
                <Image
                  fill
                  alt="Listing preview"
                  className="object-cover"
                  unoptimized={heroImage.startsWith("data:")}
                  sizes="(max-width: 768px) 100vw, 33vw"
                  src={heroImage}
                />
                )
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#4b463d] via-[#8a7350] to-[#d6c1a3] flex items-center justify-center text-center px-6">
                  <div>
                    <p className="font-label-caps text-white/80">Live listing preview</p>
                    <p className="font-body-md text-white mt-2">{operatorName}</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5">
                <p className="font-label-caps text-[10px] text-on-surface-variant">Live listing preview</p>
                <p className="font-body-md text-on-surface">{operatorName}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function CoreNarrativeSection({
  formState,
  operatorName,
  onChange,
}: {
  formState: ListingFormState;
  operatorName: string;
  onChange: <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => void;
}) {
  return (
    <>
      <SectionLabel label="01 - Core Narrative" />

      <div className="mt-8 grid gap-8">
        <div>
          <FieldLabel label="Experience Title" />
          <input
            className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 text-3xl px-0 py-3 placeholder:text-on-surface-variant"
            placeholder="e.g. Tobago Reef and Heritage Escape"
            type="text"
            value={formState.title}
            onChange={(event) => onChange("title", event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
          <div>
            <FieldLabel label="Location" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="Search coordinates or city"
              type="text"
              value={formState.location}
              onChange={(event) => onChange("location", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Country" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="Country"
              type="text"
              value={formState.country}
              onChange={(event) => onChange("country", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Duration" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="e.g. 4 Days"
              type="text"
              value={formState.duration}
              onChange={(event) => onChange("duration", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Price" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="e.g. $1,250"
              type="text"
              value={formState.price}
              onChange={(event) => onChange("price", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Primary Category" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="e.g. Rainforest and Waterfall Adventure"
              type="text"
              value={formState.category}
              onChange={(event) => onChange("category", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Availability" />
            <select
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 text-on-surface"
              value={formState.availability}
              onChange={(event) => onChange("availability", event.target.value)}
            >
              <option value="">Select timing</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>

          <div>
            <FieldLabel label="Capacity" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              placeholder="e.g. 8"
              max={100000}
              min={1}
              step={1}
              type="number"
              value={formState.capacity}
              onChange={(event) => onChange("capacity", event.target.value)}
            />
          </div>

          <div>
            <FieldLabel label="Operator" />
            <input
              className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant"
              type="text"
              value={operatorName}
              readOnly
            />
          </div>
        </div>

        <div>
          <FieldLabel label="The Story Description" />
          <textarea
            className="w-full min-h-[190px] bg-transparent border-0 border-b border-outline-variant focus:border-secondary focus:ring-0 py-3 px-0 placeholder:text-on-surface-variant resize-none font-body-lg text-body-lg"
            placeholder="Describe the soul of this journey."
            value={formState.summary}
            onChange={(event) => onChange("summary", event.target.value)}
          />
        </div>
      </div>
    </>
  );
}

function VisualGallerySection({
  imagePreview,
  completionPercentage,
  fileInputRef,
  onImagePick,
  onUploadCover,
  onRemoveImage,
}: {
  imagePreview: string;
  completionPercentage: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImagePick: (file: File | null) => void;
  onUploadCover: () => void;
  onRemoveImage: () => void;
}) {
  return (
    <>
      <SectionLabel label="02 - Visual Gallery" />

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5 flex-1">
        <button
          type="button"
          className="md:col-span-2 relative min-h-[430px] overflow-hidden rounded-3xl bg-surface-container-low border border-dashed border-outline-variant flex items-center justify-center text-left"
          onClick={onUploadCover}
        >
          {imagePreview ? (
            imagePreview.startsWith("data:") || imagePreview.startsWith("blob:") ? (
              <Image
                fill
                alt="Hero cover preview"
                className="object-cover opacity-80"
                sizes="(max-width: 768px) 100vw, 66vw"
                src={imagePreview}
                unoptimized
              />
            ) : (
              <Image
                fill
                alt="Hero cover preview"
                className="object-cover opacity-80"
                sizes="(max-width: 768px) 100vw, 66vw"
                src={imagePreview}
              />
            )
          ) : null}
          <div className="relative z-10 text-center p-gutter">
            <p className="font-label-caps text-on-surface">Hero Cover Image</p>
            <p className="text-xs text-on-surface-variant mt-2">
              Minimum 2400x1600px. High-resolution only.
            </p>
            <p className="font-label-caps text-secondary mt-4">Upload cover image</p>
          </div>
        </button>

        <div className="grid grid-cols-2 md:grid-cols-1 gap-5">
          {[
            {
              label: "Cover status",
              copy: imagePreview ? "A live preview is loaded from the current draft." : "No cover image has been selected yet.",
              footer: imagePreview ? "Preview ready" : "Awaiting upload",
            },
            {
              label: "Completion",
              copy: `${completionPercentage}% of the required listing fields are complete.`,
              footer: "Calculated from live form inputs",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="min-h-[200px] rounded-3xl bg-surface-container-low border border-dashed border-outline-variant flex flex-col justify-between p-4"
            >
              <div>
                <p className="font-label-caps text-secondary text-xs">{item.label}</p>
                <p className="mt-3 text-sm text-on-surface-variant leading-6">{item.copy}</p>
              </div>
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/80 px-4 py-3 text-xs text-on-surface-variant">
                {item.footer}
              </div>
            </div>
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        type="file"
        onChange={(event) => onImagePick(event.target.files?.[0] ?? null)}
      />

      {imagePreview ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">Cover image ready for upload.</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn-ghost btn-sm" type="button" onClick={onUploadCover}>
              Upload Cover
            </button>
            <button className="btn-ghost btn-sm" type="button" onClick={onRemoveImage}>
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-3">
          <button className="btn-ghost btn-sm" type="button" onClick={onUploadCover}>
            Upload Cover
          </button>
        </div>
      )}
    </>
  );
}

function ExperienceDetailsSection({
  formState,
  onChange,
}: {
  formState: ListingFormState;
  onChange: <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => void;
}) {
  return (
    <>
      <SectionLabel label="03 - Experience Details" />

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <DetailCard
          title="Journey Notes"
          rows={[
            ["itinerary", formState.itinerary, "Outline the route and pace"],
            ["inclusions", formState.inclusions, "Meals, transfers, guides"],
            ["exclusions", formState.exclusions, "What is not included"],
          ]}
          onChange={onChange}
        />

        <DetailCard
          title="Contact Details"
          rows={[
            ["contactName", formState.contactName, "Operator contact name"],
            ["contactEmail", formState.contactEmail, "contact@example.com"],
            ["contactPhone", formState.contactPhone, "+1 000 000 0000"],
          ]}
          onChange={onChange}
        />
      </div>
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-12 h-[1px] bg-primary" />
      <h2 className="font-label-caps text-on-surface-variant">{label}</h2>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <label className="font-label-caps text-on-surface-variant block mb-2">{label}</label>
  );
}

function DetailCard({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: Array<[keyof ListingFormState, string, string]>;
  onChange: <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => void;
}) {
  return (
    <div className="rounded-3xl border border-outline-variant/20 bg-surface-container-low/70 p-6">
      <label className="font-label-caps text-on-background">{title}</label>

      <div className="mt-5 space-y-4">
        {rows.map(([fieldKey, value, placeholder]) => {
          const label = fieldKeyToLabel(fieldKey);

          return (
            <div
              key={label}
              className="flex flex-col gap-2 border-b border-outline-variant/30 py-3"
            >
              <span className="text-body-md">{label}</span>
              <input
                className="w-full text-left bg-transparent border-0 focus:ring-0 p-0 placeholder:text-on-surface-variant"
                placeholder={placeholder}
                type="text"
                value={value}
                onChange={(event) =>
                  onChange(fieldKey, event.target.value as ListingFormState[keyof ListingFormState])
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fieldKeyToLabel(fieldKey: keyof ListingFormState) {
  switch (fieldKey) {
    case "itinerary":
      return "Itinerary";
    case "inclusions":
      return "Inclusions";
    case "exclusions":
      return "Exclusions";
    case "contactName":
      return "Contact Name";
    case "contactEmail":
      return "Contact Email";
    case "contactPhone":
      return "Contact Phone";
    default:
      return String(fieldKey);
  }
}
