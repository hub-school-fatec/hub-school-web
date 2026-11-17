"use client";

import { createClient } from "./supabase/client";

type ApiOptions = Omit<RequestInit, "headers"> & { headers?: HeadersInit };

async function frequencyValidationMessage(response: Response): Promise<string> {
  const fallback = "Não foi possível salvar a frequência. Confira a data, a quantidade de aulas e as faltas.";
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("detail" in body) || !Array.isArray(body.detail)) return fallback;
    const labels: Record<string, string> = {
      disciplina_id: "disciplina", data: "data", aulas_no_dia: "quantidade de aulas", faltas: "faltas",
    };
    const fields = new Set<string>();
    for (const issue of body.detail) {
      if (!issue || typeof issue !== "object" || !("loc" in issue) || !Array.isArray(issue.loc)) continue;
      const field = issue.loc.find((part: unknown) => typeof part === "string" && part in labels);
      if (typeof field === "string") fields.add(labels[field]);
    }
    if (fields.size) return `Confira os campos da frequência: ${[...fields].join(", ")}.`;
    return fallback;
  } catch {
    return fallback;
  }
}

async function apiRequest(path: string, options: ApiOptions = {}): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("Configure NEXT_PUBLIC_API_URL no arquivo .env.local.");

  const { data: { session }, error: sessionError } = await createClient().auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${session.access_token}`);

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  let response: Response;
  try {
    response = await fetch(new URL(normalizedPath, normalizedBaseUrl), { ...options, headers });
  } catch {
    throw new Error("Não foi possível conectar à API. Tente novamente.");
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
    if (response.status === 403) throw new Error("Você não tem permissão para esta operação.");
    if (response.status === 404) throw new Error("Registro não encontrado.");
    if (response.status === 409) throw new Error("Já existe um registro com esses dados.");
    if (normalizedPath === "anexos/upload" && [400, 413, 422].includes(response.status)) {
      throw new Error("Arquivo recusado. Confira o nome, o formato e o limite de 10 MB.");
    }
    if (normalizedPath === "anexos/upload" && response.status >= 500) {
      throw new Error("Envio do anexo não confirmado. Atualize a lista antes de tentar novamente.");
    }
    if (response.status === 422 && normalizedPath.split("?")[0] === "frequencias" && options.method === "POST") {
      throw new Error(await frequencyValidationMessage(response));
    }
    if (response.status === 400 || response.status === 422) throw new Error("Confira os dados informados.");
    throw new Error("Não foi possível concluir a operação. Tente novamente.");
  }
  return response;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await apiRequest(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string): Promise<Blob> {
  const response = await apiRequest(path);
  return response.blob();
}
