/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function setup() {
  const database = { semesters: [], courses: [], teachers: [], schedules: [] };
  const calls = [];
  let failNextSchedule = false;
  let nextId = 1;
  const id = () => `id-${nextId++}`;
  const apiFetch = async (route, options = {}) => {
    calls.push(`${options.method ?? "GET"} ${route}`);
    if (route === "horarios-aula" && options.method === "POST") {
      if (failNextSchedule) { failNextSchedule = false; throw new Error("simulated failure"); }
      const payload = JSON.parse(options.body);
      database.schedules.push({ scheduleId: id(), day: ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][payload.dia_semana],
        start: payload.hora_inicio, end: payload.hora_fim, room: payload.sala,
        classesCount: payload.aulas_no_dia, disciplineId: payload.disciplina_id });
      return {};
    }
    if (route.startsWith("disciplinas/") && options.method === "PATCH") {
      const course = database.courses.find((item) => item.id === route.split("/")[1]);
      course.teacherId = JSON.parse(options.body).docente_id;
      return course;
    }
    throw new Error(`Unexpected mock request: ${route}`);
  };
  const mocks = {
    "./api": { apiFetch },
    "./semesters": {
      getSemesters: async () => database.semesters.map((item) => ({ ...item })),
      createSemester: async (input) => {
        calls.push("POST semestres");
        const semester = { ...input, id: id(), ativo: true };
        database.semesters.push(semester);
        return semester;
      },
      activateSemester: async (semesterId) => {
        calls.push("PATCH semestres");
        database.semesters.find((item) => item.id === semesterId).ativo = true;
        return database.semesters;
      },
    },
    "./courses": {
      getCourses: async () => database.courses.map((course) => ({ ...course,
        schedule: database.schedules.filter((row) => row.disciplineId === course.id) })),
      getCourseSchedules: async (courseId) => database.schedules.filter((row) => row.disciplineId === courseId),
      saveCourse: async (input) => {
        calls.push("POST disciplinas");
        const course = { id: id(), semesterId: input.semestre_id, name: input.nome, code: input.sigla,
          workloadHours: input.carga_horaria_h, totalClasses: input.total_aulas, teacherId: "", schedule: [] };
        database.courses.push(course);
        return course;
      },
    },
    "./teachers": {
      getTeachers: async () => database.teachers.map((item) => ({ ...item })),
      saveTeacher: async (input) => {
        calls.push("POST docentes");
        const teacher = { id: id(), name: input.name, email: input.email, phone: input.phone };
        database.teachers.push(teacher);
        return teacher;
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../lib/onboarding.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => mocks[name], loadedModule, loadedModule.exports);
  return { api: loadedModule.exports, database, calls, failScheduleOnce: () => { failNextSchedule = true; } };
}

const data = () => ({ semester: "2026/2", startDate: "2026-08-01", endDate: "2026-12-20",
  courses: [{ name: "Algoritmos", code: "ALG", hours: "80", totalClasses: "40",
    schedule: [{ day: "1", start: "08:00", end: "09:00", room: "Sala 1" }] }],
  teachers: [{ name: "Docente Teste", email: "teste@example.org", phone: "", courseCode: "ALG" }] });

test("rejeita período inválido e horário sem sala antes de escrever", () => {
  const { api, calls } = setup();
  assert.match(api.validateOnboarding({ ...data(), endDate: "2026-07-01" }), /período/);
  const input = data();
  input.courses[0].schedule[0].room = "";
  assert.match(api.validateOnboarding(input), /sala/);
  assert.deepEqual(calls, []);
});

test("persiste uma vez e verifica semestre, disciplina, horário e vínculo do docente", async () => {
  const { api, database, calls } = setup();
  await api.finishOnboarding(data(), () => {});
  await api.finishOnboarding(data(), () => {});
  assert.equal(database.semesters.length, 1);
  assert.equal(database.courses.length, 1);
  assert.equal(database.schedules.length, 1);
  assert.equal(database.teachers.length, 1);
  assert.equal(database.courses[0].teacherId, database.teachers[0].id);
  assert.equal(calls.filter((call) => call === "POST semestres").length, 1);
  assert.equal(calls.filter((call) => call === "POST disciplinas").length, 1);
});

test("retoma depois de falha parcial sem duplicar registros", async () => {
  const { api, database, failScheduleOnce } = setup();
  failScheduleOnce();
  await assert.rejects(api.finishOnboarding(data(), () => {}), /simulated failure/);
  assert.equal(database.semesters.length, 1);
  assert.equal(database.courses.length, 1);
  assert.equal(database.schedules.length, 0);
  await api.finishOnboarding(data(), () => {});
  assert.equal(database.semesters.length, 1);
  assert.equal(database.courses.length, 1);
  assert.equal(database.schedules.length, 1);
});

test("não sobrescreve um semestre existente com datas diferentes", async () => {
  const { api, database, calls } = setup();
  database.semesters.push({ id: "existing", nome: "2026/2", data_inicio: "2026-01-01", data_fim: "2026-06-30", ativo: true });
  await assert.rejects(api.finishOnboarding(data(), () => {}), /datas diferentes/);
  assert.equal(calls.filter((call) => call.startsWith("POST")).length, 0);
});
