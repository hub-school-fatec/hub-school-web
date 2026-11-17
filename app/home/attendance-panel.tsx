"use client";

import { FormEvent, useEffect, useState } from "react";
import { type Course } from "../../lib/courses";
import { type Semester } from "../../lib/semesters";
import { deleteAttendance, getAttendance, saveAttendance, type AttendanceRecord } from "../../lib/attendance";

type Props = { courses: Course[]; semester: Semester | null; coursesLoading: boolean; onUpdateCourseSettings: (courseId: string, totalClasses: number, minimumAttendance: number) => Promise<void> };
type EntryState = { rows: AttendanceRecord[]; loading: boolean; error: string; saving: boolean };
type BatchLesson = { date: string; absent: boolean; scheduleIndex: number | null };
const demoStorageKey = "hub-school-attendance";

function readDemoRecords(): Record<string, AttendanceRecord[]> {
  try { return JSON.parse(localStorage.getItem(demoStorageKey) ?? "{}"); } catch { return {}; }
}
function writeDemoRecords(records: Record<string, AttendanceRecord[]>) { localStorage.setItem(demoStorageKey, JSON.stringify(records)); }
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function weekdayNumber(day: string): number | null {
  const normalized = day.trim().toLowerCase();
  const names: Record<string, number> = { seg: 1, segunda: 1, "segunda-feira": 1, ter: 2, terça: 2, terca: 2, "terça-feira": 2, "terca-feira": 2, qua: 3, quarta: 3, "quarta-feira": 3, qui: 4, quinta: 4, "quinta-feira": 4, sex: 5, sexta: 5, "sexta-feira": 5, sáb: 6, sab: 6, sábado: 6, sabado: 6, dom: 0, domingo: 0 };
  if (/^[1-7]$/.test(normalized)) return Number(normalized) % 7;
  return names[normalized] ?? null;
}
function dateForSchedule(scheduleDay: string, fromDate: string, inclusive: boolean): string | null {
  const targetDay = weekdayNumber(scheduleDay);
  if (targetDay === null) return null;
  const date = new Date(`${fromDate}T12:00:00`);
  let offset = (targetDay - date.getDay() + 7) % 7;
  if (!inclusive && offset === 0) offset = 7;
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function firstScheduledLesson(course: Course): BatchLesson {
  const choices = course.schedule.flatMap((schedule, scheduleIndex) => {
    const date = dateForSchedule(schedule.day, localToday(), true);
    return date ? [{ date, scheduleIndex }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.scheduleIndex - b.scheduleIndex);
  return choices.length ? { ...choices[0], absent: false } : { date: localToday(), absent: false, scheduleIndex: null };
}
function nextScheduledLesson(course: Course, lessons: BatchLesson[]): BatchLesson {
  if (!course.schedule.length) return { date: lessons[lessons.length - 1]?.date ?? localToday(), absent: false, scheduleIndex: null };
  const last = lessons[lessons.length - 1];
  const choices = course.schedule.flatMap((schedule, scheduleIndex) => {
    const date = dateForSchedule(schedule.day, last?.date ?? localToday(), !last);
    if (!date) return [];
    if (last && date === last.date && scheduleIndex <= (last.scheduleIndex ?? -1)) {
      const nextDate = dateForSchedule(schedule.day, last.date, false);
      return nextDate ? [{ date: nextDate, scheduleIndex }] : [];
    }
    return [{ date, scheduleIndex }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.scheduleIndex - b.scheduleIndex);
  return choices.length ? { ...choices[0], absent: false } : { date: last?.date ?? localToday(), absent: false, scheduleIndex: null };
}
function formatSchedule(schedule: Course["schedule"][number]) {
  return `${schedule.day}${schedule.start && schedule.end ? ` · ${schedule.start}–${schedule.end}` : schedule.start ? ` · ${schedule.start}` : ""}`;
}
export default function AttendancePanel({ courses, semester, coursesLoading, onUpdateCourseSettings }: Props) {
  const [states, setStates] = useState<Record<string, EntryState>>({});
  const [courseForEntry, setCourseForEntry] = useState<Course | null>(null);
  const [batchLessons, setBatchLessons] = useState<BatchLesson[]>([]);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ course: Course; record: AttendanceRecord } | null>(null);
  const [editedDate, setEditedDate] = useState("");
  const [editedLessons, setEditedLessons] = useState<boolean[]>([]);
  const [settingsCourseId, setSettingsCourseId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({ totalClasses: "", maxAbsences: "" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const demoMode = !process.env.NEXT_PUBLIC_API_URL;
  const courseIdKey = courses.map((course) => course.id).join("|");

  useEffect(() => {
    let cancelled = false;
    for (const courseId of courseIdKey ? courseIdKey.split("|") : []) {
      setStates((current) => ({ ...current, [courseId]: { ...(current[courseId] ?? { rows: [], loading: true, error: "", saving: false }), loading: true, error: "" } }));
      if (demoMode) {
        const rows = readDemoRecords()[courseId] ?? [];
        setStates((current) => ({ ...current, [courseId]: { rows, loading: false, error: "", saving: false } }));
      } else {
        void getAttendance(courseId).then((rows) => {
          if (!cancelled) setStates((current) => ({ ...current, [courseId]: { rows, loading: false, error: "", saving: false } }));
        }).catch((error: unknown) => {
          if (!cancelled) setStates((current) => ({ ...current, [courseId]: { rows: [], loading: false, error: error instanceof Error ? error.message : "Falha ao carregar presen?as.", saving: false } }));
        });
      }
    }
    return () => { cancelled = true; };
  }, [courseIdKey, demoMode]);

  function openEntry(course: Course) {
    setCourseForEntry(course);
    setBatchLessons([firstScheduledLesson(course)]);
  }
  function setSaving(courseId: string, saving: boolean) { setStates((current) => ({ ...current, [courseId]: { ...(current[courseId] ?? { rows: [], loading: false, error: "" }), saving } as EntryState })); }
  function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!courseForEntry) return;
    void persistBatch(courseForEntry, batchLessons);
  }
  async function persistBatch(course: Course, lessons: Array<{ date: string; absent: boolean }>) {
    if (!lessons.length || lessons.some((lesson) => !lesson.date)) return;
    setSaving(course.id, true);
    try {
      const grouped = new Map<string, { classesCount: number; absences: number }>();
      for (const lesson of lessons) {
        const group = grouped.get(lesson.date) ?? { classesCount: 0, absences: 0 };
        group.classesCount += 1;
        if (lesson.absent) group.absences += 1;
        grouped.set(lesson.date, group);
      }
      let nextRows = [...(states[course.id]?.rows ?? [])];
      for (const [lessonDate, group] of grouped) {
        const existing = nextRows.find((row) => row.date === lessonDate);
        const record = {
          date: lessonDate,
          classesCount: group.classesCount + (existing?.classesCount ?? 0),
          absences: group.absences + (existing?.absences ?? 0),
        };
        let saved: AttendanceRecord;
        if (demoMode) {
          saved = { ...record, id: existing?.id ?? `${course.id}-${lessonDate}` };
          const all = readDemoRecords();
          const courseRows = all[course.id] ?? [];
          all[course.id] = existing ? courseRows.map((row) => row.id === existing.id ? saved : row) : [...courseRows, saved];
          writeDemoRecords(all);
        } else saved = await saveAttendance(course.id, record, existing?.id);
        nextRows = [...nextRows.filter((row) => row.id !== (existing?.id ?? saved.id)), saved];
      }
      setStates((current) => ({ ...current, [course.id]: { rows: nextRows.sort((a, b) => a.date.localeCompare(b.date)), loading: false, error: "", saving: false } }));
      setCourseForEntry(null);
    } catch (error) {
      setStates((current) => ({ ...current, [course.id]: { ...(current[course.id] ?? { rows: [], loading: false, saving: false }), loading: false, error: error instanceof Error ? error.message : "Não foi possível salvar as aulas.", saving: false } as EntryState }));
    }
  }
  function openRecordEditor(course: Course, record: AttendanceRecord) {
    setEditingRecord({ course, record });
    setEditedDate(record.date);
    setEditedLessons(Array.from({ length: record.classesCount }, (_, index) => index < record.absences));
  }
  async function saveEditedRecord() {
    if (!editingRecord || !editedDate || !editedLessons.length) return;
    const { course, record } = editingRecord;
    setSaving(course.id, true);
    const updated = { date: editedDate, classesCount: editedLessons.length, absences: editedLessons.filter(Boolean).length };
    try {
      let saved: AttendanceRecord;
      if (demoMode) {
        saved = { ...updated, id: record.id };
        const all = readDemoRecords();
        all[course.id] = (all[course.id] ?? []).map((item) => item.id === record.id ? saved : item);
        writeDemoRecords(all);
      } else saved = await saveAttendance(course.id, updated, record.id);
      setStates((current) => ({ ...current, [course.id]: { rows: [...(current[course.id]?.rows ?? []).filter((item) => item.id !== record.id), saved].sort((a, b) => a.date.localeCompare(b.date)), loading: false, error: "", saving: false } }));
      setEditingRecord(null);
    } catch (error) {
      setStates((current) => ({ ...current, [course.id]: { ...(current[course.id] ?? { rows: [], loading: false, saving: false }), loading: false, error: error instanceof Error ? error.message : "Nao foi possivel atualizar as aulas registradas.", saving: false } as EntryState }));
    }
  }

  async function deleteEditedRecord() {
    if (!editingRecord) return;
    const { course, record } = editingRecord;
    const dateLabel = new Date(`${record.date}T12:00:00`).toLocaleDateString("pt-BR");
    if (!window.confirm(`Excluir o registro de aulas de ${dateLabel}?`)) return;
    setSaving(course.id, true);
    try {
      if (demoMode) {
        const all = readDemoRecords();
        all[course.id] = (all[course.id] ?? []).filter((item) => item.id !== record.id);
        writeDemoRecords(all);
      } else await deleteAttendance(record.id);
      setStates((current) => ({ ...current, [course.id]: { ...(current[course.id] ?? { rows: [], loading: false, error: "", saving: false }), rows: (current[course.id]?.rows ?? []).filter((item) => item.id !== record.id), loading: false, error: "", saving: false } }));
      setEditingRecord(null);
    } catch (error) {
      setStates((current) => ({ ...current, [course.id]: { ...(current[course.id] ?? { rows: [], loading: false, saving: false }), loading: false, error: error instanceof Error ? error.message : "Não foi possível excluir o registro.", saving: false } as EntryState }));
    }
  }
  function openSettings(course: Course) {
    const total = course.totalClasses ?? 0;
    const minimum = course.minimumAttendance ?? 75;
    setSettingsDraft({ totalClasses: total ? String(total) : "", maxAbsences: total ? String(Math.floor(total * (100 - minimum) / 100)) : "" });
    setSettingsError("");
    setSettingsCourseId(course.id);
  }
  async function saveSettings(course: Course) {
    const total = Number(settingsDraft.totalClasses);
    const maxAbsences = Number(settingsDraft.maxAbsences);
    if (!Number.isInteger(total) || total < 1 || !Number.isInteger(maxAbsences) || maxAbsences < 0 || maxAbsences > total) {
      setSettingsError("Informe o total de aulas e um limite de faltas entre zero e esse total.");
      return;
    }
    let minimumAttendance = Number((100 - maxAbsences * 100 / total).toFixed(2));
    while (Math.floor(total * (100 - minimumAttendance) / 100) < maxAbsences && minimumAttendance > 0) {
      minimumAttendance = Math.max(0, Number((minimumAttendance - 0.01).toFixed(2)));
    }
    setSettingsSaving(true);
    setSettingsError("");
    try {
      await onUpdateCourseSettings(course.id, total, minimumAttendance);
      setSettingsCourseId(null);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Não foi possível salvar os limites de faltas.");
    } finally {
      setSettingsSaving(false);
    }
  }
  return <section className="panel attendance-panel" aria-labelledby="attendance-title">
    <div className="panel-heading"><div><div className="eyebrow">PRESENÇA E FALTAS</div><h3 id="attendance-title">Acompanhamento das aulas</h3><p>Registre aulas individualmente ou em lote, cada uma em sua data.</p></div><span className="discipline-count">{courses.length}</span></div>
    {coursesLoading ? <div className="course-list-state" role="status">Carregando disciplinas…</div> : !semester ? <div className="course-list-state">Selecione um semestre para acompanhar as aulas.</div> : !courses.length ? <div className="course-list-state">Adicione disciplinas ao semestre para começar o acompanhamento.</div> : <div className="attendance-grid">{courses.map((course, index) => {
      const state = states[course.id] ?? { rows: [], loading: true, error: "", saving: false };
      const total = course.totalClasses ?? null;
      const held = state.rows.reduce((sum, row) => sum + row.classesCount, 0); const absences = state.rows.reduce((sum, row) => sum + row.absences, 0);
      const minimumAttendance = course.minimumAttendance ?? 75;
      const allowed = total ? Math.floor(total * (100 - minimumAttendance) / 100) : null; const remaining = allowed === null ? null : Math.max(0, allowed - absences);
      const percent = held ? Math.round(((held - absences) / held) * 100) : 100;
      return <article className={`attendance-card ${allowed !== null && absences > allowed ? "attendance-danger" : allowed !== null && allowed > 0 && absences >= allowed * .8 ? "attendance-warning" : ""}`} key={course.id}>
        <div className="attendance-card-heading"><span className={`course-monogram tone-${index % 4}`}>{course.code.slice(0, 2).toUpperCase()}</span><div><small className="attendance-course-code">{course.code}</small><b>{course.name}</b></div></div>
        {state.loading ? <p className="attendance-incomplete" role="status">Carregando registros…</p> : <><div className="attendance-stats"><div><small>AULAS DADAS</small><b>{held}</b></div><div><small>FALTAS</small><b>{absences}</b></div><div><small>FALTAS RESTANTES</small><b>{remaining ?? "—"}</b></div></div><div className="attendance-progress" role="progressbar" aria-label={`Presença em ${course.name}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div>
          <p className="attendance-incomplete">Presença: {percent}% · Aulas previstas: {total ?? "não definidas"} · Limite de faltas: {allowed ?? "defina o total"}</p>
          <button type="button" className="outline-button attendance-settings-button" onClick={() => openSettings(course)}>Editar aulas previstas e limite de faltas</button>
          {settingsCourseId === course.id && <form className="attendance-settings-editor" onSubmit={(event) => { event.preventDefault(); void saveSettings(course); }}><label>Aulas previstas<input type="number" min="1" step="1" required value={settingsDraft.totalClasses} onChange={(event) => setSettingsDraft((current) => ({ ...current, totalClasses: event.target.value }))} /></label><label>Limite de faltas<input type="number" min="0" step="1" required max={settingsDraft.totalClasses || undefined} value={settingsDraft.maxAbsences} onChange={(event) => setSettingsDraft((current) => ({ ...current, maxAbsences: event.target.value }))} /></label>{settingsError && <p className="attendance-alert" role="alert">{settingsError}</p>}<div><button type="button" className="subtle-button" onClick={() => setSettingsCourseId(null)}>Cancelar</button><button className="primary-button" disabled={settingsSaving}>{settingsSaving ? "Salvando…" : "Salvar limites"}</button></div></form>}
          {allowed !== null && absences > allowed && <p className="attendance-alert" role="alert">Você ultrapassou o limite de faltas previsto.</p>}
          {state.error && <p className="attendance-alert" role="alert">{state.error}</p>}
          <div className="attendance-actions"><button type="button" className="outline-button attendance-register-button" onClick={() => openEntry(course)}>Registrar aulas</button><button type="button" className="outline-button attendance-edit-button" disabled={!state.rows.length} aria-expanded={editingCourseId === course.id} onClick={() => setEditingCourseId((current) => current === course.id ? null : course.id)}>Editar</button></div>
          {editingCourseId === course.id && <div className="attendance-record-list"><b>Aulas registradas</b>{state.rows.length ? state.rows.map((record) => <div className="attendance-record-row" key={record.id}><span><b>{new Date(`${record.date}T12:00:00`).toLocaleDateString("pt-BR")}</b><small>{record.classesCount} {record.classesCount === 1 ? "aula" : "aulas"} - {record.absences} {record.absences === 1 ? "falta" : "faltas"}</small><small className="attendance-schedule-hint">{course.schedule.filter((schedule) => weekdayNumber(schedule.day) === new Date(`${record.date}T12:00:00`).getDay()).map(formatSchedule).join(" · ") || "Sem horário associado"}</small></span><button type="button" className="outline-button" onClick={() => openRecordEditor(course, record)}>Editar registro</button></div>) : <p>Nenhuma aula registrada ainda.</p>}</div>}
        </>}
      </article>;
    })}</div>}
    {editingRecord && <div className="modal-backdrop attendance-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null); }}><form className="modal attendance-editor" onSubmit={(event) => { event.preventDefault(); void saveEditedRecord(); }}>
      <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setEditingRecord(null)}>{"\u00D7"}</button><span className="eyebrow">{editingRecord.course.name}</span><h2>Editar aulas registradas</h2><p>Altere a data, a quantidade de aulas ou marque presença e falta.</p>
      <label>Data<input required type="date" value={editedDate} onChange={(event) => setEditedDate(event.target.value)} /></label>{editingRecord.course.schedule.filter((schedule) => weekdayNumber(schedule.day) === new Date(`${editedDate}T12:00:00`).getDay()).length > 0 && <p className="attendance-schedule-hint">Horário previsto: {editingRecord.course.schedule.filter((schedule) => weekdayNumber(schedule.day) === new Date(`${editedDate}T12:00:00`).getDay()).map(formatSchedule).join(" · ")}</p>}
      <div className="attendance-batch-area"><div className="attendance-batch-list">{editedLessons.map((absent, index) => <article className="attendance-lesson-block" key={index}><div className="attendance-lesson-heading"><b>Aula {index + 1}</b>{editedLessons.length > 1 && <button type="button" onClick={() => setEditedLessons((current) => current.filter((_, item) => item !== index))}>Remover</button>}</div><label className="attendance-absence-toggle"><input type="checkbox" checked={absent} onChange={(event) => setEditedLessons((current) => current.map((value, item) => item === index ? event.target.checked : value))} /> Ausente <span>{absent ? "Falta registrada" : "Presente"}</span></label></article>)}</div><button type="button" className="outline-button attendance-add-lesson" onClick={() => setEditedLessons((current) => [...current, false])}>{"+"} Adicionar aula</button></div>
      <div className="modal-actions"><button type="button" className="delete-course-button" onClick={() => void deleteEditedRecord()} disabled={states[editingRecord.course.id]?.saving}>Excluir registro</button><button type="button" className="subtle-button" onClick={() => setEditingRecord(null)}>Cancelar</button><button className="primary-button" disabled={states[editingRecord.course.id]?.saving}>{states[editingRecord.course.id]?.saving ? "Salvando…" : "Salvar alterações"}</button></div>
    </form></div>}
    {courseForEntry && <div className="modal-backdrop attendance-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCourseForEntry(null); }}><form className="modal attendance-editor" onSubmit={submitAttendance}>
      <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setCourseForEntry(null)}>{"\u00D7"}</button><span className="eyebrow">{courseForEntry.name}</span><h2>Registrar aulas</h2><p>Comece com uma aula e adicione outros blocos se precisar. Cada aula pode ter sua data.</p>
      <div className="attendance-batch-area"><div className="attendance-batch-list">{batchLessons.map((lesson, index) => <article className="attendance-lesson-block" key={index}><div className="attendance-lesson-heading"><b>Aula {index + 1}</b>{batchLessons.length > 1 && <button type="button" onClick={() => setBatchLessons((current) => current.filter((_, item) => item !== index))} aria-label={`Remover aula ${index + 1}`}>Remover</button>}</div><label>Data da aula<input required type="date" value={lesson.date} onChange={(event) => { const date = event.target.value; setBatchLessons((current) => current.map((item, itemIndex) => { if (itemIndex !== index) return item; const schedule = item.scheduleIndex === null ? null : courseForEntry.schedule[item.scheduleIndex]; return { ...item, date, scheduleIndex: schedule && weekdayNumber(schedule.day) !== new Date(`${date}T12:00:00`).getDay() ? null : item.scheduleIndex }; })); }} /></label>{courseForEntry.schedule.length > 0 && <label>Horário associado<select value={lesson.scheduleIndex ?? ""} onChange={(event) => { const scheduleIndex = Number(event.target.value); const schedule = courseForEntry.schedule[scheduleIndex]; setBatchLessons((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, scheduleIndex, date: dateForSchedule(schedule.day, item.date, true) ?? item.date } : item)); }}><option value="" disabled>Selecione o horário</option>{courseForEntry.schedule.map((schedule, scheduleIndex) => <option key={`${schedule.day}-${schedule.start}-${scheduleIndex}`} value={scheduleIndex}>{formatSchedule(schedule)}</option>)}</select></label>}{courseForEntry.schedule.length === 0 && <p className="attendance-schedule-hint">Esta disciplina ainda não tem horário cadastrado. Escolha a data manualmente.</p>}<label className="attendance-absence-toggle"><input type="checkbox" checked={lesson.absent} onChange={(event) => setBatchLessons((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, absent: event.target.checked } : item))} /> Ausente <span>{lesson.absent ? "Falta registrada" : "Presente"}</span></label></article>)}</div><button type="button" className="outline-button attendance-add-lesson" onClick={() => setBatchLessons((current) => [...current, nextScheduledLesson(courseForEntry, current)])}>{"+"} Adicionar outra aula</button></div>
      <div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setCourseForEntry(null)}>Cancelar</button><button className="primary-button" disabled={states[courseForEntry.id]?.saving}>{states[courseForEntry.id]?.saving ? "Salvando…" : "Salvar aulas"}</button></div>
    </form></div>}
  </section>;
}
