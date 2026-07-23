"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "./actions";
import { initialProfileFormState } from "./types";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import type { TravelerCareProfile } from "@/lib/supabase/traveler-care";
import { setPortalAuthCookieClient } from "@/lib/supabase/portal-auth";

type ProfileEditorProps = {
  profile: TravelerProfile;
  careProfile: TravelerCareProfile | null;
};

const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function preferredAreaLabel(value: TravelerProfile["preferred_inquiry_area"]) {
  switch (value) {
    case "desert":
      return "The High Desert";
    case "coastal":
      return "Coastal Archipelagos";
    case "arctic":
      return "Arctic Silence";
    default:
      return "Select an environment";
  }
}

export function ProfileEditor({ profile, careProfile }: ProfileEditorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialProfileFormState,
  );
  const [localPhoto, setLocalPhoto] = useState(profile.profile_image_url);
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const hasRefreshedAfterSave = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const visibleMessage = state.message || clientMessage;
  const showFormError = Boolean(visibleMessage && !state.success);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!state.success || hasRefreshedAfterSave.current) {
      return;
    }

    hasRefreshedAfterSave.current = true;
    setPortalAuthCookieClient({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      profile_image_url: state.profileImageUrl ?? profile.profile_image_url ?? null,
    });
    router.refresh();
  }, [profile.email, profile.full_name, profile.id, profile.profile_image_url, profile.role, router, state.profileImageUrl, state.success]);

  const profilePhoto = state.profileImageUrl ?? localPhoto ?? profile.profile_image_url;

  function handleProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      setClientMessage(null);
      setLocalPhoto(profile.profile_image_url);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      return;
    }

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      setClientMessage("Please upload a JPG, PNG, or WEBP image.");
      event.currentTarget.value = "";
      setLocalPhoto(profile.profile_image_url);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setClientMessage("Profile images must be 2MB or smaller.");
      event.currentTarget.value = "";
      setLocalPhoto(profile.profile_image_url);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      return;
    }

    setClientMessage(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    setLocalPhoto(previewUrl);

    window.requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <form ref={formRef} className="profile-editor" action={formAction}>
      <div className="field profile-photo-field" id="profile-photo">
        <span className="profile-editor-label">Profile Picture</span>
        <div className="profile-photo-preview">
          {profilePhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              alt=""
              className="profile-photo-image"
              src={profilePhoto}
              style={{ height: "100%", objectFit: "cover", width: "100%" }}
            />
          ) : (
            <span className="material-symbols-outlined profile-photo-placeholder">photo_camera</span>
          )}
          <button
            className="profile-photo-camera"
            type="button"
            aria-label="Upload profile photo"
            onClick={() => profileImageInputRef.current?.click()}
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
        </div>
        <input
          ref={profileImageInputRef}
          id="profile_image"
          name="profile_image"
          accept="image/jpeg,image/png,image/webp"
          type="file"
          onChange={handleProfileImageChange}
          aria-invalid={Boolean(state.fieldErrors.profileImage?.length)}
          aria-describedby={state.fieldErrors.profileImage?.length ? "profile_image_error" : "profile_image_help"}
        />
        <p className="profile-photo-help" id="profile_image_help">
          Click the camera icon to upload a JPG, PNG, or WEBP image. Maximum size 2MB.
        </p>
        {state.fieldErrors.profileImage?.length ? (
          <p className="field-error" id="profile_image_error" role="alert">
            {state.fieldErrors.profileImage[0]}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="profile_full_name">Full Name</label>
        <input
          id="profile_full_name"
          name="full_name"
          defaultValue={profile.full_name}
          type="text"
          required
          aria-invalid={Boolean(state.fieldErrors.fullName?.length)}
          aria-describedby={state.fieldErrors.fullName?.length ? "profile_full_name_error" : undefined}
        />
        {state.fieldErrors.fullName?.length ? (
          <p className="field-error" id="profile_full_name_error" role="alert">
            {state.fieldErrors.fullName[0]}
          </p>
        ) : null}
      </div>

      <div className="field select-field">
        <label htmlFor="profile_preferred_inquiry_area">Preferred Inquiry Areas</label>
        <select
          id="profile_preferred_inquiry_area"
          name="preferred_inquiry_area"
          defaultValue={profile.preferred_inquiry_area ?? ""}
          required
          aria-invalid={Boolean(state.fieldErrors.preferredInquiryArea?.length)}
          aria-describedby={
            state.fieldErrors.preferredInquiryArea?.length
              ? "profile_preferred_inquiry_area_error"
              : undefined
          }
        >
          <option disabled value="">
            Select an environment
          </option>
          <option value="desert">The High Desert</option>
          <option value="coastal">Coastal Archipelagos</option>
          <option value="arctic">Arctic Silence</option>
        </select>
        {state.fieldErrors.preferredInquiryArea?.length ? (
          <p className="field-error" id="profile_preferred_inquiry_area_error" role="alert">
            {state.fieldErrors.preferredInquiryArea[0]}
          </p>
        ) : null}
      </div>

      <section className="profile-care-section" aria-labelledby="guest-care-heading">
        <div>
          <span className="profile-editor-label">Private operational details</span>
          <h3 id="guest-care-heading">Guest care and pickup information</h3>
          <p className="profile-photo-help">
            These details help assigned operators and authorized staff plan a safe, comfortable tour. Only include information relevant to your experience.
          </p>
        </div>

        <div className="profile-care-grid">
          <div className="field">
            <label htmlFor="profile_phone_number">Phone Number</label>
            <input id="profile_phone_number" name="phone_number" defaultValue={careProfile?.phone_number ?? ""} type="tel" autoComplete="tel" />
          </div>
          <div className="field">
            <label htmlFor="profile_can_walk">Can You Manage a 15-Minute Walk?</label>
            <select id="profile_can_walk" name="can_walk_15_minutes" defaultValue={careProfile?.can_walk_15_minutes === true ? "yes" : careProfile?.can_walk_15_minutes === false ? "no" : "unsure"}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unsure">Unsure</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="profile_pickup_location">Default Pickup Location</label>
            <input id="profile_pickup_location" name="default_pickup_location" defaultValue={careProfile?.default_pickup_location ?? ""} placeholder="Hotel, address, or meeting point" type="text" />
          </div>
          <div className="field">
            <label htmlFor="profile_pickup_time">Preferred Pickup Time</label>
            <input id="profile_pickup_time" name="preferred_pickup_time" defaultValue={careProfile?.preferred_pickup_time ?? ""} placeholder="For example, 8:30 AM or flexible" type="text" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="profile_allergies">Allergies</label>
          <textarea id="profile_allergies" name="allergies" defaultValue={careProfile?.allergies ?? ""} maxLength={1000} rows={3} placeholder="Food, medication, environmental, or other relevant allergies" />
        </div>
        <div className="field">
          <label htmlFor="profile_dietary_restrictions">Dietary Restrictions</label>
          <textarea id="profile_dietary_restrictions" name="dietary_restrictions" defaultValue={careProfile?.dietary_restrictions ?? ""} maxLength={1000} rows={3} placeholder="Dietary needs, preferences, or meal restrictions" />
        </div>
        <div className="field">
          <label htmlFor="profile_mobility_requirements">Mobility Requirements</label>
          <textarea id="profile_mobility_requirements" name="mobility_requirements" defaultValue={careProfile?.mobility_requirements ?? ""} maxLength={1000} rows={3} placeholder="Walking support, wheelchair access, pace, steps, or other needs" />
        </div>
        <div className="field">
          <label htmlFor="profile_medical_notes">Relevant Medical Notes</label>
          <textarea id="profile_medical_notes" name="medical_notes" defaultValue={careProfile?.medical_notes ?? ""} maxLength={2000} rows={4} placeholder="Only information the operator should know to support your safety and comfort" />
        </div>
      </section>

      <div className="profile-editor-meta">
        <div>
          <span className="profile-editor-label">Email</span>
          <p className="profile-editor-value">{profile.email}</p>
        </div>
        <div>
          <span className="profile-editor-label">Current Area</span>
          <p className="profile-editor-value">{preferredAreaLabel(profile.preferred_inquiry_area)}</p>
        </div>
      </div>

      <div className="submit-wrap">
        {showFormError ? (
          <div className="profile-editor-alert" role="alert" aria-live="polite">
            <span className="material-symbols-outlined" aria-hidden="true">
              error
            </span>
            <div>
              <strong>Profile update needs attention.</strong>
              <p>{visibleMessage}</p>
            </div>
          </div>
        ) : null}

        <button className="btn-primary w-full" disabled={pending} type="submit">
          {pending ? "Saving Profile" : "Save Profile"}
        </button>

        <p className={`form-status ${state.success ? "form-status-success" : "form-status-error"}`} aria-live="polite">
          {visibleMessage}
        </p>
      </div>
    </form>
  );
}
