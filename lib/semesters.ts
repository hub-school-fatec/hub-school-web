import { apiFetch } from "./api";

export type Semester = {
  id: string;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
};

const demoStorageKey = "hub-school-demo-active-semester";
const demoSemestersStorageKey = "hub-school-demo-semesters";
const demoSemesters: Semester[] = [
  { id: "demo-2026-2", nome: "2026/2", data_inicio: "2026-08-03", data_fim: "2026-12-18", ativo: true },
  { id: "demo-2026-1", nome: "2026/1", data_inicio: "2026-02-02", data_fim: "2026-06-30", ativo: false },
];

export function isSemesterDemoMode() {
  return !process.env.NEXT_PUBLIC_API_URL;
}

function getDemoSemesters(): Semester[] {
  let savedSemesters: Semester[] = demoSemesters;
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(demoSemestersStorageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) savedSemesters = parsed as Semester[];
      }
    } catch {
      savedSemesters = demoSemesters;
    }
  }
  const activeId = typeof window === "undefined"
    ? demoSemesters[0].id
    : window.localStorage.getItem(demoStorageKey) ?? demoSemesters[0].id;
  return savedSemesters.map((semester) => ({ ...semester, ativo: semester.id === activeId }));
}

export async function createSemester(input: Pick<Semester, "nome" | "data_inicio" | "data_fim">): Promise<Semester> {
  if (isSemesterDemoMode()) {
    const semesters = getDemoSemesters().map((semester) => ({ ...semester, ativo: false }));
    const semester: Semester = { id: `demo-${crypto.randomUUID()}`, ...input, ativo: true };
    semesters.unshift(semester);
    window.localStorage.setItem(demoSemestersStorageKey, JSON.stringify(semesters));
    window.localStorage.setItem(demoStorageKey, semester.id);
    window.dispatchEvent(new Event("hub-school-semesters-change"));
    return semester;
  }

  try {
    const existingList = await getSemesters();
    const found = existingList.find((s) => s.nome.trim().toLowerCase() === input.nome.trim().toLowerCase());
    if (found) {
      await updateSemester(found.id, input);
      await activateSemester(found.id);
      window.dispatchEvent(new Event("hub-school-semesters-change"));
      return { ...found, ...input, ativo: true };
    }
  } catch {
    // segue para o POST caso a busca falhe
  }

  const result = await apiFetch<Semester>("semestres", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await activateSemester(result.id);
  window.dispatchEvent(new Event("hub-school-semesters-change"));
  return { ...result, ativo: true };
}

export async function updateSemester(id: string, input: Pick<Semester, "nome" | "data_inicio" | "data_fim">): Promise<Semester> {
  if (isSemesterDemoMode()) {
    const semesters = getDemoSemesters().map((semester) => semester.id === id ? { ...semester, ...input } : semester);
    window.localStorage.setItem(demoSemestersStorageKey, JSON.stringify(semesters));
    window.dispatchEvent(new Event("hub-school-semesters-change"));
    const updated = semesters.find((semester) => semester.id === id);
    if (!updated) throw new Error("Semestre nao encontrado.");
    return updated;
  }

  await apiFetch<unknown>(`semestres/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const semesters = await getSemesters();
  window.dispatchEvent(new Event("hub-school-semesters-change"));
  const updated = semesters.find((semester) => semester.id === id);
  if (!updated) throw new Error("Semestre não encontrado após salvar.");
  return updated;
}

export async function getSemesters(): Promise<Semester[]> {
  if (isSemesterDemoMode()) return getDemoSemesters();

  const result = await apiFetch<Semester[] | { data?: Semester[]; semestres?: Semester[] }>("semestres");
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.semestres)) return result.semestres;
  if (Array.isArray(result.data)) return result.data;
  throw new Error("A resposta da API não contém uma lista de semestres.");
}

export async function activateSemester(id: string): Promise<Semester[]> {
  if (isSemesterDemoMode()) {
    if (!getDemoSemesters().some((semester) => semester.id === id)) {
      throw new Error("O semestre selecionado não foi encontrado.");
    }
    window.localStorage.setItem(demoStorageKey, id);
    return getDemoSemesters();
  }

  await apiFetch<unknown>(`semestres/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ativo: true }),
  });
  return getSemesters();
}

