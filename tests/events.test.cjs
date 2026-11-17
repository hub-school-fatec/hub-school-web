/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function setup(response) {
  const calls = [];
  const source = fs.readFileSync(path.join(__dirname, "../lib/events.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  const apiFetch = async (route, options = {}) => { calls.push({ route, options }); return response; };
  new Function("require", "module", "exports", compiled)((name) => name === "./api" ? { apiFetch } : undefined, loadedModule, loadedModule.exports);
  return { api: loadedModule.exports, calls };
}

const row = { id: "event-id", titulo: "Prova", tipo: "prova", inicio: "2026-11-17T21:00:00Z",
  fim: null, disciplina_id: null, cancelado: false, lembrete_ativo: true, antecedencias_minutos: [1440] };

test("criação envia somente campos do schema e lê a resposta persistida", async () => {
  const { api, calls } = setup(row);
  const saved = await api.createEvent({ title: "Prova", type: "prova", start: row.inicio,
    end: null, courseId: null, reminderMinutes: [1440], reminderActive: true, cancelled: false });
  assert.equal(saved.id, "event-id");
  assert.deepEqual(JSON.parse(calls[0].options.body), { titulo: "Prova", tipo: "prova", inicio: row.inicio,
    fim: null, disciplina_id: null, antecedencias_minutos: [1440], lembrete_ativo: true, cancelado: false });
  assert.equal(calls[0].options.method, "POST");
});

test("listagem de calendário usa data e descricao sem inventar período", async () => {
  const { api, calls } = setup([{ id: "date-id", data: "2026-11-17", tipo: "feriado", descricao: "Feriado" }]);
  const result = await api.getAcademicCalendar();
  assert.equal(calls[0].route, "calendario-academico");
  assert.equal(result[0].start, "2026-11-17");
  assert.equal(result[0].end, null);
  assert.equal(result[0].academic, true);
  assert.equal(api.occursOnDay(result[0], "2026-11-17"), true);
});

test("edição e exclusão usam os endpoints existentes", async () => {
  const { api, calls } = setup(row);
  await api.updateEvent("event-id", { title: "Prova", type: "prova", start: row.inicio,
    end: null, courseId: null, reminderMinutes: [], reminderActive: false, cancelled: true });
  await api.deleteEvent("event-id");
  assert.deepEqual(calls.map((call) => [call.route, call.options.method]), [["eventos/event-id", "PATCH"], ["eventos/event-id", "DELETE"]]);
  assert.equal(JSON.parse(calls[0].options.body).cancelado, true);
});

test("período pessoal aparece em cada dia e cruza o limite do semestre", () => {
  const { api } = setup(null);
  const event = { id: "1", start: "2026-11-30T21:00:00Z", end: "2026-12-02T12:00:00Z", courseId: null };
  assert.equal(api.occursOnDay(event, "2026-12-01"), true);
  assert.equal(api.occursOnDay(event, "2026-12-03"), false);
  assert.equal(api.filterEventsForSemester([event], { id: "semester", data_inicio: "2026-12-01", data_fim: "2026-12-15" }, []).length, 1);
});
