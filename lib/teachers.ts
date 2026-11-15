import { apiFetch } from "./api";

export type Teacher = {
  id: string;
  name: string;
  email: string;
  phone: string;
  observations: string;
  courseIds: string[];
  courseNames: string[];
};

type ApiTeacher = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function associationNames(value: unknown) {
  if (!Array.isArray(value)) return { ids: [] as string[], names: [] as string[] };
  return value.reduce<{ ids: string[]; names: string[] }>((result, item: unknown) => {
    if (typeof item === "string" || typeof item === "number") {
      result.names.push(String(item));
    } else if (item && typeof item === "object") {
      const association = item as Record<string, unknown>;
      const id = asString(association.id ?? association.disciplina_id);
      const name = asString(association.nome ?? association.name ?? association.disciplina);
      if (id) result.ids.push(id);
      if (name) result.names.push(name);
    }
    return result;
  }, { ids: [], names: [] });
}

function normalizeTeacher(value: ApiTeacher): Teacher {
  const associations = associationNames(value.disciplinas ?? value.courses ?? value.materias);
  const id = asString(value.id ?? value.uuid);
  if (!id) throw new Error("Um professor retornado pela API está sem identificador.");
  return {
    id,
    name: asString(value.nome ?? value.name ?? value.nome_completo) || "Professor sem nome",
    email: asString(value.email ?? value.email_institucional),
    phone: asString(value.telefone ?? value.phone ?? value.whatsapp),
    observations: asString(value.observacoes ?? value.observations),
    courseIds: associations.ids,
    courseNames: associations.names,
  };
}

export async function saveTeacher(input: Pick<Teacher, "name" | "email" | "phone" | "observations" | "courseIds">, id?: string) {
  const path = id ? `professores/${encodeURIComponent(id)}` : "professores";
  const result = await apiFetch<Record<string, unknown>>(path, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({ nome: input.name, email: input.email || null, telefone: input.phone || null, observacoes: input.observations || null, disciplina_ids: input.courseIds }),
  });
  return normalizeTeacher(result);
}

export async function deleteTeacher(id: string) {
  await apiFetch<void>(`professores/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getTeachers(): Promise<Teacher[]> {
  const result = await apiFetch<unknown>("professores");
  let payload: unknown = result;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const wrapper = payload as Record<string, unknown>;
    payload = wrapper.professores ?? wrapper.docentes ?? wrapper.data ?? wrapper.items;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const nested = payload as Record<string, unknown>;
      payload = nested.professores ?? nested.docentes ?? nested.items;
    }
  }
  if (!Array.isArray(payload)) throw new Error("A resposta da API não contém uma lista de professores.");
  return payload.map((teacher) => {
    if (!teacher || typeof teacher !== "object" || Array.isArray(teacher)) {
      throw new Error("A API retornou um professor em formato inválido.");
    }
    return normalizeTeacher(teacher as ApiTeacher);
  });
}
