import { apiFetch } from "./api";

export type EventType = "prova" | "trabalho" | "apresentacao" | "aula" | "evento";
export type AcademicEventType = EventType | "feriado" | "semana_provas" | "inicio" | "fim";
export type AcademicEvent = {
  id: string;
  title: string;
  type: AcademicEventType;
  start: string;
  end: string;
  courseId: string | null;
  reminderDays: number[];
  notificationChannel?: "email" | "push";
};

function valueString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function normalizeEvent(value: Record<string, unknown>, academic = false): AcademicEvent {
  const start = value.inicio ?? value.data ?? value.start;
  const end = value.fim ?? value.end ?? start;
  const reminders = value.lembretes_dias_antes ?? value.reminderDays;
  const type = value.tipo ?? value.type;
  return {
    id: valueString(value.id ?? value.uuid) || `${academic ? "cal" : "evt"}-${valueString(start)}-${valueString(value.titulo ?? value.descricao)}`,
    title: valueString(value.titulo ?? value.descricao ?? value.title) || "Evento sem título",
    type: (valueString(type) || (academic ? "evento" : "evento")) as AcademicEventType,
    start: valueString(start),
    end: valueString(end),
    courseId: valueString(value.disciplina_id ?? value.courseId) || null,
    reminderDays: Array.isArray(reminders) ? reminders.map(Number).filter(Number.isFinite) : [],
    notificationChannel: value.canal === "push" || value.notificationChannel === "push" ? "push" : "email",
  };
}

function unwrapList(result: unknown, keys: string[]) {
  let value = result;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const wrapper = value as Record<string, unknown>;
    value = keys.map((key) => wrapper[key]).find((item) => item !== undefined) ?? wrapper.data ?? wrapper.items;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      value = keys.map((key) => nested[key]).find((item) => item !== undefined) ?? nested.items;
    }
  }
  if (!Array.isArray(value)) throw new Error("A resposta da API não contém uma lista de eventos.");
  return value;
}

export async function getEvents() {
  const result = await apiFetch<unknown>("eventos");
  return unwrapList(result, ["eventos"]).map((event) => normalizeEvent(event as Record<string, unknown>));
}

export async function getAcademicCalendar() {
  const result = await apiFetch<unknown>("calendario-academico");
  return unwrapList(result, ["calendario_academico", "eventos", "calendario"]).map((event) => normalizeEvent(event as Record<string, unknown>, true));
}

export async function createEvent(event: Omit<AcademicEvent, "id">) {
  const result = await apiFetch<Record<string, unknown>>("eventos", {
    method: "POST",
    body: JSON.stringify({
      titulo: event.title,
      tipo: event.type,
      inicio: event.start,
      fim: event.end,
      disciplina_id: event.courseId,
      lembretes_dias_antes: event.reminderDays,
      canal: event.notificationChannel ?? "email",
    }),
  });
  return normalizeEvent(result);
}

export async function updateEvent(id: string, event: Omit<AcademicEvent, "id">) {
  const result = await apiFetch<Record<string, unknown> | undefined>(`eventos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      titulo: event.title,
      tipo: event.type,
      inicio: event.start,
      fim: event.end,
      disciplina_id: event.courseId,
      lembretes_dias_antes: event.reminderDays,
      canal: event.notificationChannel ?? "email",
    }),
  });
  return result && (result.id || result.uuid) ? normalizeEvent(result) : { ...event, id };
}
export function filterEventsForSemester<T extends { id: string }>(
  events: AcademicEvent[],
  semester: { id: string; data_inicio?: string | null; data_fim?: string | null } | null,
  courses: T[],
) {
  if (!semester) return events;
  const courseIds = new Set(courses.map((course) => course.id));
  const start = semester.data_inicio ? new Date(`${semester.data_inicio.slice(0, 10)}T00:00:00`).getTime() : null;
  const end = semester.data_fim ? new Date(`${semester.data_fim.slice(0, 10)}T23:59:59.999`).getTime() : null;
  return events.filter((event) => {
    if (event.courseId && !courseIds.has(event.courseId)) return false;
    const eventTime = new Date(event.start).getTime();
    if (Number.isNaN(eventTime)) return false;
    if (start !== null && eventTime < start) return false;
    if (end !== null && eventTime > end) return false;
    return true;
  });
}