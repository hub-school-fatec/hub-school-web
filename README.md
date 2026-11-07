# Hub School — front-end

Aplicação web do Hub School para estudantes da Fatec Franca.

## Sprint 0 — Fundação

- Next.js App Router com TypeScript.
- HeroUI v3 com Tailwind CSS v4.
- Login e cadastro preparados para Supabase Auth com sessões em cookies.
- Home inicial e fluxo de primeiro acesso em `/primeiro-acesso`.
- Cliente HTTP inicial em `lib/api.ts`, preparado para enviar o JWT à API.
- Segredos locais em `.env.local` (modelo em `.env.example`).

Sem credenciais Supabase configuradas, a tela de login oferece um acesso de demonstração ao painel. O cadastro, o assistente e os dados da Home ainda são estruturas iniciais; a persistência e as chamadas de negócio serão ligadas à API nas próximas tarefas.

## Desenvolvimento local

Requisitos: Node.js 20.9 ou superior.

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Abra http://localhost:3000. Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_API_URL` no `.env.local` para habilitar autenticação e integração com os serviços do projeto. Não comite credenciais reais.
