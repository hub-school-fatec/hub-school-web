"use client";

import { useEffect, useState } from "react";
import { filterEventsForSemester, getEvents, type AcademicEvent } from "../../lib/events";
import type { Course } from "../../lib/courses";
import type { Semester } from "../../lib/semesters";

const demoEventsKey = "hub-school-demo-events";

function typeName(type: string) {
  return ({ prova: "Prova", trabalho: "Trabalho", apresentacao: "Apresentação", aula: "Aula", evento: "Evento" } as Record<string, string>)[type] ?? "Evento";
}
function getUpcomingItems(events: AcademicEvent[]) {
  const now = Date.now();
  return events.filter((event) => new Date(event.end || event.start).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
}

export default function UpcomingEvents({ semester, courses }: { semester: Semester | null; courses: Course[] }) {
  const apiMode = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      setLoading(apiMode);
      if (!apiMode) {
        try {
          const saved = window.localStorage.getItem(demoEventsKey);
          setEvents(saved ? JSON.parse(saved) as AcademicEvent[] : []);
        } catch {
          window.localStorage.removeItem(demoEventsKey);
          setEvents([]);
        }
        setLoading(false);
        return;
      }
      try {
        const result = await getEvents();
        if (!cancelled) setEvents(result);
      } catch (loadError) {
        if (!cancelled) { setEvents([]); setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os próximos eventos."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [apiMode, reloadKey]);

  const upcoming = getUpcomingItems(filterEventsForSemester(events, semester, courses));
  return <section className="panel upcoming-events-panel"><div className="panel-heading"><div><h3>Próximos compromissos</h3><p>Provas, entregas e eventos que vêm aí.</p></div><span className="discipline-count">{loading ? "…" : String(upcoming.length).padStart(2, "0")}</span></div>{loading ? <div className="course-list-state" role="status">Carregando eventos…</div> : error ? <div className="course-list-state course-list-error" role="alert"><span>{error}</span><button className="outline-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></div> : upcoming.length ? <div className="upcoming-event-list">{upcoming.map((event) => <article key={event.id}><span className={`upcoming-event-mark event-${event.type}`}/><div><b>{event.title}</b><small>{new Date(event.start).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {typeName(event.type)}</small></div></article>)}</div> : <div className="course-list-state">Nenhum evento próximo cadastrado.</div>}</section>;
}
