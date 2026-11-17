"use client";

/* eslint-disable @next/next/no-img-element -- Prévia local de blob autenticado, sem URL pública. */

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Course } from "../../lib/courses";
import { getEvents, type AcademicEvent } from "../../lib/events";
import { deleteNote, deleteNoteAttachment, downloadNoteAttachment, getNotes, saveNote, uploadNoteAttachment, type AcademicNote, type NoteAttachment } from "../../lib/notes";

const demoNotesKey = "hub-school-demo-notes";
const demoEventsKey = "hub-school-demo-events";
const maxAttachmentBytes = 10 * 1024 * 1024;

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
function isAllowedFile(file: File) { return allowedTypes.has(file.type) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(file.name) && !file.name.includes(".."); }

export default function NotesView({ courses }: { courses: Course[] }) {
  const apiMode = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [notes, setNotes] = useState<AcademicNote[]>([]);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [eventWarning, setEventWarning] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAttachment, setBusyAttachment] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      setEventWarning("");
      setLoading(apiMode);
      if (!apiMode) {
        try {
          const savedNotes = window.localStorage.getItem(demoNotesKey);
          const savedEvents = window.localStorage.getItem(demoEventsKey);
          setNotes(savedNotes ? JSON.parse(savedNotes) as AcademicNote[] : []);
          setEvents(savedEvents ? JSON.parse(savedEvents) as AcademicEvent[] : []);
        } catch {
          window.localStorage.removeItem(demoNotesKey);
          setNotes([]);
          setEvents([]);
        }
        setLoading(false);
        return;
      }
      const [notesResult, eventsResult] = await Promise.allSettled([getNotes(), getEvents()]);
      if (cancelled) return;
      if (notesResult.status === "fulfilled") setNotes(notesResult.value);
      else { setNotes([]); setError(notesResult.reason instanceof Error ? notesResult.reason.message : "Não foi possível carregar as anotações."); }
      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
      else { setEvents([]); setEventWarning(eventsResult.reason instanceof Error ? eventsResult.reason.message : "Não foi possível carregar os eventos para vincular."); }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [apiMode, reloadKey]);
  const filteredNotes = useMemo(() => notes.filter((note) => {
    const textMatch = !query.trim() || `${note.title} ${note.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return textMatch && (!courseFilter || note.courseId === courseFilter) && (!eventFilter || note.eventId === eventFilter);
  }), [notes, query, courseFilter, eventFilter]);

  function openEditor(note: AcademicNote | null = null) {
    setEditing(note);
    setFormError("");
    setEditorOpen(true);
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title")).trim();
    const body = String(form.get("body") ?? "");
    const courseId = String(form.get("courseId") ?? "") || null;
    const eventId = String(form.get("eventId") ?? "") || null;
    const files = Array.from(form.getAll("attachments")).filter((item): item is File => item instanceof File && Boolean(item.name));
    const invalidFile = files.find((file) => !isAllowedFile(file) || file.size <= 0 || file.size > maxAttachmentBytes);
    if (invalidFile) {
      setFormError(!isAllowedFile(invalidFile) ? "Use PDF, JPEG, PNG, WEBP, GIF ou AVIF com nome simples, sem espaços ou acentos." : invalidFile.size <= 0 ? "O arquivo está vazio." : "Cada arquivo deve ter no máximo 10 MB.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      let saved: AcademicNote;
      if (apiMode) {
        const result = await saveNote({ title, body, courseId, eventId }, editing?.id);
        if (files.length) {
          try {
            for (const file of files) await uploadNoteAttachment(result.id, file);
          } catch (uploadError) {
            setNotice(`Anotação salva, mas o envio de anexos foi interrompido: ${uploadError instanceof Error ? uploadError.message : "falha no upload"}. Confira os arquivos confirmados antes de tentar novamente.`);
          }
        }
        setReloadKey((key) => key + 1);
        setEditorOpen(false);
        formElement.reset();
        return;
      } else {
        saved = {
          id: editing?.id ?? `demo-note-${crypto.randomUUID()}`,
          title,
          body,
          courseId,
          eventId,
          attachments: [...(editing?.attachments ?? []), ...files.map((file): NoteAttachment => ({ id: `${Date.now()}-${file.name}`, name: file.name, size: file.size }))],
          updatedAt: new Date().toISOString(),
        };
      }
      setNotes((current) => {
        const next = editing ? current.map((note) => note.id === saved.id ? saved : note) : [saved, ...current];
        if (!apiMode) window.localStorage.setItem(demoNotesKey, JSON.stringify(next));
        return next;
      });
      setEditorOpen(false);
      formElement.reset();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a anotação.");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(note: AcademicNote) {
    if (!window.confirm(`Excluir a anotação “${note.title}”?`)) return;
    try {
      if (apiMode) {
        for (const attachment of note.attachments) {
          await deleteNoteAttachment(attachment.id);
        }
        await deleteNote(note.id);
      }
      setNotes((current) => {
        const next = current.filter((item) => item.id !== note.id);
        if (!apiMode) window.localStorage.setItem(demoNotesKey, JSON.stringify(next));
        return next;
      });
      setNotice(`Anotação “${note.title}” excluída.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a anotação.");
    }
  }

  async function downloadAttachment(file: NoteAttachment) {
    setBusyAttachment(file.id);
    try {
      const blob = await downloadNoteAttachment(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Não foi possível baixar o anexo.");
    } finally { setBusyAttachment(null); }
  }

  async function previewAttachment(file: NoteAttachment) {
    if (!file.mime || (file.mime !== "application/pdf" && !file.mime.startsWith("image/"))) return;
    setBusyAttachment(file.id);
    try {
      const blob = await downloadNoteAttachment(file.id);
      setPreview({ url: URL.createObjectURL(blob), name: file.name, mime: file.mime });
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Não foi possível visualizar o anexo.");
    } finally { setBusyAttachment(null); }
  }

  function closePreview() {
    setPreview(null);
  }

  async function removeAttachment(file: NoteAttachment) {
    if (!window.confirm("Excluir este anexo?")) return;
    setBusyAttachment(file.id);
    try {
      await deleteNoteAttachment(file.id);
      setReloadKey((key) => key + 1);
    } catch {
      setNotice("Exclusão do anexo não confirmada. Atualize a lista antes de tentar novamente.");
      setReloadKey((key) => key + 1);
    } finally { setBusyAttachment(null); }
  }

  return <div className="notes-view">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> SEU MATERIAL ACADÊMICO</div><h1>Anotações</h1><p className="welcome-copy">Suas ideias, lembretes e materiais organizados por disciplina e evento.</p></div><button className="primary-button" type="button" onClick={() => openEditor()}><span>＋</span> Nova anotação</button></div>
    <section className="panel notes-panel">
      <div className="notes-filters"><label className="notes-search">Buscar anotações<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título ou conteúdo"/></label><label>Disciplina<select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="">Todas</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Evento<select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="">Todos</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
      {eventWarning && <p className="notes-warning" role="status">Eventos indisponíveis para vinculação: {eventWarning}</p>}
      {loading ? <div className="course-list-state" role="status" aria-live="polite">Carregando suas anotações…</div>
        : error ? <div className="course-list-state course-list-error" role="alert"><b>Não foi possível carregar suas anotações.</b><span>{error}</span><button className="outline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></div>
          : filteredNotes.length === 0 ? <div className="all-disciplines-empty"><b>{notes.length ? "Nenhuma anotação corresponde à busca" : "Ainda não há anotações"}</b><span>{notes.length ? "Experimente alterar os filtros." : "Crie uma anotação e vincule-a a uma disciplina ou evento."}</span>{!notes.length && <button className="outline-button" type="button" onClick={() => openEditor()}>Criar anotação</button>}</div>
            : <div className="note-grid">{filteredNotes.map((note) => <article className="note-card" key={note.id}><div className="note-card-top"><span className="note-date">{new Date(note.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</span><div><button type="button" aria-label={`Editar ${note.title}`} onClick={() => openEditor(note)}>Editar</button><button type="button" className="note-delete" aria-label={`Excluir ${note.title}`} onClick={() => void removeNote(note)}>Excluir</button></div></div><h3>{note.title}</h3><p>{note.body}</p><div className="note-links">{note.courseId && <span>{courses.find((course) => course.id === note.courseId)?.name ?? "Disciplina"}</span>}{note.eventId && <span>{events.find((item) => item.id === note.eventId)?.title ?? "Evento"}</span>}</div>{note.attachments.length > 0 && <ul className="note-attachments">{note.attachments.map((file) => <li key={file.id}>▧ <span>{file.name}</span>{apiMode && <><button type="button" disabled={busyAttachment === file.id} onClick={() => void previewAttachment(file)}>Visualizar</button><button type="button" disabled={busyAttachment === file.id} onClick={() => void downloadAttachment(file)}>Baixar</button><button type="button" disabled={busyAttachment === file.id} onClick={() => void removeAttachment(file)}>Excluir</button></>}</li>)}</ul>}</article>)}</div>}
    </section>
    {notice && <div className="toast" role="status">{notice}</div>}
    {preview && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }}><div className="modal note-preview" role="dialog" aria-modal="true" aria-label={`Visualizar ${preview.name}`}><button type="button" className="modal-close" aria-label="Fechar prévia" onClick={closePreview}>×</button><h2>{preview.name}</h2>{preview.mime === "application/pdf" ? <iframe src={preview.url} title={preview.name} /> : <img src={preview.url} alt={preview.name} />}</div></div>}
    {editorOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form className="modal note-editor" onSubmit={submitNote}><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setEditorOpen(false)}>×</button><span className="eyebrow">ANOTAÇÕES</span><h2>{editing ? "Editar anotação" : "Nova anotação"}</h2><p>Escreva livremente e vincule a uma disciplina ou evento.</p><label>Título<input name="title" required maxLength={140} defaultValue={editing?.title ?? ""} placeholder="Ex.: Revisar conteúdo para P1"/></label><label>Conteúdo<textarea name="body" rows={6} defaultValue={editing?.body ?? ""} placeholder="Escreva sua anotação…"/></label><div className="form-grid"><label>Disciplina (opcional)<select name="courseId" defaultValue={editing?.courseId ?? ""}><option value="">Nenhuma</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Evento (opcional)<select name="eventId" defaultValue={editing?.eventId ?? ""}><option value="">Nenhum</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><label className="note-file-field">Anexos (PDF ou imagem, até 10 MB por arquivo)<input type="file" name="attachments" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,image/avif" multiple/><small>{editing?.attachments.map((file) => file.name).join(" · ")}</small></label>{formError && <div className="profile-feedback" role="alert">{formError}</div>}<div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar anotação"}</button></div></form></div>}
  </div>;
}
