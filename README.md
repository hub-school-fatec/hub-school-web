# HUB SCHOOL — frontend

Aplicação web acadêmica para estudantes, construída com Next.js App Router, React e TypeScript. A interface usa HeroUI e Tailwind CSS. O login e o cadastro usam Supabase Auth; em modo API, `lib/api.ts` envia o access token da sessão como Bearer ao backend FastAPI. Os dados acadêmicos são persistidos pela API, que aplica as regras de acesso do Supabase.

## Requisitos e instalação

- Node.js 20.9 ou superior e npm.
- Backend HUB SCHOOL acessível para usar dados reais.
- Projeto Supabase com Auth configurado; o backend deve apontar para o **mesmo projeto**.

Na raiz `hub-school-frontend`, use o lockfile existente:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Abra `http://localhost:3000`. O frontend pode também usar `http://127.0.0.1:3000`, desde que essa origem esteja autorizada no CORS do backend. Para produção, configure as URLs e origens do ambiente de destino e use `npm.cmd run build` seguido de `npm.cmd run start`.

## Variáveis de ambiente

Preencha o arquivo local `.env.local` a partir dos **nomes** em `.env.example`; não copie credenciais para o Git. O arquivo local está ignorado pelo Git.

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto que autentica os usuários. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública publishable do mesmo projeto. |
| `NEXT_PUBLIC_API_URL` | URL base da API FastAPI; para desenvolvimento local, `http://127.0.0.1:8000`. |

Variáveis `NEXT_PUBLIC_` são expostas ao navegador: **nunca** coloque nelas `service_role`, chave secreta, senha ou JWT. O backend precisa de `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, uma chave pública Supabase e `CORS_ALLOWED_ORIGINS` com as origens exatas do frontend. O cliente usa a sessão do Supabase Auth; não há segundo sistema de login.

## Funcionalidades e fluxo

- Login, cadastro, callback de autenticação e sessão Supabase com cookies.
- Primeiro acesso em `/primeiro-acesso`: no modo API, consulta dados existentes e salva semestre, disciplinas, horários e docentes pelos endpoints do backend. Reconfere o estado persistido antes de marcar a conclusão no metadata do Auth e redirecionar para `/home`. Uma falha parcial pode ser retomada sem recriar registros já confirmados; conflitos com dados existentes exigem revisão do usuário.
- Painel com semestre ativo, disciplinas, docentes, horários, frequências e próximos eventos.
- Agenda com eventos pessoais (criação, edição, cancelamento/reativação e exclusão) e datas recebidas de `GET /calendario-academico`.
- Anotações com título e conteúdo, vínculo opcional a disciplina/evento, upload, listagem, visualização, download e exclusão individual de anexos privados.

Com `NEXT_PUBLIC_API_URL` configurada, as operações acadêmicas usam a API; o `localStorage` não substitui silenciosamente falhas da API. Sem essa URL, partes da interface oferecem um modo de demonstração local, que **não** persiste no Supabase.

## Verificações locais

```powershell
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
node --test tests/events.test.cjs tests/onboarding.test.cjs
npm.cmd run build
```

O projeto não define um script `npm test`; os testes locais usam o executor integrado do Node.js. O build grava artefatos em `.next`, que está no `.gitignore`. Os testes citados não fazem escritas reais no Supabase. As verificações de TypeScript, lint, testes locais e build passaram nas etapas anteriores; repita-as após mudanças.

## Limitações e validação manual

- No modo API, a interface mantém a exclusão de **anotações** indisponível. O backend retorna HTTP 409 quando encontra anexos e exige excluí-los individualmente primeiro, mas ainda há uma condição de corrida entre a consulta e a exclusão; a proteção não garante ausência absoluta de objetos órfãos.
- O calendário acadêmico retorna apenas uma data por registro no contrato atual. A interface não presume períodos acadêmicos de vários dias.
- O primeiro acesso depende de o projeto Supabase disponibilizar o perfil `public.usuario` exigido pelo banco; o frontend não cria esse perfil diretamente. Confirme o provisionamento de contas novas no ambiente de entrega.
- A integração real de todos os módulos, incluindo eventos, calendário, primeiro acesso com conta nova e retomada após falha, ainda exige teste manual com usuário comum no ambiente de destino. Testes locais e build não comprovam esse funcionamento no Supabase real.
