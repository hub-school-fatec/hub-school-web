"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Course } from "../../lib/courses";
import type { Semester } from "../../lib/semesters";
import { createEvent, deleteEvent, filterEventsForSemester, getAcademicCalendar, getEvents, localDay, occursOnDay, updateEvent, type AcademicEvent, type EventType } from "../../lib/events";

const demoEventsKey = "hub-school-demo-events";
const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "prova", label: "Prova" },
  { value: "trabalho", label: "Trabalho" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "aula", label: "Aula" },
  { value: "evento", label: "Evento" },
];
const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function pad(value: number) { return String(value).padStart(2, "0"); }
function dateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function dateFromKey(value: string) { const [year, month, day] = value.slice(0, 10).split("-").map(Number); return new Date(year, month - 1, day); }
function weekdayNumber(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized.startsWith("dom") || normalized === "0") return 0;
  if (normalized.startsWith("seg") || normalized === "1") return 1;
  if (normalized.startsWith("ter") || normalized === "2") return 2;
  if (normalized.startsWith("qua") || normalized === "3") return 3;
  if (normalized.startsWith("qui") || normalized === "4") return 4;
  if (normalized.startsWith("sex") || normalized === "5") return 5;
  if (normalized.startsWith("sáb") || normalized.startsWith("sab") || normalized === "6") return 6;
  return -1;
}
function dateTime(date: Date, time: string) { return new Date(`${dateKey(date)}T${time || "00:00"}:00`).toISOString(); }
function dateTimeLocal(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 16) : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function formatTime(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Dia inteiro";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? "Dia inteiro";
}
function typeLabel(type: string) { return eventTypes.find((item) => item.value === type)?.label ?? ({ feriado: "Feriado", semana_provas: "Semana de provas", inicio: "Início do semestre", fim: "Fim do semestre" } as Record<string, string>)[type] ?? "Calendário acadêmico"; }

function scheduledClasses(courses: Course[], semester: Semester | null, rangeStart: Date, rangeEnd: Date): AcademicEvent[] {
  const startLimit = semester?.data_inicio ? dateFromKey(semester.data_inicio) : rangeStart;
  const endLimit = semester?.data_fim ? dateFromKey(semester.data_fim) : rangeEnd;
  const start = new Date(Math.max(rangeStart.getTime(), startLimit.getTime()));
  const end = new Date(Math.min(rangeEnd.getTime(), endLimit.getTime()));
  const result: AcademicEvent[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    for (const course of courses) {
      for (const schedule of course.schedule) {
        if (weekdayNumber(schedule.day) !== day.getDay()) continue;
        const startTime = schedule.start || "00:00";
        const endTime = schedule.end || startTime;
        result.push({
          id: `class-${course.id}-${dateKey(day)}-${startTime}`,
          title: course.name,
          type: "aula",
          start: dateTime(day, startTime),
          end: dateTime(day, endTime),
          courseId: course.id,
          reminderMinutes: [], reminderActive: false, cancelled: false,
        });
      }
    }
  }
  return result;
}

export default function AgendaView({ courses, semester, onEditCourseSchedule }: { courses: Course[]; semester: Semester | null; onEditCourseSchedule: (courseId: string, scheduleIndex: number) => void }) {
  const apiMode = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<"week" | "month">("week");
  const [filter, setFilter] = useState("todos");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedClass, setSelectedClass] = useState<AcademicEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(apiMode);
      setError("");
      setCalendarError("");
      if (!apiMode) {
        try {
          const saved = window.localStorage.getItem(demoEventsKey);
          setEvents(saved ? JSON.parse(saved) as AcademicEvent[] : []);
        } catch {
          window.localStorage.removeItem(demoEventsKey);
          setEvents([]);
        }
        setAcademicEvents([]);
        setLoading(false);
        return;
      }
      const [eventResult, calendarResult] = await Promise.allSettled([getEvents(), getAcademicCalendar()]);
      if (cancelled) return;
      if (eventResult.status === "fulfilled") setEvents(eventResult.value);
      else { setEvents([]); setError(eventResult.reason instanceof Error ? eventResult.reason.message : "Não foi possível carregar a agenda."); }
      if (calendarResult.status === "fulfilled") setAcademicEvents(calendarResult.value);
      else { setAcademicEvents([]); setCalendarError(calendarResult.reason instanceof Error ? calendarResult.reason.message : "Calendário acadêmico indisponível."); }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [apiMode, reloadKey]);
  const visibleCursor = cursor;
  const visibleRange = useMemo(() => {
    if (view === "month") {
      return { start: new Date(visibleCursor.getFullYear(), visibleCursor.getMonth(), 1), end: new Date(visibleCursor.getFullYear(), visibleCursor.getMonth() + 1, 0) };
    }
    const start = new Date(visibleCursor.getFullYear(), visibleCursor.getMonth(), visibleCursor.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }, [visibleCursor, view]);
  const days = useMemo(() => {
    const first = view === "month" ? new Date(visibleRange.start.getFullYear(), visibleRange.start.getMonth(), 1) : visibleRange.start;
    const last = view === "month" ? new Date(visibleRange.end) : visibleRange.end;
    if (view === "month") {
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    }
    const result: Date[] = [];
    for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) result.push(new Date(date));
    return result;
  }, [visibleRange, view]);
  const classes = useMemo(() => scheduledClasses(courses, semester, visibleRange.start, visibleRange.end), [courses, semester, visibleRange]);
  const semesterEvents = filterEventsForSemester(events, semester, courses);
  const allEvents = [...semesterEvents, ...academicEvents, ...classes];
  const filteredEvents = filter === "todos" ? allEvents : allEvents.filter((event) => event.type === filter);
  const heading = view === "month"
    ? visibleCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : `${visibleRange.start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${visibleRange.end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  function moveRange(amount: number) {
    setCursor(view === "month"
      ? new Date(visibleCursor.getFullYear(), visibleCursor.getMonth() + amount, 1)
      : new Date(visibleCursor.getFullYear(), visibleCursor.getMonth(), visibleCursor.getDate() + amount * 7));
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const startValue = String(form.get("start"));
    const endValue = String(form.get("end"));
    if (!startValue || Number.isNaN(new Date(startValue).getTime())
        || (endValue && (Number.isNaN(new Date(endValue).getTime()) || new Date(endValue) < new Date(startValue)))) {
      setFormError("O horário de término precisa ser posterior ao início.");
      setSaving(false);
      return;
    }
    const reminders = form.getAll("reminder").map(Number);
    const customValue = String(form.get("reminderCustom") ?? "").trim();
    const customReminder = Number(customValue);
    if (customValue && Number.isInteger(customReminder) && customReminder >= 0 && !reminders.includes(customReminder)) reminders.push(customReminder);
    const courseId = String(form.get("courseId") ?? "");
    const eventData = {
      title: String(form.get("title")).trim(),
      type: String(form.get("type")) as EventType,
      start: new Date(startValue).toISOString(),
      end: endValue ? new Date(endValue).toISOString() : null,
      courseId: courseId || null,
      reminderMinutes: reminders,
      reminderActive: form.has("reminderActive") && reminders.length > 0,
      cancelled: editingEvent?.cancelled ?? false,
    };
    try {
      if (editingEvent) {
        const updated = apiMode ? await updateEvent(editingEvent.id, eventData) : { ...eventData, id: editingEvent.id };
        setEvents((current) => {
          const next = current.map((item) => item.id === editingEvent.id ? updated : item);
          if (!apiMode) window.localStorage.setItem(demoEventsKey, JSON.stringify(next));
          return next;
        });
      } else if (apiMode) {
        const created = await createEvent(eventData);
        setEvents((current) => [...current, created]);
      } else {
        const created: AcademicEvent = { ...eventData, id: `demo-event-${crypto.randomUUID()}` };
        setEvents((current) => {
          const next = [...current, created];
          window.localStorage.setItem(demoEventsKey, JSON.stringify(next));
          return next;
        });
      }
      if (apiMode) setReloadKey((key) => key + 1);
      setEditorOpen(false);
      setEditingEvent(null);
      formElement.reset();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o evento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (!selectedClass || !events.some((item) => item.id === selectedClass.id)) return;
    if (!window.confirm("Excluir este evento?")) return;
    setSaving(true); setFormError("");
    try {
      if (apiMode) await deleteEvent(selectedClass.id);
      else {
        const next = events.filter((item) => item.id !== selectedClass.id);
        window.localStorage.setItem(demoEventsKey, JSON.stringify(next));
      }
      setEvents((current) => current.filter((item) => item.id !== selectedClass.id));
      setSelectedClass(null);
      if (apiMode) setReloadKey((key) => key + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Não foi possível excluir o evento."); }
    finally { setSaving(false); }
  }

  async function cancelSelected() {
    if (!selectedClass || !events.some((item) => item.id === selectedClass.id)) return;
    setSaving(true); setFormError("");
    try {
      const changed = apiMode
        ? await updateEvent(selectedClass.id, { ...selectedClass, cancelled: !selectedClass.cancelled })
        : { ...selectedClass, cancelled: !selectedClass.cancelled };
      const next = events.map((item) => item.id === changed.id ? changed : item);
      if (!apiMode) window.localStorage.setItem(demoEventsKey, JSON.stringify(next));
      setEvents(next); setSelectedClass(null);
      if (apiMode) setReloadKey((key) => key + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Não foi possível alterar o evento."); }
    finally { setSaving(false); }
  }

  return <div className="agenda-view">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> CALENDÁRIO ACADÊMICO</div><h1>Agenda</h1></div><button className="primary-button" type="button" onClick={() => { setEditingEvent(null); setFormError(""); setEditorOpen(true); }}>＋ Novo evento</button></div>
    <section className="panel agenda-panel">
      <div className="agenda-toolbar"><div className="agenda-range"><button type="button" aria-label="Período anterior" onClick={() => moveRange(-1)}>‹</button><h2>{heading}</h2><button type="button" aria-label="Próximo período" onClick={() => moveRange(1)}>›</button><button className="agenda-today" type="button" onClick={() => setCursor(new Date())}>Hoje</button></div><div className="agenda-view-toggle"><button type="button" className={view === "week" ? "selected" : ""} onClick={() => setView("week")}>Semana</button><button type="button" className={view === "month" ? "selected" : ""} onClick={() => setView("month")}>Mês</button></div></div>
      <div className="agenda-filter"><label>Tipo de evento<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos</option>{[...eventTypes.map((type) => type.value), "feriado", "semana_provas", "inicio", "fim"].map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>{calendarError && <span role="status">Calendário institucional indisponível: {calendarError}</span>}</div>
      {error ? <div className="course-list-state course-list-error" role="alert"><b>Não foi possível carregar os eventos.</b><span>{error}</span><button className="outline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></div>
        : loading ? <div className="course-list-state" role="status" aria-live="polite">Carregando sua agenda…</div>
          : <div className={`agenda-calendar ${view === "month" ? "month-view" : "week-view"}`}>
            {days.map((day) => {
              const key = dateKey(day);
              const dayEvents = filteredEvents.filter((item) => occursOnDay(item, key)).sort((a, b) => a.start.localeCompare(b.start));
              return <section className={`agenda-day ${view === "month" && day.getMonth() !== visibleCursor.getMonth() ? "outside-month" : ""}`} key={key}>
                <div className="agenda-day-heading"><span>{weekdayNames[day.getDay()]}</span><b>{day.getDate()}</b></div>
                <div className="agenda-day-events">{dayEvents.map((item) => {
                  const linkedCourseName = item.courseId ? courses.find((course) => course.id === item.courseId)?.name : undefined;
                  const content = <><small>{formatTime(item.start)}</small><b>{item.title}</b>{linkedCourseName && linkedCourseName !== item.title && <span>{linkedCourseName}</span>}</>;
                  const scheduledClass = item.id.startsWith("class-") && Boolean(item.courseId);
                  const editableEvent = events.some((event) => event.id === item.id);
                  const interactive = scheduledClass || editableEvent;
                  const className = `agenda-event ${item.academic ? "event-academic" : `event-${item.type}`}${item.cancelled ? " event-cancelled" : ""}${interactive ? " agenda-event-button" : ""}`;
                  return interactive
                    ? <button type="button" className={className} key={item.id} title={`${item.title} · ${formatTime(item.start)} · clique para ver opções`} onClick={() => setSelectedClass(item)}>{content}</button>
                    : <article className={className} key={item.id} title={`${item.title} · ${formatTime(item.start)}`}>{content}</article>;
                })}</div>
              </section>;
            })}
          </div>}
      <div className="agenda-legend">{eventTypes.map((type) => <span key={type.value}><i className={`legend-${type.value}`}/>{type.label}</span>)}<span><i className="legend-calendario"/>Calendário acadêmico</span></div>
    </section>
    {selectedClass && (() => {
      const course = courses.find((item) => item.id === selectedClass.courseId);
      const date = dateFromKey(localDay(selectedClass.start));
      const scheduledClass = selectedClass.id.startsWith("class-");
      const scheduleIndex = course?.schedule.findIndex((schedule) => weekdayNumber(schedule.day) === date.getDay() && schedule.start === formatTime(selectedClass.start)) ?? -1;
      return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedClass(null); }}><section className="modal agenda-class-details"><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setSelectedClass(null)}>×</button><span className="eyebrow">{scheduledClass ? "HORÁRIO DA DISCIPLINA" : typeLabel(selectedClass.type).toUpperCase()}</span><h2>{scheduledClass ? course?.name ?? selectedClass.title : selectedClass.title}</h2><p>{date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} · {formatTime(selectedClass.start)}–{selectedClass.end ? formatTime(selectedClass.end) : "sem término"}</p>{scheduledClass ? <><p>Este evento vem do horário semanal cadastrado na disciplina.</p><div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setSelectedClass(null)}>Fechar</button><button type="button" className="primary-button" disabled={!course || scheduleIndex < 0} onClick={() => { if (course && scheduleIndex >= 0) onEditCourseSchedule(course.id, scheduleIndex); setSelectedClass(null); }}>Editar horário da disciplina</button></div></> : <><p>{course ? `Disciplina: ${course.name}` : "Evento sem disciplina associada."}{selectedClass.cancelled ? " · Cancelado" : ""}</p>{formError && <p role="alert" className="profile-feedback">{formError}</p>}<div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setSelectedClass(null)}>Fechar</button><button type="button" disabled={saving} onClick={() => void cancelSelected()}>{selectedClass.cancelled ? "Reativar" : "Cancelar evento"}</button><button type="button" disabled={saving} onClick={() => void removeSelected()}>Excluir</button><button type="button" className="primary-button" onClick={() => { setEditingEvent(selectedClass); setFormError(""); setSelectedClass(null); setEditorOpen(true); }}>Editar evento</button></div></>}</section></div>;
    })()}    {editorOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form key={editingEvent?.id ?? "new"} className="modal event-editor" onSubmit={submitEvent}><button type="button" className="modal-close" aria-label="Fechar" onClick={() => { setEditorOpen(false); setEditingEvent(null); }}>×</button><span className="eyebrow">AGENDA</span><h2>{editingEvent ? "Editar evento" : "Novo evento"}</h2><p>Organize provas, entregas, aulas e outros compromissos.</p><label>Título<input name="title" required maxLength={120} defaultValue={editingEvent?.title ?? ""} placeholder="Ex.: Prova de Banco de Dados"/></label><div className="form-grid"><label>Tipo<select name="type" defaultValue={editingEvent?.type ?? "prova"}>{eventTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Disciplina (opcional)<select name="courseId" defaultValue={editingEvent?.courseId ?? ""}><option value="">Sem disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Início<input type="datetime-local" name="start" required defaultValue={editingEvent ? dateTimeLocal(editingEvent.start) : ""}/></label><label>Fim<input type="datetime-local" name="end" defaultValue={editingEvent?.end ? dateTimeLocal(editingEvent.end) : ""}/></label></div><fieldset className="reminder-options"><legend>Lembretes</legend><label><input type="checkbox" name="reminderActive" defaultChecked={editingEvent ? editingEvent.reminderActive : true}/> Ativar lembretes</label><label><input type="checkbox" name="reminder" value="4320" defaultChecked={editingEvent ? editingEvent.reminderMinutes.includes(4320) : true}/> 3 dias antes</label><label><input type="checkbox" name="reminder" value="1440" defaultChecked={editingEvent ? editingEvent.reminderMinutes.includes(1440) : true}/> 1 dia antes</label><label>Outro prazo (minutos antes)<input type="number" name="reminderCustom" min="0" step="1" defaultValue={editingEvent?.reminderMinutes.find((minutes) => minutes !== 1440 && minutes !== 4320) ?? ""} placeholder="Ex.: 60"/></label></fieldset>{formError && <div className="profile-feedback" role="alert">{formError}</div>}<div className="modal-actions"><button className="subtle-button" type="button" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando…" : editingEvent ? "Salvar alterações" : "Salvar evento"}</button></div></form></div>}
  </div>;
}
