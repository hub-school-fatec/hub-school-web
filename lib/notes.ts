import { apiDownload, apiFetch } from "./api";

export type NoteAttachment = { id: string; name: string; size: number; mime?: string; url?: string };
export type AcademicNote = {
  id: string;
  title: string;
  body: string;
  courseId: string | null;
  eventId: string | null;
  attachments: NoteAttachment[];
  updatedAt: string;
};

function asString(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }

function normalizeNote(value: Record<string, unknown>): AcademicNote {
  const attachmentValue = value.anexos ?? value.attachments;
  const attachments = Array.isArray(attachmentValue) ? attachmentValue : [];
  return {
    id: asString(value.id ?? value.uuid),
    title: asString(value.titulo ?? value.title) || "Anotação sem título",
    body: asString(value.corpo ?? value.conteudo ?? value.body),
    courseId: asString(value.disciplina_id ?? value.courseId) || null,
    eventId: asString(value.evento_id ?? value.eventId) || null,
    attachments: attachments.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const attachment = item as Record<string, unknown>;
      const name = asString(attachment.nome_arquivo ?? attachment.name);
      return name ? [{ id: asString(attachment.id) || name, name, size: Number(attachment.tamanho_bytes ?? attachment.size) || 0, url: asString(attachment.url) || undefined }] : [];
    }),
    updatedAt: asString(value.atualizado_em ?? value.updated_at ?? value.created_at ?? value.updatedAt) || new Date().toISOString(),
  };
}

function unwrapList(value: unknown): unknown[] {
  let result = value;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const wrapper = result as Record<string, unknown>;
    result = wrapper.anotacoes ?? wrapper.data ?? wrapper.items;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const nested = result as Record<string, unknown>;
      result = nested.anotacoes ?? nested.items;
    }
  }
  if (!Array.isArray(result)) throw new Error("A resposta da API não contém uma lista de anotações.");
  return result;
}

export async function getNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  const result = await apiFetch<unknown>(`anexos?anotacao_id=${encodeURIComponent(noteId)}`);
  if (!Array.isArray(result)) throw new Error("A API não retornou uma lista de anexos.");
  return result.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("A API retornou um anexo inválido.");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.anotacao_id !== noteId || typeof row.nome_arquivo !== "string"
        || typeof row.tamanho_bytes !== "number" || row.tamanho_bytes <= 0
        || typeof row.tipo_mime !== "string") {
      throw new Error("A API retornou um anexo inválido.");
    }
    return { id: row.id, name: row.nome_arquivo, size: row.tamanho_bytes, mime: row.tipo_mime };
  });
}

export async function getNotes(): Promise<AcademicNote[]> {
  const result = await apiFetch<unknown>("anotacoes");
  const notes = unwrapList(result).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("A API retornou uma anotação em formato inválido.");
    const note = normalizeNote(item as Record<string, unknown>);
    if (!note.id) throw new Error("Uma anotação retornada pela API está sem identificador.");
    return note;
  });
  return Promise.all(notes.map(async (note) => ({ ...note, attachments: await getNoteAttachments(note.id) })));
}

export async function saveNote(note: Pick<AcademicNote, "title" | "body" | "courseId" | "eventId">, id?: string) {
  const path = id ? `anotacoes/${encodeURIComponent(id)}` : "anotacoes";
  const result = await apiFetch<Record<string, unknown>>(path, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({ titulo: note.title, corpo: note.body, disciplina_id: note.courseId, evento_id: note.eventId }),
  });
  return normalizeNote(result);
}

export async function deleteNote(id: string) {
  await apiFetch<void>(`anotacoes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function uploadNoteAttachment(noteId: string, file: File) {
  const form = new FormData();
  form.append("anotacao_id", noteId);
  form.append("arquivo", file);
  return apiFetch<unknown>("anexos/upload", { method: "POST", body: form });
}

export async function downloadNoteAttachment(id: string): Promise<Blob> {
  return apiDownload(`anexos/${encodeURIComponent(id)}/download`);
}

export async function deleteNoteAttachment(id: string): Promise<void> {
  await apiFetch<void>(`anexos/${encodeURIComponent(id)}`, { method: "DELETE" });
}
