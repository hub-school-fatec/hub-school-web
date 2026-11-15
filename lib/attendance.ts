import { apiFetch } from "./api";

export type AttendanceRecord = { id: string; date: string; classesCount: number; absences: number };

function normalizeRecord(value: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(value.id ?? value.uuid ?? ""),
    date: String(value.data ?? value.date ?? "").slice(0, 10),
    classesCount: Math.max(0, Number(value.aulas_no_dia ?? value.classesCount) || 0),
    absences: Math.max(0, Number(value.faltas ?? value.absences) || 0),
  };
}

export async function getAttendance(courseId: string): Promise<AttendanceRecord[]> {
  const result = await apiFetch<unknown>(`disciplinas/${encodeURIComponent(courseId)}/frequencias`);
  let payload = result;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const wrapper = payload as Record<string, unknown>;
    payload = wrapper.frequencias ?? wrapper.data ?? wrapper.items;
  }
  if (!Array.isArray(payload)) throw new Error("A resposta da API não contém registros de frequência.");
  return payload.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("A API retornou um registro de frequência inválido.");
    return normalizeRecord(record as Record<string, unknown>);
  });
}

export async function saveAttendance(courseId: string, record: Omit<AttendanceRecord, "id">, existingId?: string) {
  const basePath = `disciplinas/${encodeURIComponent(courseId)}/frequencias`;
  const path = existingId ? `${basePath}/${encodeURIComponent(existingId)}` : basePath;
  const result = await apiFetch<Record<string, unknown>>(path, {
    method: existingId ? "PATCH" : "POST",
    body: JSON.stringify({ data: record.date, aulas_no_dia: record.classesCount, faltas: record.absences }),
  });
  if (!result) return { ...record, id: existingId ?? `${courseId}-${record.date}` };
  return normalizeRecord(result);
}

export async function deleteAttendance(courseId: string, recordId: string): Promise<void> {
  const path = `disciplinas/${encodeURIComponent(courseId)}/frequencias/${encodeURIComponent(recordId)}`;
  await apiFetch<void>(path, { method: "DELETE" });
}