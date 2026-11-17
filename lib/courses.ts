import { apiFetch } from "./api";

export type CourseSchedule = { scheduleId?: string; day: string; start: string; end: string; room?: string; classesCount?: number };

const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function scheduleFromApi(value: unknown): CourseSchedule & { scheduleId: string; disciplineId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A API retornou um horário inválido.");
  const row = value as Record<string, unknown>;
  const day = Number(row.dia_semana);
  const start = String(row.hora_inicio ?? "").slice(0, 5);
  const end = String(row.hora_fim ?? "").slice(0, 5);
  if (typeof row.id !== "string" || typeof row.disciplina_id !== "string"
      || !Number.isInteger(day) || day < 1 || day > 7
      || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)
      || typeof row.sala !== "string" || !row.sala.trim()
      || !Number.isInteger(row.aulas_no_dia) || (row.aulas_no_dia as number) <= 0) {
    throw new Error("A API retornou um horário inválido.");
  }
  return { scheduleId: row.id, disciplineId: row.disciplina_id, day: days[day - 1], start, end,
    room: row.sala, classesCount: row.aulas_no_dia as number };
}

async function fetchSchedules(path: string) {
  const rows = await apiFetch<unknown>(path);
  if (!Array.isArray(rows)) throw new Error("A API não retornou uma lista de horários.");
  return rows.map(scheduleFromApi);
}

export async function getCourseSchedules(courseId: string): Promise<CourseSchedule[]> {
  const rows = await fetchSchedules(`horarios-aula?disciplina_id=${encodeURIComponent(courseId)}`);
  if (rows.some((row) => row.disciplineId !== courseId)) throw new Error("A API retornou horários de outra disciplina.");
  return rows;
}

export class ScheduleSaveError extends Error {
  constructor(public readonly step: string) {
    super(`A disciplina foi salva, mas falhou a etapa: ${step}. Confira os horários confirmados antes de tentar novamente.`);
  }
}

export async function saveCourseSchedules(courseId: string, desired: CourseSchedule[]): Promise<void> {
  let existing: CourseSchedule[];
  try { existing = await getCourseSchedules(courseId); }
  catch { throw new ScheduleSaveError("carregar horários"); }
  const currentIds = new Set(existing.map((row) => row.scheduleId));
  if (desired.some((row) => row.scheduleId && !currentIds.has(row.scheduleId))) throw new ScheduleSaveError("conferir horários existentes");

  const toBody = (row: CourseSchedule) => ({
    dia_semana: days.indexOf(row.day) + 1, hora_inicio: row.start, hora_fim: row.end,
    sala: row.room?.trim() ?? "", aulas_no_dia: row.classesCount ?? 1,
  });
  const desiredIds = new Set(desired.map((row) => row.scheduleId));
  for (const row of existing) {
    if (row.scheduleId && !desiredIds.has(row.scheduleId)) {
      try { await apiFetch<void>(`horarios-aula/${encodeURIComponent(row.scheduleId)}`, { method: "DELETE" }); }
      catch { throw new ScheduleSaveError("remover horário"); }
    }
  }
  for (const [index, row] of desired.entries()) {
    const body = toBody(row);
    if (row.scheduleId) {
      const previous = existing.find((item) => item.scheduleId === row.scheduleId);
      if (previous && JSON.stringify(toBody(previous)) === JSON.stringify(body)) continue;
      try { await apiFetch(`horarios-aula/${encodeURIComponent(row.scheduleId)}`, { method: "PATCH", body: JSON.stringify(body) }); }
      catch { throw new ScheduleSaveError(`atualizar horário ${index + 1}`); }
    } else {
      try { await apiFetch("horarios-aula", { method: "POST", body: JSON.stringify({ disciplina_id: courseId, ...body }) }); }
      catch { throw new ScheduleSaveError(`adicionar horário ${index + 1}`); }
    }
  }
}
export type Course = {
  id: string;
  semesterId?: string;
  name: string;
  code: string;
  teacher: string;
  teacherId?: string;
  schedule: CourseSchedule[];
  repeatWeekly: boolean;
  room: string;
  workloadHours?: number | null;
  classesPerWeek?: number | null;
  totalClasses?: number | null;
  minimumAttendance?: number | null;
  minimumGrade?: number | null;
};

type ApiSchedule = Record<string, unknown>;
type ApiCourse = Record<string, unknown>;

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function firstValue(record: ApiCourse, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeSchedule(value: unknown): CourseSchedule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((valueEntry: unknown) => {
    if (!valueEntry || typeof valueEntry !== "object") return [];
    const entry = valueEntry as ApiSchedule;
    const day = stringValue(firstValue(entry, "dia", "dia_semana", "day"));
    const start = stringValue(firstValue(entry, "inicio", "hora_inicio", "start"));
    const end = stringValue(firstValue(entry, "fim", "hora_fim", "end"));
    return day ? [{ day, start, end }] : [];
  });
}

function normalizeCourse(value: ApiCourse): Course {
  const teacher = firstValue(value, "docente", "professor", "teacher");
  const teacherName = typeof teacher === "object" && teacher !== null
    ? stringValue((teacher as Record<string, unknown>).nome ?? (teacher as Record<string, unknown>).name)
    : stringValue(teacher);
  const teacherId = typeof teacher === "object" && teacher !== null
    ? stringValue((teacher as Record<string, unknown>).id ?? (teacher as Record<string, unknown>).uuid)
    : stringValue(firstValue(value, "professor_id", "docente_id", "teacher_id"));
  const workload = Number(firstValue(value, "carga_horaria_h", "carga_horaria", "cargaHoraria", "workloadHours"));
  const classesPerWeek = Number(firstValue(value, "aulas_semanais", "aulas_por_semana", "classesPerWeek"));
  const totalClasses = Number(firstValue(value, "total_aulas", "total_classes", "totalClasses"));
  const minimumAttendance = Number(firstValue(value, "frequencia_minima", "minimumAttendance"));
  const minimumGrade = Number(firstValue(value, "media_minima", "minimumGrade"));
  const repeatWeekly = firstValue(value, "recorrente", "repetir_semanalmente", "repeatWeekly");
  const id = stringValue(firstValue(value, "id", "uuid"));
  if (!id) throw new Error("Uma disciplina retornada pela API está sem identificador.");

  return {
    id,
    semesterId: stringValue(firstValue(value, "semestre_id", "semesterId")) || undefined,
    name: stringValue(firstValue(value, "nome", "name", "nome_disciplina"), "Disciplina sem nome"),
    code: stringValue(firstValue(value, "sigla", "codigo", "code")),
    teacher: teacherName,
    teacherId,
    schedule: normalizeSchedule(firstValue(value, "horarios", "aulas", "schedule")),
    repeatWeekly: repeatWeekly === undefined ? true : repeatWeekly === true || repeatWeekly === "true",
    room: stringValue(firstValue(value, "sala", "room")),
    workloadHours: Number.isFinite(workload) ? workload : null,
    classesPerWeek: Number.isFinite(classesPerWeek) ? classesPerWeek : null,
    totalClasses: Number.isFinite(totalClasses) && totalClasses > 0 ? totalClasses : null,
    minimumAttendance: Number.isFinite(minimumAttendance) && minimumAttendance >= 0 && minimumAttendance <= 100 ? minimumAttendance : 75,
    minimumGrade: Number.isFinite(minimumGrade) && minimumGrade >= 0 && minimumGrade <= 10 ? minimumGrade : 6,
  };
}

export type CourseInput = {
  semestre_id: string;
  docente_id: string | null;
  nome: string;
  sigla: string;
  carga_horaria_h: number;
  total_aulas: number;
  frequencia_minima: number;
  media_minima: number;
};

export async function saveCourse(input: CourseInput, id?: string): Promise<Course> {
  const path = id ? `disciplinas/${encodeURIComponent(id)}` : "disciplinas";
  const result = await apiFetch<ApiCourse>(path, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
  const course = normalizeCourse(result);
  if (course.semesterId !== input.semestre_id || (id && course.id !== id)) {
    throw new Error("A API retornou uma disciplina incompatível com o semestre selecionado.");
  }
  return course;
}

export async function deleteCourseFromApi(id: string): Promise<void> {
  await apiFetch<void>(`disciplinas/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getCourses(): Promise<Course[]> {
  const result = await apiFetch<unknown>("disciplinas");
  let payload: unknown = result;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const wrapper = payload as Record<string, unknown>;
    payload = wrapper.disciplinas ?? wrapper.data ?? wrapper.items;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const nested = payload as Record<string, unknown>;
      payload = nested.disciplinas ?? nested.items;
    }
  }

  if (!Array.isArray(payload)) throw new Error("A resposta da API não contém uma lista de disciplinas.");
  const courses = payload.map((course) => {
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new Error("A API retornou uma disciplina em formato inv\u00e1lido.");
    }
    return normalizeCourse(course as ApiCourse);
  });
  const schedules = await fetchSchedules("horarios-aula");
  const byId = new Map(courses.map((course) => [course.id, course]));
  for (const schedule of schedules) {
    const course = byId.get(schedule.disciplineId);
    if (course) course.schedule.push(schedule);
  }
  return courses;
}

export async function updateCourseAttendanceSettings(courseId: string, totalClasses: number, minimumAttendance: number): Promise<void> {
  await apiFetch<void>(`disciplinas/${encodeURIComponent(courseId)}`, {
    method: "PATCH",
    body: JSON.stringify({ total_aulas: totalClasses, frequencia_minima: minimumAttendance }),
  });
}
