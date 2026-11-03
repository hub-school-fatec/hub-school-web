"use client";

import { Button } from "@heroui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CourseDraft = { name: string; code: string; hours: string; classesPerWeek: string; days: string; time: string; room: string };
type TeacherDraft = { name: string; email: string; phone: string; courseCode: string };

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [semester, setSemester] = useState("2026/2");
  const [startDate, setStartDate] = useState("2026-08-03");
  const [endDate, setEndDate] = useState("2026-12-18");
  const [courses, setCourses] = useState<CourseDraft[]>([]);
  const [draft, setDraft] = useState<CourseDraft>({ name: "", code: "", hours: "", classesPerWeek: "", days: "", time: "", room: "" });
  const [teachers, setTeachers] = useState<TeacherDraft[]>([{ name: "", email: "", phone: "", courseCode: "" }]);

  function addCourse() {
    if (!draft.name.trim() || !draft.code.trim()) return;
    setCourses([...courses, draft]);
    setDraft({ name: "", code: "", hours: "", classesPerWeek: "", days: "", time: "", room: "" });
  }
  function updateTeacher(index: number, field: "name" | "email" | "phone" | "courseCode", value: string) {
    setTeachers(teachers.map((teacher, i) => i === index ? { ...teacher, [field]: value } : teacher));
  }

  return <main className="onboarding-page"><aside className="onboarding-aside"><Link className="brand" href="/"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></Link><div><span className="wizard-kicker">PRIMEIRO ACESSO</span><h1>Vamos preparar<br/>seu espaço<br/><em>para este semestre.</em></h1><p>Um passo por vez. Você pode atualizar essas informações quando quiser.</p></div><span className="auth-story-footer">HUB SCHOOL · FATEC FRANCA</span></aside><section className="onboarding-main"><Link className="onboarding-back" href="/login">← Sair</Link><div className="onboarding-wrap"><div className="wizard-progress"><span>PASSO {step + 1} DE 3</span><div>{[0,1,2].map(n => <i key={n} className={n <= step ? "done" : ""}/>)}</div></div>
    {step === 0 && <div className="onboarding-step"><span className="step-icon">▦</span><h2>Seu semestre</h2><p>Defina o período que você quer organizar.</p><label>Identificação<input value={semester} onChange={e => setSemester(e.target.value)} placeholder="Ex.: 2026/2"/></label><div className="form-grid"><label>Data de início<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}/></label><label>Data de encerramento<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}/></label></div><Button className="onboarding-action" onPress={() => setStep(1)}>Continuar <span>→</span></Button></div>}
    {step === 1 && <div className="onboarding-step"><span className="step-icon">▤</span><h2>Disciplinas e horários</h2><p>Adicione as matérias e os detalhes que já tiver em mãos.</p>{courses.length > 0 && <div className="draft-list">{courses.map((course, index) => <div key={`${course.code}-${index}`}><b>{course.name}</b><small>{course.code} · {course.hours || "Carga horária pendente"} h · {course.classesPerWeek || "Aulas/semana pendente"} aulas/semana · {course.days || "Dias a definir"} {course.time}</small></div>)}</div>}<div className="form-grid"><label className="wide">Nome da disciplina<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Engenharia de Software"/></label><label>Sigla<input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="ESW"/></label><label>Carga horária (h)<input type="number" min="1" value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value })} placeholder="80"/></label><label>Aulas por semana<input type="number" min="1" value={draft.classesPerWeek} onChange={e => setDraft({ ...draft, classesPerWeek: e.target.value })} placeholder="2"/></label><label>Dias da semana<input value={draft.days} onChange={e => setDraft({ ...draft, days: e.target.value })} placeholder="Seg · Qua"/></label><label>Horário<input value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} placeholder="19:00 – 20:40"/></label><label>Sala<input value={draft.room} onChange={e => setDraft({ ...draft, room: e.target.value })} placeholder="Lab 04"/></label></div><button className="onboarding-add" onClick={addCourse}>＋ Adicionar disciplina</button><Button className="onboarding-action" onPress={() => setStep(2)}>Continuar <span>→</span></Button><button className="onboarding-previous" onClick={() => setStep(0)}>← Voltar</button></div>}
    {step === 2 && <div className="onboarding-step"><span className="step-icon">♙</span><h2>Docentes</h2><p>Guarde os contatos dos professores e relacione-os ao seu semestre.</p>{teachers.map((teacher, index) => <div className="teacher-fields" key={index}><label>Nome<input value={teacher.name} onChange={e => updateTeacher(index, "name", e.target.value)} placeholder="Nome do docente"/></label><label>E-mail<input type="email" value={teacher.email} onChange={e => updateTeacher(index, "email", e.target.value)} placeholder="nome@fatec.sp.gov.br"/></label><label>Telefone / WhatsApp (opcional)<input value={teacher.phone} onChange={e => updateTeacher(index, "phone", e.target.value)} placeholder="(00) 00000-0000"/></label><label>Disciplina vinculada<select value={teacher.courseCode} onChange={e => updateTeacher(index, "courseCode", e.target.value)}><option value="">Selecione</option>{courses.map((course, i) => <option value={course.code} key={i}>{course.name}</option>)}</select></label></div>)}<button className="onboarding-add" onClick={() => setTeachers([...teachers, { name: "", email: "", phone: "", courseCode: "" }])}>＋ Adicionar outro docente</button><Button className="onboarding-action" onPress={() => router.push("/home")}>Concluir configuração <span>→</span></Button><button className="onboarding-previous" onClick={() => setStep(1)}>← Voltar</button></div>}
    </div><p className="onboarding-foot">Você pode completar ou editar esses dados depois.</p></section></main>;
}
