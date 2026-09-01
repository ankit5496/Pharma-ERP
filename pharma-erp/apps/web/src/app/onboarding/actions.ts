'use server';

import { revalidatePath } from 'next/cache';
import type { CreateCompanyRequest, CreateCompanyResponse } from '@pharma-erp/types';

import { apiFetch } from '@/lib/api';

export interface CreateCompanyState {
  status: 'idle' | 'error' | 'success';
  /** Message to show the user; safe to render, never a stack trace. */
  message?: string;
  /** Echoed back so the form can repopulate after a failed submit. */
  values?: Partial<CreateCompanyRequest>;
}

/**
 * Server action behind the company setup form.
 *
 * The action forwards to the API rather than writing to the database directly.
 * That is the point: provisioning needs the elevated connection, the audit
 * write, and the Clerk metadata sync, and all of that lives behind one endpoint
 * so a second caller cannot half-implement it. The web app stays a client.
 */
export async function createCompanyAction(
  _previous: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const values: CreateCompanyRequest = {
    companyName: readString(formData, 'companyName'),
    slug: readString(formData, 'slug').toLowerCase(),
    fullName: readString(formData, 'fullName'),
    drugLicenceNumber: readOptional(formData, 'drugLicenceNumber'),
    gstin: readOptional(formData, 'gstin'),
    timezone: readOptional(formData, 'timezone') ?? 'Asia/Kolkata',
  };

  // Client-side required-field checks are a courtesy; the API's DTO is the real
  // validation and its messages are what surface below on anything subtler.
  if (!values.companyName || !values.slug || !values.fullName) {
    return {
      status: 'error',
      message: 'Company name, identifier and your full name are all required.',
      values,
    };
  }

  const result = await apiFetch<CreateCompanyResponse>('/api/v1/onboarding/company', {
    method: 'POST',
    json: values,
    authenticated: true,
    // Provisioning writes two rows and calls Clerk; the default 5s is tight.
    timeoutMs: 15_000,
  });

  if (!result.ok) {
    if (result.status === 401) {
      return { status: 'error', message: 'Your session expired. Please sign in again.', values };
    }

    return { status: 'error', message: result.error, values };
  }

  // The dashboard's session read is cached per request; drop it so the freshly
  // created tenant is visible immediately rather than after a hard reload.
  revalidatePath('/', 'layout');

  return {
    status: 'success',
    message: `${values.companyName} is ready.`,
  };
}

/** Checks a slug's availability for the form's inline feedback. */
export async function checkSlugAction(slug: string): Promise<boolean> {
  const normalised = slug.trim().toLowerCase();

  if (normalised.length < 3) return false;

  const result = await apiFetch<{ slug: string; available: boolean }>(
    `/api/v1/onboarding/slug-available?slug=${encodeURIComponent(normalised)}`,
    { authenticated: true, timeoutMs: 4_000 },
  );

  // Treat an unreachable API as "not available": showing a green tick we cannot
  // stand behind would only move the failure to the submit.
  return result.ok ? result.data.available : false;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptional(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}
