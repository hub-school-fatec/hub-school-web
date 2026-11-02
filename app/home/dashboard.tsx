"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/config";

type Course = { name: string; code: string; teacher: string; days: string; time: string; room: string };
type DashboardProfile = { name: string; email: string };

const initialCourses: Course[] = [
  { name: "Engenharia de Software", code: "ESW", teacher: "Prof.ª Mariana Costa", days: "Seg · Qua", time: "19:00 – 20:40", room: "Lab 04" },
  { name: "Banco de Dados", code: "BD", teacher: "Prof. Rafael Mendes", days: "Ter · Qui", time: "20:50 – 22:30", room: "Sala 12" },
];
const navItems = ["Visão geral", "Disciplinas", "Docentes", "Agenda", "Anotações"];
const demoProfileStorageKey = "hub-school-demo-profile-name";

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
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [savedProfileName, setSavedProfileName] = useState(profile.name);
  const demoSavedProfileName = useSyncExternalStore(subscribeToDemoProfile, getDemoProfileName, getServerDemoProfileName);
  const profileName = isSupabaseConfigured() ? savedProfileName : demoSavedProfileName || savedProfileName;
  const [profileDraft, setProfileDraft] = useState(profile.name);
  const [profileFeedback, setProfileFeedback] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState("Visão geral");
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [term, setTerm] = useState("2026/2");
  const [start, setStart] = useState("2026-08-03");
  const [end, setEnd] = useState("2026-12-18");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [courseForm, setCourseForm] = useState(false);
  const [notice, setNotice] = useState("");

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

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }
  async function signOut() {
    setProfileOpen(false);
    if (isSupabaseConfigured()) await createClient().auth.signOut();
    router.push("/login");
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = profileDraft.trim();
    if (!nextName) {
      setProfileFeedback("Informe um nome para continuar.");
      return;
    }

    setProfileSaving(true);
    setProfileFeedback("");
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) throw userError ?? new Error("Não foi possível carregar seu perfil.");
        const { error } = await supabase.auth.updateUser({
          data: { ...data.user.user_metadata, full_name: nextName, name: nextName },
        });
        if (error) throw error;
      } else {
        window.localStorage.setItem(demoProfileStorageKey, nextName);
        window.dispatchEvent(new Event("hub-school-demo-profile-change"));
      }
      setSavedProfileName(nextName);
      setProfileEditorOpen(false);
      notify("Nome atualizado com sucesso.");
    } catch (error) {
      setProfileFeedback(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    } finally {
      setProfileSaving(false);
    }
  }
  const profileInitials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "A";
  function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCourses([...courses, {
      name: String(data.get("name")), code: String(data.get("code")), teacher: String(data.get("teacher")),
      days: String(data.get("days")), time: String(data.get("time")), room: String(data.get("room")),
    }]);
    setCourseForm(false); notify("Disciplina adicionada ao semestre.");
  }
  function finishWizard() { setWizard(false); setStep(0); setPage("Visão geral"); notify("Seu semestre está pronto para começar!"); }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#inicio" onClick={() => setPage("Visão geral")}><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></a>
      <div className="school-label">ESPAÇO DO ALUNO</div>
      <button className="term-switch" onClick={() => { setStep(0); setWizard(true); }}><span className="term-dot"/><span><small>SEMESTRE ATIVO</small><b>{term}</b></span><span className="chevron">⌄</span></button>
      <div className="nav-label">MENU</div>
      <nav>{navItems.map((item, i) => <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => setPage(item)}><span className="nav-icon">{["⌂", "▤", "♙", "▦", "▧"][i]}</span>{item}{item === "Agenda" && <span className="nav-count">2</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><b>Seu semestre, mais leve.</b><p>Um passo de cada vez e tudo fica no lugar.</p><button onClick={() => { setStep(0); setWizard(true); }}>Configurar semestre <span>↗</span></button></div><div className="profile"><span className="avatar">{profileInitials}</span><span><b>{profileName}</b><small>Aluno Fatec Franca</small></span></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">Meu espaço <span>/</span> <b>{page}</b></div><div className="top-actions"><button className="icon-button" aria-label="Notificações" onClick={() => notify("Você está em dia por aqui.")}>♧<i/></button><div className="top-divider"/><div className="profile-menu-anchor" ref={profileMenuRef}><button className="top-profile" title="Abrir perfil" aria-label="Abrir perfil" aria-haspopup="dialog" aria-expanded={profileOpen} aria-controls="profile-menu" onClick={() => setProfileOpen(open => !open)}><span className="avatar small-avatar">{profileInitials}</span><span>{profileName}</span></button>{profileOpen && <div className="profile-menu" id="profile-menu" role="dialog" aria-label="Prévia do perfil"><div className="profile-menu-heading"><span className="avatar profile-menu-avatar">{profileInitials}</span><div><b>{profileName}</b><small>{profile.email || "Aluno Fatec Franca"}</small></div></div><div className="profile-menu-divider"/><div className="profile-academic"><span>▦</span><div><small>PERFIL ACADÊMICO</small><b>Estudante · Fatec Franca</b></div></div><button className="profile-edit" onClick={() => { setProfileDraft(profileName); setProfileFeedback(""); setProfileOpen(false); setProfileEditorOpen(true); }}><span>✎</span>Editar informações</button><button className="profile-logout" onClick={signOut}><span>↪</span>Sair da conta</button></div>}</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> SEGUNDO SEMESTRE · FATEC FRANCA</div><h1>{page === "Visão geral" ? <>Seu espaço,<br/><em>do seu jeito.</em></> : page}</h1><p className="welcome-copy">Tudo o que você precisa para viver bem o semestre, em um só lugar.</p></div><button className="primary-button" onClick={() => page === "Disciplinas" ? setCourseForm(true) : (setStep(0), setWizard(true))}><span>＋</span> {page === "Disciplinas" ? "Nova disciplina" : "Configurar semestre"}</button></div>

        <div className="stat-grid"><article className="stat-card"><div className="stat-top"><span>SEMESTRE ATIVO</span><span className="stat-icon lilac">▦</span></div><strong>{term}</strong><p>03 ago — 18 dez, 2026 <span className="status-pill">Em andamento</span></p></article><article className="stat-card"><div className="stat-top"><span>DISCIPLINAS</span><span className="stat-icon mint">▤</span></div><strong>{String(courses.length).padStart(2, "0")}</strong><p>no seu semestre <button className="text-action" onClick={() => { setPage("Disciplinas"); }}>Ver todas <span>↗</span></button></p></article><article className="stat-card"><div className="stat-top"><span>DOCENTES</span><span className="stat-icon peach">♙</span></div><strong>{String(new Set(courses.map(c => c.teacher)).size).padStart(2, "0")}</strong><p>conectados às disciplinas <button className="text-action" onClick={() => setPage("Docentes")}>Ver contatos <span>↗</span></button></p></article></div>

        <div className="section-heading"><div><div className="eyebrow">SEU SEMESTRE</div><h2>Uma boa rotina começa aqui.</h2></div><button className="subtle-button" onClick={() => { setStep(0); setWizard(true); }}>Editar semestre <span>↗</span></button></div>
        <div className="lower-grid"><section className="panel courses-panel"><div className="panel-heading"><div><h3>Suas disciplinas</h3><p>O que faz parte da sua jornada.</p></div><button className="round-add" aria-label="Adicionar disciplina" onClick={() => setCourseForm(true)}>＋</button></div><div className="course-list">{courses.slice(0, 4).map((c, i) => <article className="course-row" key={`${c.code}-${i}`}><div className={`course-monogram tone-${i % 4}`}>{c.code.slice(0, 2).toUpperCase()}</div><div className="course-main"><div className="course-title"><b>{c.name}</b><span>{c.code}</span></div><div className="course-meta"><span>♙ {c.teacher}</span><span>◷ {c.days} · {c.time}</span></div></div><div className="course-room">⌖ <span>{c.room}</span></div><button className="row-more" aria-label={`Opções de ${c.name}`} onClick={() => notify("Edição de disciplina em breve.")}>···</button></article>)}</div><button className="panel-link" onClick={() => setPage("Disciplinas")}>Ver todas as disciplinas <span>→</span></button></section>
          <section className="panel setup-panel"><div className="setup-art"><span className="sun-shape"/><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✦</span><div className="art-note"><span>✎</span><div><b>Seu próximo passo</b><small>Complete seu perfil acadêmico</small></div><span className="note-arrow">↗</span></div><div className="plant">✳<br/>╱│╲<br/>╱ │ ╲</div></div><div className="setup-copy"><span className="mini-label">TUDO EM ORDEM</span><h3>O começo de<br/>uma boa fase.</h3><p>Adicione os contatos dos seus docentes e deixe seu semestre completo.</p><button className="outline-button" onClick={() => setPage("Docentes")}>Adicionar docentes <span>→</span></button></div></section></div>
        <footer className="footer"><span>Feito para acompanhar você. <b>✳</b></span><span>HUB SCHOOL · 2026</span></footer>
      </div>
    </section>

    {courseForm && <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) setCourseForm(false); }}><form className="modal" onSubmit={addCourse}><button type="button" className="modal-close" onClick={() => setCourseForm(false)}>×</button><span className="eyebrow">SEU SEMESTRE</span><h2>Nova disciplina</h2><p>Adicione uma matéria e organize os detalhes das aulas.</p><div className="form-grid"><label className="wide">Nome da disciplina<input name="name" required placeholder="Ex.: Engenharia de Software"/></label><label>Sigla<input name="code" required placeholder="Ex.: ESW"/></label><label>Docente<input name="teacher" required placeholder="Nome do professor"/></label><label>Dias da semana<input name="days" placeholder="Seg · Qua"/></label><label>Horário<input name="time" placeholder="19:00 – 20:40"/></label><label className="wide">Sala<input name="room" placeholder="Ex.: Lab 04"/></label></div><div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setCourseForm(false)}>Cancelar</button><button className="primary-button">Adicionar disciplina</button></div></form></div>}

    {profileEditorOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileEditorOpen(false); }}><form className="modal profile-editor" onSubmit={saveProfile}><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setProfileEditorOpen(false)}>×</button><span className="eyebrow">MEU PERFIL</span><h2>Editar informações</h2><p>Atualize o nome que aparece no seu espaço acadêmico.</p><label>Nome de usuário<input autoFocus required maxLength={60} value={profileDraft} onChange={event => setProfileDraft(event.target.value)} placeholder="Seu nome"/></label>{profile.email && <label>E-mail<input value={profile.email} readOnly/></label>}{profileFeedback && <div className="profile-feedback" role="alert">{profileFeedback}</div>}<div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setProfileEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={profileSaving}>{profileSaving ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}{wizard && <div className="modal-backdrop wizard-backdrop"><section className="wizard"><button className="modal-close" onClick={() => setWizard(false)}>×</button><div className="wizard-side"><a className="brand" href="#inicio"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></a><div className="wizard-side-content"><span className="wizard-kicker">PRIMEIRO ACESSO</span><h2>Vamos deixar<br/>seu semestre<br/><em>com a sua cara.</em></h2><p>Em poucos passos, seu espaço acadêmico fica pronto para acompanhar você.</p></div><div className="wizard-side-bottom">✳ <span>Organização que cabe na sua rotina.</span></div></div><div className="wizard-main"><div className="wizard-progress"><span>PASSO {step + 1} DE 3</span><div>{[0,1,2].map(n => <i key={n} className={n <= step ? "done" : ""}/>)}</div></div>{step === 0 && <div className="wizard-content"><span className="step-icon">▦</span><h2>Qual semestre<br/>vamos organizar?</h2><p>Comece pelo básico. Você pode ajustar essas informações depois.</p><label>Identificação do semestre<input value={term} onChange={e => setTerm(e.target.value)} placeholder="Ex.: 2026/2"/></label><div className="form-grid date-grid"><label>Data de início<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>Data de encerramento<input type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div><button className="primary-button full-button" onClick={() => setStep(1)}>Continuar <span>→</span></button><button className="skip-button" onClick={finishWizard}>Faço isso depois</button></div>}{step === 1 && <div className="wizard-content"><span className="step-icon">▤</span><h2>Quais matérias<br/>você vai cursar?</h2><p>Você já pode começar com as disciplinas que conhece.</p><div className="wizard-course-list">{courses.map((c, i) => <div key={i}><span className={`course-monogram tone-${i % 4}`}>{c.code.slice(0,2)}</span><span><b>{c.name}</b><small>{c.days} · {c.time}</small></span><span className="checkmark">✓</span></div>)}</div><button className="wizard-add" onClick={() => { setWizard(false); setCourseForm(true); }}>＋ Adicionar outra disciplina</button><button className="primary-button full-button" onClick={() => setStep(2)}>Continuar <span>→</span></button><button className="back-link" onClick={() => setStep(0)}>← Voltar</button></div>}{step === 2 && <div className="wizard-content"><span className="step-icon">♙</span><h2>Quem vai estar<br/>com você nessa?</h2><p>Vincule docentes às disciplinas para encontrar tudo rapidinho.</p><div className="teacher-list">{courses.map((c, i) => <label key={i}><span className={`teacher-avatar tone-${i % 4}`}>{c.teacher.split(" ").slice(-1)[0].slice(0,1)}</span><span><b>{c.teacher}</b><small>{c.name}</small></span><span className="teacher-check">✓</span></label>)}</div><label className="teacher-invite">E-mail institucional (opcional)<input type="email" placeholder="nome@fatec.sp.gov.br"/></label><button className="primary-button full-button" onClick={finishWizard}>Concluir configuração <span>→</span></button><button className="back-link" onClick={() => setStep(1)}>← Voltar</button></div>}</div></section></div>}
    {notice && <div className="toast">✓ <span>{notice}</span></div>}
  </main>;
}
