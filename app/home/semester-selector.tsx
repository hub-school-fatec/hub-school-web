"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activateSemester, getSemesters, isSemesterDemoMode, type Semester } from "../../lib/semesters";

function semesterErrorMessage(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return "Não foi possível conectar à API. Confira se ela está em execução e se NEXT_PUBLIC_API_URL está correto.";
  }
  return error instanceof Error ? error.message : fallback;
}

type SemesterSelectorProps = {
  onSemesterChange: (semester: Semester | null) => void;
  onCreateSemester: () => void;
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function SemesterSelector({ onSemesterChange, onCreateSemester }: SemesterSelectorProps) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const onSemesterChangeRef = useRef(onSemesterChange);
  const activeSemester = semesters.find((semester) => semester.ativo) ?? null;

  useEffect(() => {
    onSemesterChangeRef.current = onSemesterChange;
  }, [onSemesterChange]);

  const loadSemesters = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getSemesters();
      setSemesters(result);
      let active = result.find((semester) => semester.ativo) ?? null;
      if (!active && result.length > 0) {
        const updated = await activateSemester(result[0].id);
        setSemesters(updated);
        active = updated.find((semester) => semester.ativo) ?? updated[0];
      }
      onSemesterChangeRef.current(active);
    } catch (loadError) {
      setError(semesterErrorMessage(loadError, "Não foi possível carregar os semestres."));
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- perform the initial network request when the selector mounts. */
  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.addEventListener("hub-school-semesters-change", loadSemesters);
    return () => window.removeEventListener("hub-school-semesters-change", loadSemesters);
  }, [loadSemesters]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleMenuKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const options = Array.from(optionsRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? []);
      if (!options.length) return;
      event.preventDefault();
      const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? (direction === 1 ? 0 : options.length - 1)
        : (currentIndex + direction + options.length) % options.length;
      options[nextIndex].focus();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", handleMenuKeys);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", handleMenuKeys);
    };
  }, [open]);

  async function handleSelection(id: string) {
    if (!id) return;
    if (id === activeSemester?.id) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await activateSemester(id);
      setSemesters(result);
      onSemesterChangeRef.current(result.find((semester) => semester.ativo) ?? null);
      setOpen(false);
    } catch (selectionError) {
      setError(semesterErrorMessage(selectionError, "Não foi possível selecionar esse semestre."));
    } finally {
      setSaving(false);
    }
  }

  const selectorText = loading
    ? "Carregando…"
    : saving
      ? "Salvando…"
      : activeSemester?.nome ?? (semesters.length ? "Selecione um semestre" : "Nenhum cadastrado");

  return <>
    <div className="semester-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        className="term-switch semester-switch"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="semester-options"
        disabled={loading || saving}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="term-dot" />
        <span><small>SEMESTRE ATIVO</small><b>{selectorText}</b></span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="semester-options" id="semester-options" role="menu" aria-label="Selecionar semestre" ref={optionsRef}>
        {semesters.map((semester) => {
          const dateRange = semester.data_inicio && semester.data_fim
            ? `${formatDate(semester.data_inicio)} — ${formatDate(semester.data_fim)}`
            : "Período não informado";
          return <button
            key={semester.id}
            type="button"
            role="menuitemradio"
            aria-checked={semester.id === activeSemester?.id}
            className="semester-option"
            onClick={() => void handleSelection(semester.id)}
          >
            <span><b>{semester.nome}</b><small>{dateRange}</small></span>
            {semester.id === activeSemester?.id && <span className="semester-option-check" aria-hidden="true">✓</span>}
          </button>;
        })}
        <button type="button" className="semester-option semester-create-option" role="menuitem" onClick={() => { setOpen(false); onCreateSemester(); }}>＋ Novo semestre</button>
      </div>}
    </div>
    {isSemesterDemoMode() && <small className="semester-demo-hint">Modo de demonstração</small>}
    {error && <p className="semester-feedback" role="alert">{error} <button type="button" onClick={() => void loadSemesters()}>Tentar novamente</button></p>}
  </>;
}
