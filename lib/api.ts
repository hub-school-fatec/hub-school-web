"use client";

import { createClient } from "./supabase/client";

type ApiOptions = Omit<RequestInit, "headers"> & { headers?: HeadersInit };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("Configure NEXT_PUBLIC_API_URL no arquivo .env.local.");

  const { data: { session } } = await createClient().auth.getSession();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  const response = await fetch(new URL(path, baseUrl), { ...options, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `A API respondeu com status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
