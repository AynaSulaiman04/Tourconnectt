"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { updateProfileAction } from "./actions";
import { initialProfileFormState } from "./types";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import type { TravelerCareProfile } from "@/lib/supabase/traveler-care";

type ProfileEditorProps = {
  profile: TravelerProfile;
  careProfile: TravelerCareProfile | null;
  defaultProfileImageUrl?: string | null;
};

const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function preferredAreaLabel(value: TravelerProfile["preferred_inquiry_area"]) {
  switch (value) {
    case "desert":
      return "Island Heritage & Culture";
    case "coastal":
      return "Beaches & Marine";
    case "arctic":
      return "Rainforest & Nature";
    default:
      return "Select an environment";
  }
}

export function ProfileEditor({ profile, careProfile, defaultProfileImageUrl = null }: ProfileEditorProps) {
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialProfileFormState,
  );
  const [localPhoto, setLocalPhoto] = useState(profile.profile_image_url ?? defaultProfileImageUrl);
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const profileImageError = state.fieldErrors.profileImage?.[0] ?? clientMessage;
  const hasFieldErrors = Object.values(state.fieldErrors).some((errors) => errors?.length);
  const generalError = !state.success && state.message && !hasFieldErrors ? state.message : null;
  const successMessage = state.success ? state.message : null;

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    [],
  );

  const profilePhoto = state.profileImageUrl ?? localPhoto ?? profile.profile_image_url ?? defaultProfileImageUrl;

  function handleProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      setClientMessage(null);
      setLocalPhoto(profile.profile_image_url ?? defaultProfileImageUrl);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      return;
    }

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      setClientMessage("Please upload a JPG, PNG, or WEBP image.");
      event.currentTarget.value = "";
      setLocalPhoto(profile.profile_image_url ?? defaultProfileImageUrl);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setClientMessage("Profile images must be 2MB or smaller.");
      event.currentTarget.value = "";
      setLocalPhoto(profile.profile_image_url ?? defaultProfileImageUrl);
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
  }

  return (
    <form className="profile-editor" action={formAction}>
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
            disabled={pending}
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
          disabled={pending}
          onChange={handleProfileImageChange}
          aria-invalid={Boolean(profileImageError)}
          aria-describedby={profileImageError ? "profile_image_error" : "profile_image_help"}
        />
        <p className="profile-photo-help" id="profile_image_help">
          Choose a JPG, PNG, or WEBP image, then select Save Profile. Maximum size 2MB.
        </p>
        {profileImageError ? (
          <p className="field-error" id="profile_image_error" role="alert">
            {profileImageError}
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
        <label htmlFor="profile_preferred_inquiry_area">Preferred enquiry areas</label>
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
          <option value="desert">Island Heritage &amp; Culture</option>
          <option value="coastal">Beaches &amp; Marine</option>
          <option value="arctic">Rainforest &amp; Nature</option>
        </select>
        <span className="material-symbols-outlined select-icon" aria-hidden="true">
          expand_more
        </span>
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
            <input
              id="profile_phone_number"
              name="phone_number"
              defaultValue={careProfile?.phone_number ?? ""}
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(state.fieldErrors.phoneNumber?.length)}
              aria-describedby={state.fieldErrors.phoneNumber?.length ? "profile_phone_number_error" : undefined}
            />
            {state.fieldErrors.phoneNumber?.length ? (
              <p className="field-error" id="profile_phone_number_error" role="alert">
                {state.fieldErrors.phoneNumber[0]}
              </p>
            ) : null}
          </div>
          <div className="field select-field">
            <label htmlFor="profile_can_walk">Can You Manage a 15-Minute Walk?</label>
            <select
              id="profile_can_walk"
              name="can_walk_15_minutes"
              defaultValue={careProfile?.can_walk_15_minutes === true ? "yes" : careProfile?.can_walk_15_minutes === false ? "no" : "unsure"}
              aria-invalid={Boolean(state.fieldErrors.canWalk15Minutes?.length)}
              aria-describedby={state.fieldErrors.canWalk15Minutes?.length ? "profile_can_walk_error" : undefined}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unsure">Unsure</option>
            </select>
            <span className="material-symbols-outlined select-icon" aria-hidden="true">
              expand_more
            </span>
            {state.fieldErrors.canWalk15Minutes?.length ? (
              <p className="field-error" id="profile_can_walk_error" role="alert">
                {state.fieldErrors.canWalk15Minutes[0]}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="profile_pickup_location">Default Pickup Location</label>
            <input
              id="profile_pickup_location"
              name="default_pickup_location"
              defaultValue={careProfile?.default_pickup_location ?? ""}
              placeholder="Hotel, address, or meeting point"
              type="text"
              aria-invalid={Boolean(state.fieldErrors.defaultPickupLocation?.length)}
              aria-describedby={
                state.fieldErrors.defaultPickupLocation?.length ? "profile_pickup_location_error" : undefined
              }
            />
            {state.fieldErrors.defaultPickupLocation?.length ? (
              <p className="field-error" id="profile_pickup_location_error" role="alert">
                {state.fieldErrors.defaultPickupLocation[0]}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="profile_pickup_time">Preferred Pickup Time</label>
            <input
              id="profile_pickup_time"
              name="preferred_pickup_time"
              defaultValue={careProfile?.preferred_pickup_time ?? ""}
              placeholder="For example, 8:30 AM or flexible"
              type="text"
              aria-invalid={Boolean(state.fieldErrors.preferredPickupTime?.length)}
              aria-describedby={
                state.fieldErrors.preferredPickupTime?.length ? "profile_pickup_time_error" : undefined
              }
            />
            {state.fieldErrors.preferredPickupTime?.length ? (
              <p className="field-error" id="profile_pickup_time_error" role="alert">
                {state.fieldErrors.preferredPickupTime[0]}
              </p>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor="profile_allergies">Allergies</label>
          <textarea
            id="profile_allergies"
            name="allergies"
            defaultValue={careProfile?.allergies ?? ""}
            maxLength={1000}
            rows={3}
            placeholder="Food, medication, environmental, or other relevant allergies"
            aria-invalid={Boolean(state.fieldErrors.allergies?.length)}
            aria-describedby={state.fieldErrors.allergies?.length ? "profile_allergies_error" : undefined}
          />
          {state.fieldErrors.allergies?.length ? (
            <p className="field-error" id="profile_allergies_error" role="alert">
              {state.fieldErrors.allergies[0]}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="profile_dietary_restrictions">Dietary Restrictions</label>
          <textarea
            id="profile_dietary_restrictions"
            name="dietary_restrictions"
            defaultValue={careProfile?.dietary_restrictions ?? ""}
            maxLength={1000}
            rows={3}
            placeholder="Dietary needs, preferences, or meal restrictions"
            aria-invalid={Boolean(state.fieldErrors.dietaryRestrictions?.length)}
            aria-describedby={
              state.fieldErrors.dietaryRestrictions?.length ? "profile_dietary_restrictions_error" : undefined
            }
          />
          {state.fieldErrors.dietaryRestrictions?.length ? (
            <p className="field-error" id="profile_dietary_restrictions_error" role="alert">
              {state.fieldErrors.dietaryRestrictions[0]}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="profile_mobility_requirements">Mobility Requirements</label>
          <textarea
            id="profile_mobility_requirements"
            name="mobility_requirements"
            defaultValue={careProfile?.mobility_requirements ?? ""}
            maxLength={1000}
            rows={3}
            placeholder="Walking support, wheelchair access, pace, steps, or other needs"
            aria-invalid={Boolean(state.fieldErrors.mobilityRequirements?.length)}
            aria-describedby={
              state.fieldErrors.mobilityRequirements?.length ? "profile_mobility_requirements_error" : undefined
            }
          />
          {state.fieldErrors.mobilityRequirements?.length ? (
            <p className="field-error" id="profile_mobility_requirements_error" role="alert">
              {state.fieldErrors.mobilityRequirements[0]}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="profile_medical_notes">Relevant Medical Notes</label>
          <textarea
            id="profile_medical_notes"
            name="medical_notes"
            defaultValue={careProfile?.medical_notes ?? ""}
            maxLength={2000}
            rows={4}
            placeholder="Only information the operator should know to support your safety and comfort"
            aria-invalid={Boolean(state.fieldErrors.medicalNotes?.length)}
            aria-describedby={state.fieldErrors.medicalNotes?.length ? "profile_medical_notes_error" : undefined}
          />
          {state.fieldErrors.medicalNotes?.length ? (
            <p className="field-error" id="profile_medical_notes_error" role="alert">
              {state.fieldErrors.medicalNotes[0]}
            </p>
          ) : null}
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
        {generalError ? (
          <div className="profile-editor-alert" role="alert" aria-live="polite">
            <span className="material-symbols-outlined" aria-hidden="true">
              error
            </span>
            <div>
              <strong>Profile update needs attention.</strong>
              <p>{generalError}</p>
            </div>
          </div>
        ) : null}

        <button className="btn-primary w-full" disabled={pending} type="submit">
          {pending ? "Saving Profile" : "Save Profile"}
        </button>

        {successMessage ? (
          <p className="form-status form-status-success" aria-live="polite">
            {successMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}
