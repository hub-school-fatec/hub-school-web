import { apiFetch } from "./api";

export type AttendanceRecord = { id: string; date: string; classesCount: number; absences: number };

type ApiAttendanceRecord = {
  id: string;
  disciplina_id: string;
  data: string;
  aulas_no_dia: number;
  faltas: number;
};

function normalizeRecord(value: ApiAttendanceRecord, courseId: string): AttendanceRecord {
  if (value.disciplina_id !== courseId || !value.id || !/^\d{4}-\d{2}-\d{2}$/.test(value.data)
      || !Number.isInteger(value.aulas_no_dia) || value.aulas_no_dia <= 0
      || !Number.isInteger(value.faltas) || value.faltas < 0 || value.faltas > value.aulas_no_dia) {
    throw new Error("A API retornou um registro de frequência inválido.");
  }
  return {
    id: value.id,
    date: value.data,
    classesCount: value.aulas_no_dia,
    absences: value.faltas,
  };
}

export async function getAttendance(courseId: string): Promise<AttendanceRecord[]> {
  const result = await apiFetch<unknown>(`frequencias?disciplina_id=${encodeURIComponent(courseId)}`);
  if (!Array.isArray(result)) throw new Error("A resposta da API não contém registros de frequência.");
  return result.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("A API retornou um registro de frequência inválido.");
    return normalizeRecord(record as ApiAttendanceRecord, courseId);
  });
}

export async function saveAttendance(courseId: string, record: Omit<AttendanceRecord, "id">, existingId?: string) {
  const path = existingId ? `frequencias/${encodeURIComponent(existingId)}` : "frequencias";
  const result = await apiFetch<ApiAttendanceRecord>(path, {
    method: existingId ? "PATCH" : "POST",
    body: JSON.stringify({ ...(existingId ? {} : { disciplina_id: courseId }), data: record.date,
                           aulas_no_dia: record.classesCount, faltas: record.absences }),
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("A API retornou um registro de frequência inválido.");
  }
  return normalizeRecord(result, courseId);
}

export async function deleteAttendance(recordId: string): Promise<void> {
  await apiFetch<void>(`frequencias/${encodeURIComponent(recordId)}`, { method: "DELETE" });
}
