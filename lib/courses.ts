import { apiFetch } from "./api";

export type CourseSchedule = { day: string; start: string; end: string };
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
  const workload = Number(firstValue(value, "carga_horaria", "cargaHoraria", "workloadHours"));
  const classesPerWeek = Number(firstValue(value, "aulas_semanais", "aulas_por_semana", "classesPerWeek"));
  const totalClasses = Number(firstValue(value, "total_aulas", "total_classes", "totalClasses"));
  const minimumAttendance = Number(firstValue(value, "frequencia_minima", "minimumAttendance"));
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
  };
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
  return payload.map((course) => {
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new Error("A API retornou uma disciplina em formato inv\u00e1lido.");
    }
    return normalizeCourse(course as ApiCourse);
  });
}

export async function updateCourseAttendanceSettings(courseId: string, totalClasses: number, minimumAttendance: number): Promise<void> {
  await apiFetch<void>(`disciplinas/${encodeURIComponent(courseId)}`, {
    method: "PATCH",
    body: JSON.stringify({ total_aulas: totalClasses, frequencia_minima: minimumAttendance }),
  });
}