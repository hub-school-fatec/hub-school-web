"use client";

import { FormEvent, useState } from "react";
import { deleteCourseFromApi, getCourseSchedules, saveCourse, saveCourseSchedules, ScheduleSaveError, type Course, type CourseInput, type CourseSchedule } from "../../lib/courses";
import type { Teacher } from "../../lib/teachers";

type Props = {
  semesterId: string;
  course: Course | null;
  teachers: Teacher[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onRefresh: () => void;
};

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const shiftPresets = { "Manhã": ["08:00", "09:00"], "Tarde": ["14:00", "15:00"], "Noite": ["19:00", "20:00"] } as const;
function shiftFor(start: string) { return start < "12:00" ? "Manhã" : start < "18:00" ? "Tarde" : "Noite"; }

export default function ApiCourseForm({ semesterId, course, teachers, onClose, onSaved, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedCourseId, setSavedCourseId] = useState(course?.id ?? "");
  const [schedules, setSchedules] = useState<CourseSchedule[]>(course?.schedule ?? []);

  function updateSchedule(index: number, change: Partial<CourseSchedule>) {
    setSchedules((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: CourseInput = {
      semestre_id: semesterId,
      docente_id: String(data.get("teacherId") || "") || null,
      nome: String(data.get("name") || "").trim(),
      sigla: String(data.get("code") || "").trim(),
      carga_horaria_h: Number(data.get("workloadHours")),
      total_aulas: Number(data.get("totalClasses")),
      frequencia_minima: Number(data.get("minimumAttendance")),
      media_minima: Number(data.get("minimumGrade")),
    };
    if (!input.nome || !input.sigla || !Number.isFinite(input.carga_horaria_h) || input.carga_horaria_h <= 0
        || !Number.isInteger(input.total_aulas) || input.total_aulas <= 0
        || !Number.isFinite(input.frequencia_minima) || input.frequencia_minima < 0 || input.frequencia_minima > 100
        || !Number.isFinite(input.media_minima) || input.media_minima < 0 || input.media_minima > 10) {
      setError("Confira os dados da disciplina.");
      return;
    }
    if (schedules.some((row) => !weekdays.includes(row.day) || !/^\d{2}:\d{2}$/.test(row.start)
        || !/^\d{2}:\d{2}$/.test(row.end) || row.end <= row.start || !row.room?.trim())) {
      setError("Confira o dia, o intervalo e a sala de cada horário. O término deve ser posterior ao início.");
      return;
    }
    const slots = schedules.map((row) => `${row.day}/${row.start}`);
    if (new Set(slots).size !== slots.length) {
      setError("Há horários repetidos no mesmo dia e horário de início.");
      return;
    }
    setSaving(true);
    setError("");
    let persistedId = savedCourseId;
    try {
      const saved = await saveCourse(input, savedCourseId || undefined);
      persistedId = saved.id;
      setSavedCourseId(saved.id);
      await saveCourseSchedules(saved.id, schedules);
      onSaved(schedules.length
        ? (course || savedCourseId ? "Disciplina e horários atualizados." : "Disciplina e horários adicionados ao semestre.")
        : (course || savedCourseId ? "Disciplina atualizada." : "Disciplina adicionada ao semestre."));
    } catch (cause) {
      if (cause instanceof ScheduleSaveError) {
        let message = cause.message;
        try { setSchedules(await getCourseSchedules(persistedId)); }
        catch { message += " Não foi possível recarregar os horários confirmados; recarregue a página antes de repetir."; }
        onRefresh();
        setError(message);
      } else {
        setError(cause instanceof Error ? cause.message : "Não foi possível salvar a disciplina.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!course || !window.confirm(`Excluir a disciplina ${course.name}? Seus registros vinculados podem ser removidos.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteCourseFromApi(course.id);
      onSaved("Disciplina excluída.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir a disciplina.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="modal api-course-form" onSubmit={submit}>
      <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="Fechar">×</button>
      <span className="eyebrow">SEU SEMESTRE</span>
      <h2>{course || savedCourseId ? "Editar disciplina" : "Nova disciplina"}</h2>
      <p>Cadastre os dados da disciplina no semestre selecionado.</p>
      <div className="form-grid">
        <label className="wide">Nome da disciplina<input name="name" required defaultValue={course?.name ?? ""} /></label>
        <label>Sigla<input name="code" required defaultValue={course?.code ?? ""} /></label>
        <label>Carga horária (h)<input name="workloadHours" type="number" min="0.01" step="any" required defaultValue={course?.workloadHours ?? ""} /></label>
        <label>Total de aulas<input name="totalClasses" type="number" min="1" step="1" required defaultValue={course?.totalClasses ?? ""} /></label>
        <label>Docente<select name="teacherId" defaultValue={course?.teacherId ?? ""}><option value="">Sem docente</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
        <label>Frequência mínima (%)<input name="minimumAttendance" type="number" min="0" max="100" step="any" required defaultValue={course?.minimumAttendance ?? 75} /></label>
        <label>Média mínima<input name="minimumGrade" type="number" min="0" max="10" step="any" required defaultValue={course?.minimumGrade ?? 6} /></label>
      </div>
      <section className="api-course-schedules" aria-label="Horários das aulas">
        <h3>Horários das aulas</h3>
        <p>O turno é indicado pelo horário de início. Informe também a sala, exigida pela API.</p>
        {schedules.map((row, index) => <div className="api-course-schedule" key={row.scheduleId ?? `new-${index}`}>
          <label>Turno<select value={shiftFor(row.start)} onChange={(event) => { const [start, end] = shiftPresets[event.target.value as keyof typeof shiftPresets]; updateSchedule(index, { start, end }); }}><option>Manhã</option><option>Tarde</option><option>Noite</option></select></label>
          <label>Dia<select value={row.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>{weekdays.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
          <label>Início<input type="time" required value={row.start} onChange={(event) => updateSchedule(index, { start: event.target.value })} /></label>
          <label>Término<input type="time" required value={row.end} onChange={(event) => updateSchedule(index, { end: event.target.value })} /></label>
          <label>Sala<input required value={row.room ?? ""} onChange={(event) => updateSchedule(index, { room: event.target.value })} /></label>
          <button type="button" className="subtle-button" onClick={() => setSchedules((current) => current.filter((_, rowIndex) => rowIndex !== index))} disabled={saving} aria-label={`Remover horário ${index + 1}`}>Remover</button>
        </div>)}
        <button type="button" className="outline-button" onClick={() => setSchedules((current) => [...current, { day: "Seg", start: "08:00", end: "09:00", room: "", classesCount: 1 }])} disabled={saving}>Adicionar horário</button>
      </section>
      {error && <div className="profile-feedback" role="alert">{error}</div>}
      <div className="modal-actions">
        {course && <button type="button" className="delete-course-button" onClick={() => void remove()} disabled={saving}>Excluir disciplina</button>}
        <button type="button" className="subtle-button" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar disciplina"}</button>
      </div>
    </form>
  </div>;
}
