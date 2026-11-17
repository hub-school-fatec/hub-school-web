"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { finishOnboarding, loadOnboarding, validateOnboarding, type OnboardingCourse, type OnboardingData, type OnboardingTeacher } from "../../lib/onboarding";
import type { CourseSchedule } from "../../lib/courses";
import { createClient } from "../../lib/supabase/client";

const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const emptyCourse = (): OnboardingCourse => ({ name: "", code: "", hours: "", totalClasses: "", schedule: [] });
const emptyTeacher = (): OnboardingTeacher => ({ name: "", email: "", phone: "", courseCode: "" });

export default function ApiOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({ semester: "2026/2", startDate: "2026-08-03", endDate: "2026-12-18", courses: [], teachers: [emptyTeacher()] });
  const [draft, setDraft] = useState<OnboardingCourse>(emptyCourse);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadOnboarding().then((saved) => {
      if (!cancelled && saved) setData({ ...saved, teachers: saved.teachers.length ? saved.teachers : [emptyTeacher()] });
    }).catch((cause: unknown) => {
      if (!cancelled) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus dados."); setLoadFailed(true); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function retryLoad() {
    setLoading(true); setLoadFailed(false); setError("");
    try {
      const saved = await loadOnboarding();
      if (saved) setData({ ...saved, teachers: saved.teachers.length ? saved.teachers : [emptyTeacher()] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus dados.");
      setLoadFailed(true);
    } finally { setLoading(false); }
  }

  function updateSchedule(index: number, change: Partial<CourseSchedule>) {
    setDraft((current) => ({ ...current, schedule: current.schedule.map((row, i) => i === index ? { ...row, ...change } : row) }));
  }

  function addCourse() {
    const next = { ...draft, name: draft.name.trim(), code: draft.code.trim() };
    const validation = validateOnboarding({ ...data, courses: [...data.courses, next] });
    if (validation) { setError(validation); return; }
    setError("");
    setData((current) => ({ ...current, courses: [...current.courses, next] }));
    setDraft(emptyCourse());
  }

  function continueFromSemester() {
    if (!data.semester.trim() || !data.startDate || !data.endDate || data.endDate < data.startDate) {
      setError("Informe o nome e um período válido para o semestre."); return;
    }
    setError(""); setStep(1);
  }

  function continueFromCourses() {
    if (draft.name.trim() || draft.code.trim() || draft.hours || draft.totalClasses || draft.schedule.length) {
      setError("Adicione a disciplina preenchida ou limpe os campos antes de continuar."); return;
    }
    const validation = validateOnboarding(data);
    if (validation) { setError(validation); return; }
    setError(""); setStep(2);
  }

  async function complete() {
    const validation = validateOnboarding(data);
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    let currentStage = "preparação";
    try {
      await finishOnboarding(data, (value) => { currentStage = value; setStage(value); });
      currentStage = "confirmar primeiro acesso";
      setStage(currentStage);
      const { error: authError } = await createClient().auth.updateUser({ data: { hub_school_onboarding_completed: true } });
      if (authError) throw new Error("Os dados acadêmicos foram salvos, mas não foi possível confirmar a conclusão do cadastro.");
      router.replace("/home");
      router.refresh();
    } catch (cause) {
      setError(`Não foi possível concluir em “${currentStage}”. ${cause instanceof Error ? cause.message : "Tente novamente."} Os dados já salvos serão verificados antes de repetir.`);
      try {
        const saved = await loadOnboarding();
        setConfirmed(saved ? `${saved.courses.length} disciplina(s) e ${saved.teachers.length} docente(s) confirmados pela API.` : "Nenhum semestre ativo confirmado pela API.");
      } catch { setConfirmed("Não foi possível recarregar o estado confirmado. Verifique a conexão antes de repetir."); }
    } finally { setSaving(false); }
  }

  return <main className="onboarding-page"><aside className="onboarding-aside"><Link className="brand" href="/"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></Link><div><span className="wizard-kicker">PRIMEIRO ACESSO</span><h1>Vamos preparar<br/>seu espaço<br/><em>para este semestre.</em></h1><p>Um passo por vez. Você pode atualizar essas informações quando quiser.</p></div><span className="auth-story-footer">HUB SCHOOL · FATEC FRANCA</span></aside><section className="onboarding-main"><Link className="onboarding-back" href="/login">← Sair</Link><div className="onboarding-wrap"><div className="wizard-progress"><span>PASSO {step + 1} DE 3</span><div>{[0, 1, 2].map((n) => <i key={n} className={n <= step ? "done" : ""} />)}</div></div>
    {loading ? <div className="onboarding-step" role="status">Carregando seus dados...</div> : loadFailed ? <div className="onboarding-step"><p>É necessário carregar os dados existentes antes de continuar.</p><button className="onboarding-add" onClick={() => void retryLoad()}>Tentar novamente</button></div> : <>
      {step === 0 && <div className="onboarding-step"><span className="step-icon">▦</span><h2>Seu semestre</h2><p>Defina o período que você quer organizar.</p><label>Identificação<input value={data.semester} onChange={(event) => setData({ ...data, semester: event.target.value })} /></label><div className="form-grid"><label>Data de início<input type="date" value={data.startDate} onChange={(event) => setData({ ...data, startDate: event.target.value })} /></label><label>Data de encerramento<input type="date" value={data.endDate} onChange={(event) => setData({ ...data, endDate: event.target.value })} /></label></div><Button className="onboarding-action" onPress={continueFromSemester}>Continuar <span>→</span></Button></div>}
      {step === 1 && <div className="onboarding-step"><span className="step-icon">▤</span><h2>Disciplinas e horários</h2><p>Informe a carga horária e o total de aulas exigidos pela API. Horários podem ser adicionados depois.</p>{data.courses.length > 0 && <div className="draft-list">{data.courses.map((course, index) => <div key={course.id ?? `${course.code}-${index}`}><b>{course.name}</b><small>{course.code} · {course.hours} h · {course.totalClasses} aulas · {course.schedule.length} horários</small>{!course.id && <button type="button" onClick={() => setData((current) => ({ ...current, courses: current.courses.filter((_, i) => i !== index) }))}>Remover</button>}</div>)}</div>}<div className="form-grid"><label className="wide">Nome da disciplina<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Sigla<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label><label>Carga horária (h)<input type="number" min="0.01" step="any" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} /></label><label>Total de aulas<input type="number" min="1" step="1" value={draft.totalClasses} onChange={(event) => setDraft({ ...draft, totalClasses: event.target.value })} /></label></div>{draft.schedule.map((row, index) => <div className="onboarding-schedule" key={index}><label>Dia<select value={row.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>{weekdays.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label><label>Início<input type="time" value={row.start} onChange={(event) => updateSchedule(index, { start: event.target.value })} /></label><label>Término<input type="time" value={row.end} onChange={(event) => updateSchedule(index, { end: event.target.value })} /></label><label>Sala<input value={row.room ?? ""} onChange={(event) => updateSchedule(index, { room: event.target.value })} /></label><button type="button" onClick={() => setDraft((current) => ({ ...current, schedule: current.schedule.filter((_, i) => i !== index) }))}>Remover horário</button></div>)}<button className="onboarding-add" type="button" onClick={() => setDraft((current) => ({ ...current, schedule: [...current.schedule, { day: "1", start: "08:00", end: "09:00", room: "" }] }))}>＋ Adicionar horário</button><button className="onboarding-add" type="button" onClick={addCourse}>＋ Adicionar disciplina</button><Button className="onboarding-action" onPress={continueFromCourses}>Continuar <span>→</span></Button><button className="onboarding-previous" onClick={() => { setError(""); setStep(0); }}>← Voltar</button></div>}
      {step === 2 && <div className="onboarding-step"><span className="step-icon">♙</span><h2>Docentes</h2><p>Cadastre contatos e, se quiser, associe cada docente a uma disciplina.</p>{data.teachers.map((teacher, index) => <div className="teacher-fields" key={index}><label>Nome<input value={teacher.name} onChange={(event) => setData((current) => ({ ...current, teachers: current.teachers.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))} /></label><label>E-mail<input type="email" value={teacher.email} onChange={(event) => setData((current) => ({ ...current, teachers: current.teachers.map((item, i) => i === index ? { ...item, email: event.target.value } : item) }))} /></label><label>Telefone (opcional)<input value={teacher.phone} onChange={(event) => setData((current) => ({ ...current, teachers: current.teachers.map((item, i) => i === index ? { ...item, phone: event.target.value } : item) }))} /></label><label>Disciplina vinculada<select value={teacher.courseCode} onChange={(event) => setData((current) => ({ ...current, teachers: current.teachers.map((item, i) => i === index ? { ...item, courseCode: event.target.value } : item) }))}><option value="">Nenhuma</option>{data.courses.map((course) => <option key={course.code} value={course.code}>{course.name}</option>)}</select></label></div>)}<button className="onboarding-add" onClick={() => setData((current) => ({ ...current, teachers: [...current.teachers, emptyTeacher()] }))}>＋ Adicionar outro docente</button><Button className="onboarding-action" isDisabled={saving} onPress={() => void complete()}>{saving ? `${stage}...` : "Concluir configuração"} <span>→</span></Button><button className="onboarding-previous" disabled={saving} onClick={() => { setError(""); setStep(1); }}>← Voltar</button></div>}
    </>}
    {error && <p className="profile-feedback" role="alert">{error}</p>}
    {confirmed && <p className="onboarding-foot" role="status">{confirmed}</p>}
    </div><p className="onboarding-foot">Se houver falha, os dados confirmados pela API serão reutilizados na próxima tentativa.</p></section></main>;
}
