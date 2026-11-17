import { apiFetch } from "./api";

export type EventType = "prova" | "trabalho" | "apresentacao" | "aula" | "evento";
export type AcademicEvent = {
  id: string;
  title: string;
  type: string;
  start: string;
  end: string | null;
  courseId: string | null;
  reminderMinutes: number[];
  reminderActive: boolean;
  cancelled: boolean;
  academic?: boolean;
};
export type EventInput = Omit<AcademicEvent, "id" | "academic">;

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("A API retornou uma lista de eventos inválida.");
  }
  return value as Record<string, unknown>[];
}

function eventFromApi(row: Record<string, unknown>): AcademicEvent {
  if (typeof row.id !== "string" || typeof row.titulo !== "string" || typeof row.tipo !== "string"
      || typeof row.inicio !== "string" || !Array.isArray(row.antecedencias_minutos)
      || typeof row.cancelado !== "boolean" || typeof row.lembrete_ativo !== "boolean") {
    throw new Error("A API retornou um evento inválido.");
  }
  return {
    id: row.id, title: row.titulo, type: row.tipo, start: row.inicio,
    end: typeof row.fim === "string" ? row.fim : null,
    courseId: typeof row.disciplina_id === "string" ? row.disciplina_id : null,
    reminderMinutes: row.antecedencias_minutos.map(Number),
    reminderActive: row.lembrete_ativo, cancelled: row.cancelado,
  };
}

function calendarFromApi(row: Record<string, unknown>): AcademicEvent {
  if (typeof row.id !== "string" || typeof row.data !== "string"
      || typeof row.tipo !== "string" || typeof row.descricao !== "string") {
    throw new Error("A API retornou uma data acadêmica inválida.");
  }
  return { id: `calendar-${row.id}`, title: row.descricao, type: row.tipo,
    start: row.data.slice(0, 10), end: null, courseId: null,
    reminderMinutes: [], reminderActive: false, cancelled: false, academic: true };
}

function body(event: EventInput) {
  return {
    titulo: event.title, tipo: event.type, inicio: event.start, fim: event.end,
    disciplina_id: event.courseId, antecedencias_minutos: event.reminderMinutes,
    lembrete_ativo: event.reminderActive, cancelado: event.cancelled,
  };
}

export async function getEvents(): Promise<AcademicEvent[]> {
  return rows(await apiFetch<unknown>("eventos")).map(eventFromApi);
}

export async function getAcademicCalendar(): Promise<AcademicEvent[]> {
  return rows(await apiFetch<unknown>("calendario-academico")).map(calendarFromApi);
}

export async function createEvent(event: EventInput): Promise<AcademicEvent> {
  return eventFromApi(await apiFetch<Record<string, unknown>>("eventos", { method: "POST", body: JSON.stringify(body(event)) }));
}

export async function updateEvent(id: string, event: EventInput): Promise<AcademicEvent> {
  return eventFromApi(await apiFetch<Record<string, unknown>>(`eventos/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body(event)) }));
}

export async function deleteEvent(id: string): Promise<void> {
  await apiFetch<void>(`eventos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function localDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function occursOnDay(event: AcademicEvent, day: string): boolean {
  const start = localDay(event.start);
  const end = event.end ? localDay(event.end) : start;
  return Boolean(start && end && start <= day && day <= end);
}

export function filterEventsForSemester<T extends { id: string }>(
  events: AcademicEvent[],
  semester: { id: string; data_inicio?: string | null; data_fim?: string | null } | null,
  courses: T[],
) {
  if (!semester) return events;
  const courseIds = new Set(courses.map((course) => course.id));
  return events.filter((event) => {
    if (event.courseId && !courseIds.has(event.courseId)) return false;
    const start = localDay(event.start);
    const end = event.end ? localDay(event.end) : start;
    return Boolean(start && end && (!semester.data_inicio || end >= semester.data_inicio.slice(0, 10))
      && (!semester.data_fim || start <= semester.data_fim.slice(0, 10)));
  });
}
