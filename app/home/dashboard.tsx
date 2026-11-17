"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { getCourses, updateCourseAttendanceSettings, type Course, type CourseSchedule } from "../../lib/courses";
import { getTeachers, type Teacher } from "../../lib/teachers";
import SemesterSelector from "./semester-selector";
import TeachersView from "./teachers-view";
import AgendaView from "./agenda-view";
import NotesView from "./notes-view";
import AttendancePanel from "./attendance-panel";
import ApiCourseForm from "./course-api-form";
import UpcomingEvents from "./upcoming-events";
import { createSemester, updateSemester, type Semester } from "../../lib/semesters";

type DashboardProfile = { name: string; email: string };
type SemesterConfig = { term: string; start: string; end: string; courseIds: string[] };
const semesterConfigsStorageKey = "hub-school-semester-configs";
const coursesStorageKey = "hub-school-courses";

type Weekday = { value: string; label: string };
const weekdays: Weekday[] = [
  { value: "Seg", label: "Segunda-feira" },
  { value: "Ter", label: "Terça-feira" },
  { value: "Qua", label: "Quarta-feira" },
  { value: "Qui", label: "Quinta-feira" },
  { value: "Sex", label: "Sexta-feira" },
  { value: "Sáb", label: "Sábado" },
  { value: "Dom", label: "Domingo" },
];

type WeeklyScheduleFieldProps = { initialSchedule: CourseSchedule[]; initialRepeatWeekly: boolean; focusScheduleIndex?: number | null };
function WeeklyScheduleField({ initialSchedule, initialRepeatWeekly, focusScheduleIndex }: WeeklyScheduleFieldProps) {
  const [rows, setRows] = useState<Array<CourseSchedule & { id: number }>>(() => initialSchedule.map((entry, id) => ({ ...entry, id })));
  const [repeatWeekly, setRepeatWeekly] = useState(initialRepeatWeekly);
  const nextId = useRef(initialSchedule.length);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => { if (focusScheduleIndex !== null && focusScheduleIndex !== undefined) rowRefs.current[focusScheduleIndex]?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focusScheduleIndex]);
  const schedule = rows.map(({ day, start, end }) => ({ day, start, end }));

  return <div className="weekly-schedule-field wide">
    <div className="weekly-schedule-heading"><span>Dias e horários</span><small>Associe cada dia ao seu horário de aula.</small></div>
    <label className="weekly-repeat-toggle"><input type="checkbox" name="repeatWeekly" value="true" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} /><span>Repetir semanalmente</span></label>
    {!repeatWeekly && <small className="weekly-repeat-note">Sem repetição semanal. A ocorrência única será configurada na agenda.</small>}
    {rows.length === 0 && <p className="weekly-schedule-empty">Nenhum dia adicionado ainda.</p>}
    {rows.map((row, index) => <div ref={(node) => { rowRefs.current[index] = node; }} className={`weekly-schedule-row ${focusScheduleIndex === index ? "schedule-row-focused" : ""}`} key={row.id}>
      <label className="schedule-day-field"><span>Dia</span><select required value={row.day} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, day: event.target.value } : item))}><option value="" disabled>Selecione</option>{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
      <div className="schedule-times"><label><span>Início</span><input type="time" lang="pt-BR" step={300} required aria-label={`Horário de início para ${row.day || `dia ${index + 1}`}, formato 24 horas`} value={row.start} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, start: event.target.value } : item))} /></label><label><span>Fim</span><input type="time" lang="pt-BR" step={300} required aria-label={`Horário de fim para ${row.day || `dia ${index + 1}`}, formato 24 horas`} value={row.end} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, end: event.target.value } : item))} /></label></div>
      <button type="button" className="schedule-remove" aria-label={`Remover horário de ${row.day || `dia ${index + 1}`}`} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>×</button>
    </div>)}
    <button type="button" className="weekly-schedule-add" onClick={() => setRows((current) => [...current, { id: nextId.current++, day: "", start: "", end: "" }])}>＋ Adicionar dia e horário</button>
    <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />
  </div>;
}

function formatCourseSchedule(course: Course) {
  if (!course.schedule.length) return "Horário não informado";
  return course.schedule.map(({ day, start, end }) => start && end ? `${day} ${start}–${end}` : day).join(" · ");
}

const initialCourses: Course[] = [
  { id: "esw", name: "Engenharia de Software", code: "ESW", teacher: "Prof.ª Mariana Costa", schedule: [{ day: "Seg", start: "19:00", end: "20:40" }, { day: "Qua", start: "19:00", end: "20:40" }], repeatWeekly: true, room: "Lab 04" },
  { id: "bd", name: "Banco de Dados", code: "BD", teacher: "Prof. Rafael Mendes", schedule: [{ day: "Ter", start: "20:50", end: "22:30" }, { day: "Qui", start: "20:50", end: "22:30" }], repeatWeekly: true, room: "Sala 12" },
];
const navItems = ["Visão geral", "Disciplinas", "Docentes", "Agenda", "Anotações"];
const demoProfileStorageKey = "hub-school-demo-profile-name";
const defaultSemesterConfigs: Record<string, SemesterConfig> = {
  "demo-2026-1": { term: "2026/1", start: "2026-02-02", end: "2026-06-30", courseIds: [] },
  "demo-2026-2": { term: "2026/2", start: "2026-08-03", end: "2026-12-18", courseIds: initialCourses.map((course) => course.id) },
};

function formatSemesterRange(semester: Semester | null) {
  if (!semester?.data_inicio || !semester.data_fim) return "Período não informado";
  const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${formatDate(semester.data_inicio)} — ${formatDate(semester.data_fim)}`;
}

function subscribeToDemoProfile(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("hub-school-demo-profile-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hub-school-demo-profile-change", callback);
  };
}

function getDemoProfileName() {
  return window.localStorage.getItem(demoProfileStorageKey);
}

function getServerDemoProfileName() {
  return null;
}

export default function Home({ profile }: { profile: DashboardProfile }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [savedProfileName, setSavedProfileName] = useState(profile.name);
  const demoSavedProfileName = useSyncExternalStore(subscribeToDemoProfile, getDemoProfileName, getServerDemoProfileName);
  const profileName = isSupabaseConfigured() ? savedProfileName : demoSavedProfileName || savedProfileName;
  const [profileDraft, setProfileDraft] = useState(profile.name);
  const [newEmailDraft, setNewEmailDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [reauthRequired, setReauthRequired] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [profileFeedback, setProfileFeedback] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState("Visão geral");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [creatingSemester, setCreatingSemester] = useState(false);
  const [step, setStep] = useState(0);
  const [term, setTerm] = useState("2026/2");
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [start, setStart] = useState("2026-08-03");
  const [end, setEnd] = useState("2026-12-18");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [coursesLoading, setCoursesLoading] = useState(Boolean(process.env.NEXT_PUBLIC_API_URL));
  const [coursesError, setCoursesError] = useState("");
  const [courseReloadKey, setCourseReloadKey] = useState(0);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(Boolean(process.env.NEXT_PUBLIC_API_URL));
  const [teachersError, setTeachersError] = useState("");
  const [teacherReloadKey, setTeacherReloadKey] = useState(0);
  const coursesLoaded = useRef(false);
  const [semesterConfigs, setSemesterConfigs] = useState<Record<string, SemesterConfig>>(defaultSemesterConfigs);
  const semesterConfigsLoaded = useRef(false);
  const [semesterConfigsReady, setSemesterConfigsReady] = useState(false);
  const semesterConfigsRef = useRef(semesterConfigs);
  const selectedCourseIds = activeSemester ? semesterConfigs[activeSemester.id]?.courseIds ?? [] : [];
  const semesterCourses = process.env.NEXT_PUBLIC_API_URL
    ? courses.filter((course) => activeSemester && course.semesterId === activeSemester.id)
    : courses.filter((course) => selectedCourseIds.includes(course.id));
  const visibleCourses = process.env.NEXT_PUBLIC_API_URL ? semesterCourses : courses;
  const classEntries = semesterCourses.flatMap((course) => course.schedule.map((schedule) => ({ course, schedule }))).sort((a, b) => {
    const weekdayOrder: Record<string, number> = { Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sáb: 6, Dom: 7 };
    return (weekdayOrder[a.schedule.day] ?? 8) - (weekdayOrder[b.schedule.day] ?? 8) || a.schedule.start.localeCompare(b.schedule.start);
  });
  const availableCourses = courses.filter((course) => !selectedCourseIds.includes(course.id));
  const [courseForm, setCourseForm] = useState(false);
  const [courseFormReturnsToWizard, setCourseFormReturnsToWizard] = useState(false);
  const [courseTeacherPrefill, setCourseTeacherPrefill] = useState("");
  const onCourseCreatedRef = useRef<((courseId: string) => void) | null>(null);
  const [editingCourseIndex, setEditingCourseIndex] = useState<number | null>(null);
  const [scheduleIndexToEdit, setScheduleIndexToEdit] = useState<number | null>(null);
  const [courseMenuIndex, setCourseMenuIndex] = useState<number | null>(null);
  const courseActionsRef = useRef<HTMLDivElement>(null);
  const courseMenuRef = useRef<HTMLDivElement>(null);
  const [courseMenuPosition, setCourseMenuPosition] = useState({ top: 0, left: 0 });
  const [notice, setNotice] = useState("");
  const courseBeingEdited = editingCourseIndex === null ? null : courses[editingCourseIndex] ?? null;

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate demo data from browser storage and API after mount. */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(semesterConfigsStorageKey);
      const restored = saved
        ? { ...defaultSemesterConfigs, ...JSON.parse(saved) as Record<string, SemesterConfig> }
        : defaultSemesterConfigs;
      const seenCourseIds = new Set<string>();
      const secondSemesterDemoCourseIds = new Set(defaultSemesterConfigs["demo-2026-2"].courseIds);
      const isolated: Record<string, SemesterConfig> = {};
      for (const [semesterId, config] of Object.entries(restored).sort((a, b) => b[1].term.localeCompare(a[1].term))) {
        const courseIds = config.courseIds.filter((courseId) => {
          if (config.term !== defaultSemesterConfigs["demo-2026-2"].term && secondSemesterDemoCourseIds.has(courseId)) return false;
          if (seenCourseIds.has(courseId)) return false;
          seenCourseIds.add(courseId);
          return true;
        });
        isolated[semesterId] = { ...config, courseIds };
      }
      setSemesterConfigs(isolated);
    } catch {
      window.localStorage.removeItem(semesterConfigsStorageKey);
      setSemesterConfigs(defaultSemesterConfigs);
    } finally {
      semesterConfigsLoaded.current = true;
      setSemesterConfigsReady(true);
    }
  }, []);

  useEffect(() => {
    if (semesterConfigsLoaded.current) window.localStorage.setItem(semesterConfigsStorageKey, JSON.stringify(semesterConfigs));
  }, [semesterConfigs]);

  useEffect(() => {
    let cancelled = false;
    async function loadCourses() {
      setCoursesError("");
      if (process.env.NEXT_PUBLIC_API_URL) {
        setCoursesLoading(true);
        try {
          const result = await getCourses();
          if (!cancelled) setCourses(result);
        } catch (error) {
          if (!cancelled) {
            setCourses([]);
            setCoursesError(error instanceof Error ? error.message : "Não foi possível carregar as disciplinas.");
          }
        } finally {
          if (!cancelled) setCoursesLoading(false);
        }
      } else {
        try {
          const saved = window.localStorage.getItem(coursesStorageKey);
          if (saved) {
            const parsed: unknown = JSON.parse(saved);
            if (Array.isArray(parsed)) setCourses(parsed as Course[]);
          }
        } catch {
          window.localStorage.removeItem(coursesStorageKey);
        } finally {
          coursesLoaded.current = true;
        }
      }
    }
    void loadCourses();
    return () => { cancelled = true; };
  }, [courseReloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadTeachers() {
      if (!process.env.NEXT_PUBLIC_API_URL) {
        setTeachersError("");
        setTeachersLoading(false);
        return;
      }
      setTeachersError("");
      setTeachersLoading(true);
      try {
        const result = await getTeachers();
        if (!cancelled) setTeachers(result);
      } catch (error) {
        if (!cancelled) {
          setTeachers([]);
          setTeachersError(error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel carregar os professores.");
        }
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    }
    void loadTeachers();
    return () => { cancelled = true; };
  }, [teacherReloadKey]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_API_URL && coursesLoaded.current) window.localStorage.setItem(coursesStorageKey, JSON.stringify(courses));
  }, [courses]);

  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    semesterConfigsRef.current = semesterConfigs;
  }, [semesterConfigs]);

  useEffect(() => {
    const semesterId = activeSemester?.id;
    if (!semesterId || !semesterConfigsReady) return;
    const config = semesterConfigsRef.current[semesterId];
    setTerm(config?.term ?? activeSemester?.nome ?? "");
    setStart(config?.start ?? activeSemester?.data_inicio ?? "");
    setEnd(config?.end ?? activeSemester?.data_fim ?? "");
  }, [activeSemester, semesterConfigsReady]);

  useEffect(() => {
    if (!profileOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (courseMenuIndex === null) return;
    function closeCourseMenu(event: PointerEvent) {
      if (!courseActionsRef.current?.contains(event.target as Node)
          && !courseMenuRef.current?.contains(event.target as Node)) setCourseMenuIndex(null);
    }
    function closeCourseMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCourseMenuIndex(null);
        courseActionsRef.current?.querySelector("button")?.focus();
      }
    }
    function closeCourseMenuOnMove() { setCourseMenuIndex(null); }
    document.addEventListener("pointerdown", closeCourseMenu);
    document.addEventListener("keydown", closeCourseMenuOnEscape);
    window.addEventListener("resize", closeCourseMenuOnMove);
    window.addEventListener("scroll", closeCourseMenuOnMove, true);
    return () => {
      document.removeEventListener("pointerdown", closeCourseMenu);
      document.removeEventListener("keydown", closeCourseMenuOnEscape);
      window.removeEventListener("resize", closeCourseMenuOnMove);
      window.removeEventListener("scroll", closeCourseMenuOnMove, true);
    };
  }, [courseMenuIndex]);
  function toggleCourseMenu(index: number, button: HTMLButtonElement, focusItem = false) {
    if (courseMenuIndex === index) { setCourseMenuIndex(null); return; }
    const bounds = button.getBoundingClientRect();
    const menuWidth = 120;
    const menuHeight = 50;
    const margin = 8;
    setCourseMenuPosition({
      left: Math.max(margin, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - margin)),
      top: bounds.bottom + menuHeight + margin <= window.innerHeight
        ? bounds.bottom + 4 : Math.max(margin, bounds.top - menuHeight - 4),
    });
    setCourseMenuIndex(index);
    if (focusItem) window.requestAnimationFrame(() => courseMenuRef.current?.querySelector("button")?.focus());
  }
  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }
  async function signOut() {
    setProfileOpen(false);
    if (isSupabaseConfigured()) await createClient().auth.signOut();
    router.push("/login");
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = profileDraft.trim();
    const nextEmail = newEmailDraft.trim();
    const emailChanged = Boolean(nextEmail && nextEmail.toLowerCase() !== profile.email.trim().toLowerCase());
    const passwordChanged = Boolean(newPasswordDraft);
    if (!nextName) {
      setProfileFeedback("Informe um nome para continuar.");
      return;
    }
    if (passwordChanged && newPasswordDraft !== confirmPasswordDraft) {
      setProfileFeedback("As senhas não coincidem.");
      return;
    }
    if (!passwordChanged && confirmPasswordDraft) {
      setProfileFeedback("Digite a nova senha antes de confirmá-la.");
      return;
    }
    if (reauthRequired && !reauthCode.trim()) {
      setProfileFeedback("Digite o código enviado para confirmar a troca de senha.");
      return;
    }
    if ((emailChanged || passwordChanged) && !isSupabaseConfigured()) {
      setProfileFeedback("Conecte o Supabase Auth para alterar e-mail ou senha.");
      return;
    }

    setProfileSaving(true);
    setProfileFeedback("");
    setProfileNotice("");
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) throw userError ?? new Error("Não foi possível carregar seu perfil.");
        const { error } = await supabase.auth.updateUser({
          ...(emailChanged ? { email: nextEmail } : {}),
          ...(passwordChanged ? { password: newPasswordDraft } : {}),
          ...(reauthRequired ? { nonce: reauthCode.trim() } : {}),
          data: { ...data.user.user_metadata, full_name: nextName, name: nextName },
        }, emailChanged ? { emailRedirectTo: `${window.location.origin}/auth/callback` } : undefined);
        if (error?.code === "reauthentication_needed" && passwordChanged && !reauthRequired) {
          const { error: reauthError } = await supabase.auth.reauthenticate();
          if (reauthError) throw reauthError;
          setReauthRequired(true);
          setProfileNotice("Enviamos um código de segurança para seu e-mail. Digite-o para concluir a troca da senha.");
          return;
        }
        if (error) throw error;
      } else {
        window.localStorage.setItem(demoProfileStorageKey, nextName);
        window.dispatchEvent(new Event("hub-school-demo-profile-change"));
      }
      setSavedProfileName(nextName);
      setNewPasswordDraft("");
      setConfirmPasswordDraft("");
      setReauthRequired(false);
      setReauthCode("");
      if (emailChanged) {
        setNewEmailDraft("");
        setProfileNotice("Pedido enviado. Confirme a alteração pelo link de verificação enviado pelo Supabase.");
      } else {
        setProfileEditorOpen(false);
        notify(passwordChanged ? "Perfil e senha atualizados." : "Nome atualizado com sucesso.");
      }
    } catch (error) {
      setProfileFeedback(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    } finally {
      setProfileSaving(false);
    }
  }
  const profileInitials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "A";
  async function saveCourseAttendanceSettings(courseId: string, totalClasses: number, minimumAttendance: number) {
    if (process.env.NEXT_PUBLIC_API_URL) await updateCourseAttendanceSettings(courseId, totalClasses, minimumAttendance);
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, totalClasses, minimumAttendance } : course));
  }
  function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const course: Course = {
      ...(courseBeingEdited ?? {}),
      id: courseBeingEdited?.id ?? crypto.randomUUID(),
      ...(!courseBeingEdited && activeSemester ? { semesterId: activeSemester.id } : {}),
      name: String(data.get("name")),
      code: String(data.get("code")),
      teacher: String(data.get("teacher")),
      schedule: JSON.parse(String(data.get("schedule") || "[]")) as CourseSchedule[],
      repeatWeekly: data.get("repeatWeekly") === "true",
      room: String(data.get("room")),
    };
    const isEditing = editingCourseIndex !== null;
    const returnToWizard = courseFormReturnsToWizard;
    if (editingCourseIndex === null) {
      setCourses((current) => [...current, course]);
      onCourseCreatedRef.current?.(course.id);
      onCourseCreatedRef.current = null;
      if (activeSemester) setSemesterConfigs((current) => ({
        ...current,
        [activeSemester.id]: { ...(current[activeSemester.id] ?? { term: activeSemester.nome, start: activeSemester.data_inicio ?? "", end: activeSemester.data_fim ?? "", courseIds: [] }), courseIds: [...(current[activeSemester.id]?.courseIds ?? []), course.id] },
      }));
    } else {
      const sharedWithAnotherSemester = Boolean(activeSemester
        && semesterConfigs[activeSemester.id]?.courseIds.includes(course.id)
        && Object.entries(semesterConfigs).some(([semesterId, config]) => semesterId !== activeSemester.id && config.courseIds.includes(course.id)));
      if (sharedWithAnotherSemester && activeSemester) {
        const semesterCopy = { ...course, id: crypto.randomUUID(), semesterId: activeSemester.id };
        setCourses((current) => [...current, semesterCopy]);
        setSemesterConfigs((current) => {
          const config = current[activeSemester.id];
          if (!config) return current;
          return { ...current, [activeSemester.id]: { ...config, courseIds: config.courseIds.map((id) => id === course.id ? semesterCopy.id : id) } };
        });
      } else {
        setCourses((current) => current.map((item, index) => index === editingCourseIndex ? course : item));
      }
    }
    setCourseForm(false);
    setEditingCourseIndex(null);
    setCourseFormReturnsToWizard(false);
    setCourseTeacherPrefill("");
    if (returnToWizard) setWizard(true);
    notify(isEditing ? "Disciplina atualizada." : "Disciplina adicionada ao semestre.");
  }

  function openNewCourse(returnToWizard = false) {
    setEditingCourseIndex(null);
    setScheduleIndexToEdit(null);
    setCourseFormReturnsToWizard(returnToWizard);
    if (returnToWizard) setWizard(false);
    setCourseForm(true);
  }

  function openNewCourseFromTeacher(teacherName: string, onCreated: (courseId: string) => void) {
    onCourseCreatedRef.current = onCreated;
    setCourseTeacherPrefill(teacherName);
    openNewCourse();
  }

  function closeCourseForm() {
    setCourseForm(false);
    setEditingCourseIndex(null);
    setScheduleIndexToEdit(null);
    onCourseCreatedRef.current = null;
    if (courseFormReturnsToWizard) setWizard(true);
    setCourseFormReturnsToWizard(false);
  }

  function removeCourseFromSemester(courseId: string) {
    if (!activeSemester) return;
    setSemesterConfigs((current) => ({
      ...current,
      [activeSemester.id]: { ...(current[activeSemester.id] ?? { term: activeSemester.nome, start: activeSemester.data_inicio ?? "", end: activeSemester.data_fim ?? "", courseIds: [] }), courseIds: (current[activeSemester.id]?.courseIds ?? []).filter((id) => id !== courseId) },
    }));
    const removedCourse = courses.find((course) => course.id === courseId);
    if (removedCourse) notify(`${removedCourse.name} removida deste semestre.`);
  }
  function importCourseToCurrentSemester(courseId: string) {
    if (!activeSemester) return;
    const source = courses.find((course) => course.id === courseId);
    if (!source) return;
    const assignedElsewhere = Object.entries(semesterConfigs).some(([semesterId, config]) => semesterId !== activeSemester.id && config.courseIds.includes(courseId));
    const importedCourse = !process.env.NEXT_PUBLIC_API_URL && assignedElsewhere
      ? { ...source, id: crypto.randomUUID(), semesterId: activeSemester.id }
      : source;
    if (importedCourse.id !== source.id) setCourses((current) => [...current, importedCourse]);
    setSemesterConfigs((current) => {
      const config = current[activeSemester.id] ?? { term: activeSemester.nome, start: activeSemester.data_inicio ?? "", end: activeSemester.data_fim ?? "", courseIds: [] };
      return { ...current, [activeSemester.id]: { ...config, courseIds: config.courseIds.includes(importedCourse.id) ? config.courseIds : [...config.courseIds, importedCourse.id] } };
    });
  }
  function deleteCourse() {
    if (editingCourseIndex === null) return;
    const removedCourse = courses[editingCourseIndex];
    if (!removedCourse || !window.confirm(`Excluir “${removedCourse.name}” do quadro geral de disciplinas?`)) return;
    setCourses((current) => current.filter((course) => course.id !== removedCourse.id));
    setSemesterConfigs((current) => Object.fromEntries(Object.entries(current).map(([semesterId, config]) => [semesterId, { ...config, courseIds: config.courseIds.filter((id) => id !== removedCourse.id) }])));
    closeCourseForm();
    notify(`${removedCourse.name} excluída do quadro geral.`);
  }
  function editCourse(index: number, returnToWizard = false, focusScheduleIndex: number | null = null) {
    setScheduleIndexToEdit(focusScheduleIndex);
    setEditingCourseIndex(index);
    setCourseFormReturnsToWizard(returnToWizard);
    setCourseMenuIndex(null);
    if (returnToWizard) setWizard(false);
    setCourseForm(true);
  }

  function editCourseSchedule(courseId: string, scheduleIndex: number) {
    const index = courses.findIndex((course) => course.id === courseId);
    if (index >= 0) editCourse(index, false, scheduleIndex);
  }
  function renderCourseRow(c: Course, i: number) {
    const catalogIndex = courses.findIndex((course) => course.id === c.id);
    const linkedTeacher = teachers.find((teacher) => (c.teacherId && teacher.id === c.teacherId) || (!process.env.NEXT_PUBLIC_API_URL && teacher.name.trim().toLocaleLowerCase() === c.teacher.trim().toLocaleLowerCase()));
    const courseDetails = [c.workloadHours ? `${c.workloadHours}h` : "", c.classesPerWeek ? `${c.classesPerWeek} aulas/semana` : ""].filter(Boolean).join(" · ");
    return <article className="course-row" key={c.id}>
      <div className={`course-monogram tone-${i % 4}`}>{c.code.slice(0, 2).toUpperCase()}</div>
      <div className="course-main"><div className="course-title"><b>{c.name}</b><span>{c.code}</span></div><div className="course-meta">{(linkedTeacher?.name || c.teacher) && <span>♙ {linkedTeacher?.name || c.teacher}</span>}{linkedTeacher?.email && <a href={`mailto:${linkedTeacher.email}`} aria-label={`Enviar e-mail para ${linkedTeacher.name}`}>✉ {linkedTeacher.email}</a>}{linkedTeacher?.phone && <a href={`https://wa.me/${linkedTeacher.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${linkedTeacher.name}`}>☏ WhatsApp</a>}<span>◷ {formatCourseSchedule(c)}</span>{courseDetails && <span>{courseDetails}</span>}</div></div>
      {c.room && <div className="course-room">⌖ <span>{c.room}</span></div>}
      <div className="course-actions" ref={courseMenuIndex === catalogIndex ? courseActionsRef : null}>
        <button className="row-more" type="button" aria-label={`Opções de ${c.name}`} aria-haspopup="menu" aria-expanded={courseMenuIndex === catalogIndex} onClick={(event) => toggleCourseMenu(catalogIndex, event.currentTarget)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); if (courseMenuIndex === catalogIndex) courseMenuRef.current?.querySelector("button")?.focus(); else toggleCourseMenu(catalogIndex, event.currentTarget, true); } }}>···</button>
        {courseMenuIndex === catalogIndex && createPortal(<div className="course-actions-menu" role="menu" ref={courseMenuRef} style={courseMenuPosition}><button type="button" role="menuitem" onClick={() => { setCourseMenuIndex(null); editCourse(catalogIndex); }}>Editar</button></div>, document.body)}
      </div>
    </article>;
  }
  function startNewSemester() {
    setCreatingSemester(true);
    setTerm("");
    setStart("");
    setEnd("");
    setStep(0);
    setWizard(true);
  }

  async function continueSemesterSetup() {
    if (!term.trim() || !start || !end) {
      notify("Preencha o nome e as datas do semestre.");
      return;
    }
    if (creatingSemester) {
      try {
        const semester = await createSemester({ nome: term.trim(), data_inicio: start, data_fim: end });
        setSemesterConfigs((current) => ({ ...current, [semester.id]: { term: semester.nome, start, end, courseIds: [] } }));
        setActiveSemester(semester);
        setCreatingSemester(false);
        setStep(1);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível criar o semestre.");
      }
      return;
    }
    setStep(1);
  }

  function cancelWizard() {
    setCreatingSemester(false);
    setWizard(false);
    setStep(0);
  }

  async function finishWizard() {
    if (creatingSemester) {
      cancelWizard();
      return;
    }
    if (activeSemester) {
      try {
        const updated = await updateSemester(activeSemester.id, { nome: term.trim(), data_inicio: start || null, data_fim: end || null });
        setActiveSemester(updated);
        setSemesterConfigs((current) => ({
          ...current,
          [activeSemester.id]: { ...(current[activeSemester.id] ?? { courseIds: selectedCourseIds }), term: term.trim(), start, end, courseIds: current[activeSemester.id]?.courseIds ?? selectedCourseIds },
        }));
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível salvar o semestre.");
        return;
      }
    }
    setCreatingSemester(false);
    setWizard(false);
    setStep(0);
    setPage("Visão geral");
    notify("Seu semestre está pronto para começar!");
  }

  return <main className="app-shell">
    <nav className="mobile-bottom-nav" aria-label="Navegação principal"><button className={page === "Visão geral" ? "active" : ""} onClick={() => { setPage("Visão geral"); setMobileMoreOpen(false); }}><span>⌂</span>Início</button><button className={page === "Agenda" ? "active" : ""} onClick={() => { setPage("Agenda"); setMobileMoreOpen(false); }}><span>▦</span>Agenda</button><button className={page === "Disciplinas" ? "active" : ""} onClick={() => { setPage("Disciplinas"); setMobileMoreOpen(false); }}><span>▤</span>Disciplinas</button><button className={page === "Anotações" ? "active" : ""} onClick={() => { setPage("Anotações"); setMobileMoreOpen(false); }}><span>▧</span>Notas</button><button className={mobileMoreOpen ? "active" : ""} aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((open) => !open)}><span>•••</span>Mais</button></nav>
    {mobileMoreOpen && <div className="mobile-more-menu"><button onClick={() => { setPage("Docentes"); setMobileMoreOpen(false); }}>Professores</button><button onClick={() => { setProfileDraft(profileName); setProfileOpen(false); setProfileEditorOpen(true); setMobileMoreOpen(false); }}>Meu perfil</button></div>}
    <aside className="sidebar">
      <a className="brand" href="#inicio" onClick={() => setPage("Visão geral")}><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></a>
      <div className="school-label">ESPAÇO DO ALUNO</div>
      <div className="nav-label">MENU</div>
      <nav>{navItems.map((item, i) => <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => setPage(item)}><span className="nav-icon">{["⌂", "▤", "♙", "▦", "▧"][i]}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile"><span className="avatar">{profileInitials}</span><span><b>{profileName}</b><small>Aluno Fatec Franca</small></span></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">Meu espaço <span>/</span> <b>{page}</b></div><div className="top-actions"><div className="notifications-anchor" ref={notificationsRef}><button className="icon-button" aria-label="Notificacoes" aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-controls="notifications-panel" onClick={() => setNotificationsOpen((open) => !open)}>{"\u2667"}</button>{notificationsOpen && <section className="notifications-popover" id="notifications-panel" role="dialog" aria-label="Notificacoes"><div className="notifications-heading"><div><b>Notificacoes</b><span>Atualizacoes do seu espaco</span></div><button type="button" aria-label="Fechar notificacoes" onClick={() => setNotificationsOpen(false)}>{"\u00D7"}</button></div><div className="notifications-empty"><span aria-hidden="true">{"\u2667"}</span><b>Nenhuma notificacao</b><p>Quando houver novidades, elas aparecerao aqui.</p></div></section>}</div><div className="top-divider"/><div className="profile-menu-anchor" ref={profileMenuRef}><button className="top-profile" title="Abrir perfil" aria-label="Abrir perfil" aria-haspopup="dialog" aria-expanded={profileOpen} aria-controls="profile-menu" onClick={() => setProfileOpen(open => !open)}><span className="avatar small-avatar">{profileInitials}</span><span>{profileName}</span></button>{profileOpen && <div className="profile-menu" id="profile-menu" role="dialog" aria-label="Prévia do perfil"><div className="profile-menu-heading"><span className="avatar profile-menu-avatar">{profileInitials}</span><div><b>{profileName}</b><small>{profile.email || "Aluno Fatec Franca"}</small></div></div><div className="profile-menu-divider"/><div className="profile-academic"><span>▦</span><div><small>PERFIL ACADÊMICO</small><b>Estudante · Fatec Franca</b></div></div><button className="profile-edit" onClick={() => { setProfileDraft(profileName); setNewEmailDraft(""); setNewPasswordDraft(""); setConfirmPasswordDraft(""); setReauthRequired(false); setReauthCode(""); setProfileFeedback(""); setProfileNotice(""); setProfileOpen(false); setProfileEditorOpen(true); }}><span>✎</span>Editar informações</button><button className="profile-logout" onClick={signOut}><span>↪</span>Sair da conta</button></div>}</div></div></header>
      <div className="content">
      <div className="semester-content-selector"><SemesterSelector onSemesterChange={setActiveSemester} onCreateSemester={startNewSemester} /></div>{page === "Disciplinas" ? <div className="all-disciplines-view"><div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> SEMESTRE {activeSemester?.nome ?? "—"} · FATEC FRANCA</div><h1>Disciplinas</h1><p className="welcome-copy">Todas as disciplinas cadastradas no quadro geral.</p></div>{<button className="primary-button" disabled={!activeSemester} onClick={() => openNewCourse()}><span>＋</span> Adicionar disciplina</button>}</div><section className="panel all-disciplines-panel"><div className="panel-heading"><div><h3>Todas as disciplinas</h3><p>{coursesLoading ? "Carregando disciplinas…" : `${visibleCourses.length} ${visibleCourses.length === 1 ? "disciplina cadastrada" : "disciplinas cadastradas"}`}</p></div><span className="discipline-count">{coursesLoading ? "…" : String(visibleCourses.length).padStart(2, "0")}</span></div>{coursesLoading ? <div className="course-list-state" role="status" aria-live="polite">Carregando suas disciplinas…</div> : coursesError ? <div className="course-list-state course-list-error" role="alert"><b>Não foi possível carregar as disciplinas.</b><span>{coursesError}</span><button className="outline-button" type="button" onClick={() => setCourseReloadKey((key) => key + 1)}>Tentar novamente</button></div> : visibleCourses.length ? <div className="course-list">{visibleCourses.map((course, index) => renderCourseRow(course, index))}</div> : <div className="all-disciplines-empty"><b>Nenhuma disciplina cadastrada</b><span>{process.env.NEXT_PUBLIC_API_URL ? "Ainda não há disciplinas cadastradas neste semestre." : "Adicione uma disciplina para começar a organizar seu semestre."}</span>{<button className="outline-button" disabled={!activeSemester} onClick={() => openNewCourse()}>Adicionar disciplina</button>}</div>}</section><div className="attendance-section"><AttendancePanel courses={semesterCourses} semester={activeSemester} coursesLoading={coursesLoading} onUpdateCourseSettings={saveCourseAttendanceSettings} /></div></div> : page === "Agenda" ? <AgendaView courses={semesterCourses} semester={activeSemester} onEditCourseSchedule={editCourseSchedule} /> : page === "Anota\u00e7\u00f5es" ? <NotesView courses={courses} /> : page === "Docentes" ? <TeachersView teachers={teachers} courses={courses} loading={teachersLoading} error={teachersError} onRetry={() => setTeacherReloadKey((key) => key + 1)} onReload={() => { setTeacherReloadKey((key) => key + 1); setCourseReloadKey((key) => key + 1); }} demoMode={!process.env.NEXT_PUBLIC_API_URL} onAddCourse={openNewCourseFromTeacher} /> : <><div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> SEMESTRE {activeSemester?.nome ?? "—"} · FATEC FRANCA</div><h1>{page === "Visão geral" ? <>Seu espaço,<br/><em>do seu jeito.</em></> : page}</h1></div><button className="primary-button" onClick={() => page === "Disciplinas" ? openNewCourse() : (setStep(0), setWizard(true))}><span>＋</span> {page === "Disciplinas" ? "Nova disciplina" : "Configurar semestre"}</button></div>

        <div className="stat-grid"><article className="stat-card"><div className="stat-top"><span>SEMESTRE ATIVO</span><span className="stat-icon lilac">▦</span></div><strong>{activeSemester?.nome ?? "—"}</strong><p>{formatSemesterRange(activeSemester)} <span className="status-pill">{activeSemester ? "Ativo" : "Indisponível"}</span></p></article><article className="stat-card"><div className="stat-top"><span>DISCIPLINAS</span><span className="stat-icon mint">▤</span></div><strong>{String(semesterCourses.length).padStart(2, "0")}</strong><p>no seu semestre <button className="text-action" onClick={() => { setPage("Disciplinas"); }}>Ver todas <span>↗</span></button></p></article><article className="stat-card"><div className="stat-top"><span>DOCENTES</span><span className="stat-icon peach">♙</span></div><strong>{String(new Set(semesterCourses.map(c => c.teacher)).size).padStart(2, "0")}</strong><p>conectados às disciplinas <button className="text-action" onClick={() => setPage("Docentes")}>Ver contatos <span>↗</span></button></p></article></div>

        <div className="upcoming-events-section"><UpcomingEvents semester={activeSemester} courses={semesterCourses} /></div>

        <div className="section-heading"><div><div className="eyebrow">SEU SEMESTRE</div><h2>Uma boa rotina começa aqui.</h2></div><button className="subtle-button" onClick={() => { setStep(0); setWizard(true); }}>Editar semestre <span>↗</span></button></div>
        <div className="lower-grid"><section className="panel courses-panel"><div className="panel-heading"><div><h3>Disciplinas</h3><p>O que faz parte da sua jornada.</p></div>{!process.env.NEXT_PUBLIC_API_URL && <button className="round-add" aria-label="Adicionar disciplina" onClick={() => openNewCourse()}>＋</button>}</div><div className="course-list">{coursesLoading ? <div className="course-list-state" role="status" aria-live="polite">Carregando suas disciplinas…</div> : coursesError ? <div className="course-list-state course-list-error" role="alert"><span>{coursesError}</span><button className="outline-button" type="button" onClick={() => setCourseReloadKey((key) => key + 1)}>Tentar novamente</button></div> : semesterCourses.slice(0, 4).map((course) => renderCourseRow(course, courses.indexOf(course)))}</div><button className="panel-link" onClick={() => setPage("Disciplinas")}>Ver todas as disciplinas <span>→</span></button></section>
          <section className="panel classes-panel"><div className="panel-heading"><div><h3>Aulas</h3><p>Horários das disciplinas deste semestre.</p></div><span className="discipline-count">{String(classEntries.length).padStart(2, "0")}</span></div>{classEntries.length ? <div className="class-list">{classEntries.map(({ course, schedule }, index) => <article className="class-row" key={`${course.id}-${schedule.day}-${index}`}><span className={`course-monogram tone-${courses.indexOf(course) % 4}`}>{course.code.slice(0, 2).toUpperCase()}</span><div className="class-details"><b>{course.name}</b><span>{schedule.day} · {schedule.start}–{schedule.end}{course.room ? ` · ${course.room}` : ""}</span></div><small className={course.repeatWeekly ? "class-frequency weekly" : "class-frequency"}>{course.repeatWeekly ? "Semanal" : "Avulsa"}</small></article>)}</div> : <div className="class-empty">Nenhum horário cadastrado para as disciplinas deste semestre.</div>}</section></div>
        <footer className="footer"><span>Feito para acompanhar você. <b>✳</b></span><span>HUB SCHOOL · 2026</span></footer>
      </>}
      </div>
    </section>

    {courseForm && process.env.NEXT_PUBLIC_API_URL && activeSemester && <ApiCourseForm key={courseBeingEdited?.id ?? "new"} semesterId={activeSemester.id} course={courseBeingEdited} teachers={teachers} onClose={closeCourseForm} onRefresh={() => setCourseReloadKey((key) => key + 1)} onSaved={(message) => { closeCourseForm(); setCourseReloadKey((key) => key + 1); notify(message); }} />}
    {courseForm && !process.env.NEXT_PUBLIC_API_URL && <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) closeCourseForm(); }}><form className="modal" onSubmit={addCourse}><button type="button" className="modal-close" onClick={closeCourseForm}>×</button><span className="eyebrow">SEU SEMESTRE</span><h2>{editingCourseIndex === null ? "Nova disciplina" : "Editar disciplina"}</h2><p>Adicione uma matéria e organize os detalhes das aulas.</p><div className="form-grid"><label className="wide">Nome da disciplina<input name="name" required defaultValue={courseBeingEdited?.name ?? ""} placeholder="Ex.: Engenharia de Software"/></label><label>Sigla<input name="code" required defaultValue={courseBeingEdited?.code ?? ""} placeholder="Ex.: ESW"/></label><label>Docente<input name="teacher" required defaultValue={courseBeingEdited?.teacher ?? courseTeacherPrefill} placeholder="Nome do professor"/></label><WeeklyScheduleField key={editingCourseIndex ?? "new"} initialSchedule={courseBeingEdited?.schedule ?? []} initialRepeatWeekly={courseBeingEdited?.repeatWeekly ?? true} focusScheduleIndex={scheduleIndexToEdit}/><label className="wide">Sala<input name="room" defaultValue={courseBeingEdited?.room ?? ""} placeholder="Ex.: Lab 04"/></label></div><div className="modal-actions">{editingCourseIndex !== null && <button type="button" className="delete-course-button" onClick={deleteCourse}>Excluir disciplina</button>}<button type="button" className="subtle-button" onClick={closeCourseForm}>Cancelar</button><button className="primary-button">{editingCourseIndex === null ? "Adicionar disciplina" : "Salvar alterações"}</button></div></form></div>}

    {profileEditorOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileEditorOpen(false); }}><form className="modal profile-editor" onSubmit={saveProfile}><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setProfileEditorOpen(false)}>×</button><span className="eyebrow">MEU PERFIL</span><h2>Editar informações</h2><p>Atualize o nome que aparece no seu espaço acadêmico.</p><label>Nome de usuário<input autoFocus required maxLength={60} value={profileDraft} onChange={event => setProfileDraft(event.target.value)} placeholder="Seu nome"/></label>{profile.email && <label>E-mail atual<input value={profile.email} readOnly/></label>}<label>Novo e-mail (opcional)<input type="email" autoComplete="email" value={newEmailDraft} onChange={event => setNewEmailDraft(event.target.value)} placeholder="novo@email.com" disabled={!isSupabaseConfigured()}/></label><label>Nova senha (opcional)<input type="password" autoComplete="new-password" value={newPasswordDraft} onChange={event => setNewPasswordDraft(event.target.value)} placeholder="Digite a nova senha" disabled={!isSupabaseConfigured()}/></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" value={confirmPasswordDraft} onChange={event => setConfirmPasswordDraft(event.target.value)} placeholder="Repita a nova senha" disabled={!isSupabaseConfigured()}/></label>{reauthRequired && <label>Código de segurança<input inputMode="numeric" autoComplete="one-time-code" value={reauthCode} onChange={event => setReauthCode(event.target.value)} placeholder="Código enviado por e-mail"/></label>}{!isSupabaseConfigured() && <small className="profile-auth-hint">Conecte o Supabase Auth para habilitar a troca de e-mail e senha.</small>}{profileFeedback && <div className="profile-feedback" role="alert">{profileFeedback}</div>}{profileNotice && <div className="profile-notice" role="status">{profileNotice}</div>}<div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setProfileEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={profileSaving}>{profileSaving ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}{wizard && <div className="modal-backdrop wizard-backdrop"><section className="wizard"><button className="modal-close" onClick={cancelWizard}>×</button><div className="wizard-side"><a className="brand" href="#inicio"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></a><div className="wizard-side-content"><span className="wizard-kicker">PRIMEIRO ACESSO</span><h2>Vamos deixar<br/>seu semestre<br/><em>com a sua cara.</em></h2><p>Em poucos passos, seu espaço acadêmico fica pronto para acompanhar você.</p></div><div className="wizard-side-bottom">✳ <span>Organização que cabe na sua rotina.</span></div></div><div className="wizard-main"><div className="wizard-progress"><span>PASSO {step + 1} DE 2</span><div>{[0,1].map(n => <i key={n} className={n <= step ? "done" : ""}/>)}</div></div>{step === 0 && <div className="wizard-content"><span className="step-icon">▦</span><h2>Qual semestre<br/>vamos organizar?</h2><p>Comece pelo básico. Você pode ajustar essas informações depois.</p><label>Identificação do semestre<input value={term} onChange={e => setTerm(e.target.value)} placeholder="Ex.: 2026/2"/></label><div className="form-grid date-grid"><label>Data de início<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>Data de encerramento<input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div><button className="primary-button full-button" onClick={continueSemesterSetup}>Continuar <span>→</span></button><button className="skip-button" onClick={cancelWizard}>Faço isso depois</button></div>}{step === 1 && <div className="wizard-content"><span className="step-icon">▤</span><h2>Quais matérias<br/>você vai cursar?</h2><p>Você já pode começar com as disciplinas que conhece.</p>{semesterCourses.length ? <div className="wizard-course-list">{semesterCourses.map((c, i) => <div key={c.id}><span className={`course-monogram tone-${i % 4}`}>{c.code.slice(0,2)}</span><span><b>{c.name}</b><small>{formatCourseSchedule(c)}</small></span><button type="button" className="wizard-course-remove" aria-label={`Remover ${c.name} deste semestre`} title={`Remover ${c.name} deste semestre`} onClick={() => removeCourseFromSemester(c.id)}>×</button><span className="checkmark">✓</span></div>)}</div> : <div className="wizard-course-empty">Nenhuma matéria selecionada para este semestre. Importe uma do quadro ou adicione uma nova.</div>}{availableCourses.length > 0 && <details className="wizard-course-catalog"><summary>Importar matéria do quadro geral</summary><div>{availableCourses.map((course) => <button type="button" key={course.id} onClick={() => importCourseToCurrentSemester(course.id)}><span><b>{course.name}</b><small>{course.code} · {formatCourseSchedule(course)}</small></span><span aria-hidden="true">＋</span></button>)}</div></details>}<button className="wizard-add" onClick={() => { openNewCourse(true); }}>＋ Adicionar outra disciplina</button><button className="primary-button full-button" onClick={finishWizard}>Concluir configuração <span>→</span></button><button className="back-link" onClick={() => setStep(0)}>← Voltar</button></div>}</div></section></div>}
    {notice && <div className="toast">✓ <span>{notice}</span></div>}
  </main>;
}
