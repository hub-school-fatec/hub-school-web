import { apiFetch } from "./api";
import { getCourses, getCourseSchedules, saveCourse, type Course, type CourseSchedule } from "./courses";
import { activateSemester, createSemester, getSemesters, type Semester } from "./semesters";
import { getTeachers, saveTeacher, type Teacher } from "./teachers";

export type OnboardingCourse = {
  id?: string;
  name: string;
  code: string;
  hours: string;
  totalClasses: string;
  schedule: CourseSchedule[];
};

export type OnboardingTeacher = {
  name: string;
  email: string;
  phone: string;
  courseCode: string;
};

export type OnboardingData = {
  semester: string;
  startDate: string;
  endDate: string;
  courses: OnboardingCourse[];
  teachers: OnboardingTeacher[];
};

export function validateOnboarding(data: OnboardingData): string | null {
  if (!data.semester.trim() || !data.startDate || !data.endDate || data.endDate < data.startDate) {
    return "Informe o nome e um período válido para o semestre.";
  }
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  for (const course of data.courses) {
    const hours = Number(course.hours);
    const total = Number(course.totalClasses);
    if (!course.name.trim() || !course.code.trim() || !Number.isFinite(hours) || hours <= 0
        || !Number.isInteger(total) || total <= 0) {
      return "Cada disciplina precisa de nome, sigla, carga horária e total de aulas válidos.";
    }
    const key = course.code.trim().toLocaleLowerCase();
    const name = course.name.trim().toLocaleLowerCase();
    if (seen.has(key) || seenNames.has(name)) return "Há disciplinas repetidas no formulário.";
    seen.add(key);
    seenNames.add(name);
    const slots = new Set<string>();
    for (const row of course.schedule) {
      const slot = `${row.day}/${row.start}`;
      if (!/^[1-7]$/.test(row.day) || !/^\d{2}:\d{2}$/.test(row.start)
          || !/^\d{2}:\d{2}$/.test(row.end) || row.end <= row.start || !row.room?.trim()) {
        return "Confira o dia, os horários e a sala de cada aula.";
      }
      if (slots.has(slot)) return "Há horários repetidos para uma disciplina.";
      slots.add(slot);
    }
  }
  const teacherEmails = new Set<string>();
  for (const teacher of data.teachers) {
    if (!teacher.name.trim() && !teacher.email.trim() && !teacher.phone.trim() && !teacher.courseCode) continue;
    if (!teacher.name.trim() || !/^[^@\s]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(teacher.email.trim())) {
      return "Cada docente informado precisa de nome e e-mail válido.";
    }
    const email = teacher.email.trim().toLocaleLowerCase();
    if (teacherEmails.has(email)) return "Há docentes com o mesmo e-mail no formulário.";
    teacherEmails.add(email);
    if (teacher.courseCode && !data.courses.some((course) => course.code === teacher.courseCode)) {
      return "Selecione uma disciplina cadastrada para o docente.";
    }
  }
  return null;
}

export async function loadOnboarding(): Promise<OnboardingData | null> {
  const semesters = await getSemesters();
  const current = semesters.find((semester) => semester.ativo) ?? (semesters.length === 1 ? semesters[0] : undefined);
  if (!current) return null;
  const [allCourses, allTeachers] = await Promise.all([getCourses(), getTeachers()]);
  const courses = allCourses.filter((course) => course.semesterId === current.id);
  return {
    semester: current.nome, startDate: current.data_inicio ?? "", endDate: current.data_fim ?? "",
    courses: courses.map((course) => ({ id: course.id, name: course.name, code: course.code,
      hours: String(course.workloadHours ?? ""), totalClasses: String(course.totalClasses ?? ""),
      schedule: course.schedule.map((row) => ({ ...row, day: String(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].indexOf(row.day) + 1) })) })),
    teachers: allTeachers.map((teacher) => ({ name: teacher.name, email: teacher.email, phone: teacher.phone,
        courseCode: courses.find((course) => course.teacherId === teacher.id)?.code ?? "" })),
  };
}

async function ensureSemester(data: OnboardingData): Promise<Semester> {
  const semesters = await getSemesters();
  const existing = semesters.find((item) => item.nome === data.semester.trim());
  if (existing) {
    if (existing.data_inicio !== data.startDate || existing.data_fim !== data.endDate) {
      throw new Error("Já existe um semestre com esse nome e datas diferentes. Confira os dados antes de continuar.");
    }
    if (existing.ativo) return existing;
    if (semesters.some((item) => item.ativo)) {
      throw new Error("Há outro semestre ativo. Selecione o semestre desejado no painel antes de continuar.");
    }
    const updated = await activateSemester(existing.id);
    const active = updated.find((item) => item.id === existing.id && item.ativo);
    if (!active) throw new Error("A ativação do semestre não foi confirmada.");
    return active;
  }
  if (semesters.some((item) => item.ativo)) {
    throw new Error("Já existe um semestre ativo. Configure outro semestre pelo painel.");
  }
  return createSemester({ nome: data.semester.trim(), data_inicio: data.startDate, data_fim: data.endDate });
}

async function ensureCourse(semesterId: string, draft: OnboardingCourse, existing: Course[]): Promise<Course> {
  const matches = existing.filter((course) => course.semesterId === semesterId
    && (course.id === draft.id || course.name === draft.name.trim() || course.code === draft.code.trim()));
  if (matches.length > 1) throw new Error("Disciplina ambígua no semestre. Confira no painel.");
  const found = matches[0];
  if (found) {
    if (found.name !== draft.name.trim() || found.code !== draft.code.trim()
        || Number(found.workloadHours) !== Number(draft.hours)
        || found.totalClasses !== Number(draft.totalClasses)) {
      throw new Error("A disciplina já existe com dados diferentes. Confira no painel antes de continuar.");
    }
    return found;
  }
  return saveCourse({ semestre_id: semesterId, docente_id: null, nome: draft.name.trim(),
    sigla: draft.code.trim(), carga_horaria_h: Number(draft.hours), total_aulas: Number(draft.totalClasses),
    frequencia_minima: 75, media_minima: 6 });
}

async function ensureSchedules(courseId: string, desired: CourseSchedule[]): Promise<void> {
  const existing = await getCourseSchedules(courseId);
  for (const row of desired) {
    const found = existing.find((item) => item.day === ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][Number(row.day)] && item.start === row.start);
    if (found) {
      if (found.end !== row.end || found.room !== row.room?.trim()
          || (found.classesCount ?? 1) !== (row.classesCount ?? 1)) {
        throw new Error("Um horário existente tem dados diferentes. Confira no painel antes de continuar.");
      }
      continue;
    }
    await apiFetch("horarios-aula", { method: "POST", body: JSON.stringify({
      disciplina_id: courseId, dia_semana: Number(row.day), hora_inicio: row.start,
      hora_fim: row.end, sala: row.room?.trim(), aulas_no_dia: row.classesCount ?? 1,
    }) });
  }
}

async function ensureTeacher(draft: OnboardingTeacher, existing: Teacher[]): Promise<Teacher> {
  const matches = existing.filter((teacher) => teacher.email.toLocaleLowerCase() === draft.email.trim().toLocaleLowerCase());
  if (matches.length > 1) throw new Error("Docente ambíguo. Confira no painel.");
  if (matches[0]) {
    if (matches[0].name !== draft.name.trim()) throw new Error("O e-mail já pertence a um docente com nome diferente.");
    return matches[0];
  }
  return saveTeacher({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
    observations: "", courseIds: [] }, []);
}

export async function finishOnboarding(data: OnboardingData, report: (step: string) => void): Promise<void> {
  const validationError = validateOnboarding(data);
  if (validationError) throw new Error(validationError);
  report("Salvando semestre");
  const semester = await ensureSemester(data);
  const knownCourses = await getCourses();
  for (const draft of data.courses) {
    report(`Salvando disciplina ${draft.code}`);
    const course = await ensureCourse(semester.id, draft, knownCourses);
    if (!knownCourses.some((item) => item.id === course.id)) knownCourses.push(course);
    report(`Salvando horários de ${draft.code}`);
    await ensureSchedules(course.id, draft.schedule);
  }
  const knownTeachers = await getTeachers();
  for (const draft of data.teachers) {
    if (!draft.name.trim() && !draft.email.trim() && !draft.phone.trim() && !draft.courseCode) continue;
    report("Salvando docente");
    const teacher = await ensureTeacher(draft, knownTeachers);
    if (!knownTeachers.some((item) => item.id === teacher.id)) knownTeachers.push(teacher);
    if (draft.courseCode) {
      const course = knownCourses.find((item) => item.semesterId === semester.id && item.code === draft.courseCode);
      if (!course) throw new Error("Disciplina do docente não encontrada.");
      if (course.teacherId && course.teacherId !== teacher.id) {
        throw new Error("A disciplina já está vinculada a outro docente. Confira no painel.");
      }
      if (course.teacherId !== teacher.id) {
        report("Vinculando docente à disciplina");
        await apiFetch(`disciplinas/${encodeURIComponent(course.id)}`, {
          method: "PATCH", body: JSON.stringify({ docente_id: teacher.id }),
        });
      }
    }
  }
  report("Conferindo dados salvos");
  const [semesters, courses, teachers] = await Promise.all([getSemesters(), getCourses(), getTeachers()]);
  if (!semesters.some((item) => item.id === semester.id && item.ativo)
      || data.courses.some((draft) => !courses.some((item) => item.semesterId === semester.id && item.name === draft.name.trim() && item.code === draft.code.trim()
        && draft.schedule.every((row) => item.schedule.some((saved) => saved.day === ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][Number(row.day)] && saved.start === row.start && saved.end === row.end && saved.room === row.room?.trim() && (saved.classesCount ?? 1) === (row.classesCount ?? 1)))))
      || data.teachers.some((draft) => draft.name.trim() && !teachers.some((item) => item.email.toLocaleLowerCase() === draft.email.trim().toLocaleLowerCase()))
      || data.teachers.some((draft) => draft.courseCode && !courses.some((course) => course.semesterId === semester.id
        && course.code === draft.courseCode && teachers.some((teacher) => teacher.id === course.teacherId
          && teacher.email.toLocaleLowerCase() === draft.email.trim().toLocaleLowerCase())))) {
    throw new Error("Não foi possível confirmar todos os dados salvos. Confira o painel antes de repetir.");
  }
}
