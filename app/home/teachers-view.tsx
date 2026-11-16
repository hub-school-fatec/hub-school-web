"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Course } from "../../lib/courses";
import type { Teacher } from "../../lib/teachers";
import { deleteTeacher, saveTeacher } from "../../lib/teachers";

const demoTeachersKey = "hub-school-demo-teachers";

type TeachersViewProps = {
  teachers: Teacher[];
  courses: Course[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  demoMode: boolean;
  onAddCourse: (teacherName: string, onCreated: (courseId: string) => void) => void;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function buildDemoTeachers(courses: Course[]): Teacher[] {
  const grouped = new Map<string, { name: string; courses: Course[] }>();
  courses.filter((course) => course.teacher.trim()).forEach((course) => {
    const key = course.teacher.trim().toLocaleLowerCase();
    const group = grouped.get(key) ?? { name: course.teacher.trim(), courses: [] };
    group.courses.push(course);
    grouped.set(key, group);
  });
  return Array.from(grouped.values()).map((group, index) => ({
    id: group.courses.find((course) => course.teacherId)?.teacherId || `demo-teacher-${index}`,
    name: group.name,
    email: "",
    phone: "",
    observations: "",
    courseIds: group.courses.map((course) => course.id),
    courseNames: group.courses.map((course) => course.name),
  }));
}

export default function TeachersView({ teachers, courses, loading, error, onRetry, onReload, demoMode, onAddCourse }: TeachersViewProps & { onReload: () => void }) {
  const [demoTeachers, setDemoTeachers] = useState<Teacher[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const teacherFormRef = useRef<HTMLFormElement>(null);
  const visibleTeachers = demoMode ? demoTeachers ?? buildDemoTeachers(courses) : teachers;

  /* eslint-disable react-hooks/set-state-in-effect -- restore demo teacher entries from local storage. */
  useEffect(() => {
    if (!demoMode) return;
    try {
      const saved = window.localStorage.getItem(demoTeachersKey);
      if (saved) setDemoTeachers(JSON.parse(saved) as Teacher[]);
    } catch {
      window.localStorage.removeItem(demoTeachersKey);
    }
  }, [demoMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function openTeacherEditor(teacher: Teacher | null = null) {
    setEditing(teacher);
    setSelectedCourseIds(teacher?.courseIds ?? courses.filter((course) => course.teacherId === teacher?.id || (teacher && course.teacher.toLocaleLowerCase() === teacher.name.toLocaleLowerCase())).map((course) => course.id));
    setFormError("");
    setEditorOpen(true);
  }

  async function submitTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      phone: String(form.get("phone")).trim(),
      observations: String(form.get("observations")).trim(),
      courseIds: form.getAll("courseIds").map(String),
    };
    if (!input.name) { setFormError("Informe o nome do professor."); return; }
    setSaving(true);
    setFormError("");
    try {
      if (demoMode) {
        const base = demoTeachers ?? buildDemoTeachers(courses);
        const updated: Teacher = { id: editing?.id ?? `demo-teacher-${crypto.randomUUID()}`, ...input, courseNames: input.courseIds.map((id) => courses.find((course) => course.id === id)?.name ?? "").filter(Boolean) };
        const next = editing ? base.map((teacher) => teacher.id === editing.id ? updated : teacher) : [updated, ...base];
        setDemoTeachers(next);
        window.localStorage.setItem(demoTeachersKey, JSON.stringify(next));
      } else {
        await saveTeacher(input, editing?.id);
        onReload();
      }
      setEditorOpen(false);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o professor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeacher(teacher: Teacher) {
    if (!window.confirm(`Excluir o contato de ${teacher.name}?`)) return;
    try {
      if (demoMode) {
        const next = (demoTeachers ?? buildDemoTeachers(courses)).filter((item) => item.id !== teacher.id);
        setDemoTeachers(next);
        window.localStorage.setItem(demoTeachersKey, JSON.stringify(next));
      } else {
        await deleteTeacher(teacher.id);
        onReload();
      }
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o professor.");
    }
  }

  return <div className="teachers-view">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> PROFESSORES</div><h1>Seus professores</h1><p className="welcome-copy">Informações de contato e disciplinas vinculadas.</p></div><button className="primary-button" type="button" onClick={() => openTeacherEditor()}><span>＋</span> Novo professor</button></div>
    <section className="panel teachers-panel" aria-labelledby="teachers-heading">
      <div className="panel-heading"><div><h3 id="teachers-heading">Professores</h3><p>{loading ? "Carregando professores…" : `${visibleTeachers.length} ${visibleTeachers.length === 1 ? "professor encontrado" : "professores encontrados"}`}</p></div><span className="discipline-count">{loading ? "…" : String(visibleTeachers.length).padStart(2, "0")}</span></div>
      {actionError && <div className="course-list-state course-list-error" role="alert">{actionError}</div>}
      {loading ? <div className="course-list-state" role="status" aria-live="polite">Carregando os professores da sua conta…</div>
        : error ? <div className="course-list-state course-list-error" role="alert"><b>Não foi possível carregar os professores.</b><span>{error}</span><button className="outline-button" type="button" onClick={onRetry}>Tentar novamente</button></div>
          : visibleTeachers.length === 0 ? <div className="all-disciplines-empty"><b>Nenhum professor cadastrado</b><span>{demoMode ? "Os professores associados às disciplinas aparecerão aqui." : "Ainda não há professores associados à sua conta."}</span></div>
            : <div className="teacher-grid">{visibleTeachers.map((teacher) => {
              const normalizedName = teacher.name.trim().toLocaleLowerCase();
              const associatedCourses = courses.filter((course) =>
                (course.teacherId && course.teacherId === teacher.id)
                || teacher.courseIds.includes(course.id)
                || (course.teacher.trim() && course.teacher.trim().toLocaleLowerCase() === normalizedName),
              );
              const courseNames = Array.from(new Set([
                ...teacher.courseNames,
                ...associatedCourses.map((course) => course.name),
              ]));

              return <article className="teacher-card" key={teacher.id}>
                <div className="teacher-card-heading"><span className="teacher-avatar">{initials(teacher.name)}</span><div><h4>{teacher.name}</h4><span>Professor(a)</span></div><div className="teacher-actions"><button type="button" onClick={() => openTeacherEditor(teacher)}>Editar</button><button type="button" onClick={() => void removeTeacher(teacher)}>Excluir</button></div></div>
                {(teacher.email || teacher.phone) && <div className="teacher-contact-list">
                  {teacher.email && <a href={`mailto:${teacher.email}`}><span aria-hidden="true">✉</span>{teacher.email}</a>}
                  {teacher.phone && <a href={`tel:${teacher.phone.replace(/[^\d+]/g, "")}`}><span aria-hidden="true">☎</span>{teacher.phone}</a>}
                </div>}
                <div className="teacher-course-section"><span className="teacher-course-label">DISCIPLINAS</span>{courseNames.length ? <ul>{courseNames.map((name) => <li key={name}>{name}</li>)}</ul> : <p>Nenhuma disciplina vinculada.</p>}{teacher.observations && <div className="teacher-observations"><span>OBSERVAÇÕES</span><p>{teacher.observations}</p></div>}</div>
              </article>;
            })}</div>}
    </section>
    {editorOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form ref={teacherFormRef} className="modal teacher-editor" onSubmit={submitTeacher}><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setEditorOpen(false)}>×</button><span className="eyebrow">CONTATOS</span><h2>{editing ? "Editar professor" : "Novo professor"}</h2><p>Guarde contatos e associe este professor às disciplinas.</p><label>Nome<input name="name" required maxLength={100} defaultValue={editing?.name ?? ""} placeholder="Nome do professor"/></label><label>E-mail<input name="email" type="email" defaultValue={editing?.email ?? ""} placeholder="nome@fatec.sp.gov.br"/></label><label>Telefone / WhatsApp<input name="phone" type="tel" defaultValue={editing?.phone ?? ""} placeholder="(00) 00000-0000"/></label><label>Observações<textarea name="observations" rows={3} defaultValue={editing?.observations ?? ""} placeholder="Informações úteis sobre o contato"/></label><div className="teacher-course-field"><div className="teacher-course-field-heading"><span>Disciplinas associadas</span>{demoMode && <button type="button" className="outline-button" onClick={() => { const form = teacherFormRef.current; const teacherName = form ? String(new FormData(form).get("name") ?? "").trim() : ""; onAddCourse(teacherName, (courseId) => setSelectedCourseIds((current) => current.includes(courseId) ? current : [...current, courseId])); }}>{"+"} Adicionar mais uma disciplina</button>}</div><select name="courseIds" multiple value={selectedCourseIds} onChange={(event) => setSelectedCourseIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select><small>Use Ctrl (Windows) ou Command (Mac) para selecionar mais de uma.</small></div>{formError && <div className="profile-feedback" role="alert">{formError}</div>}<div className="modal-actions"><button className="subtle-button" type="button" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar professor"}</button></div></form></div>}
  </div>;
}
