# Changelog

## [entrega-3-containers] Módulo 3: Containers

### Adicionado
- `Dockerfile` em cada serviço (`services/salas`, `services/usuarios`, `services/reservas`): base `node:22-alpine`, build em duas etapas, `npm ci --omit=dev`, usuário `node` (sem root) e `HEALTHCHECK` no `/health`.
- `.dockerignore` em cada serviço: `.env` e `node_modules` nunca entram na imagem.
- `docker-compose.yml` orquestrando os 3 serviços e **3 bancos PostgreSQL 17** (um por serviço), com volumes nomeados (`dados-salas`, `dados-usuarios`, `dados-reservas`), healthcheck nos bancos e ordem de subida (`depends_on: service_healthy`).
- `scripts/testar-persistencia.js` (`npm run test:persistencia`): cria dados nos 3 bancos, roda `docker compose down` e `up` e confere que tudo persistiu (9 verificações).
- Atalhos `npm run docker:up`, `docker:down` e `docker:logs`.
- README: como rodar com Docker, diagrama da rede de containers, boas práticas dos Dockerfiles e comparação entre deploy direto e containers.

### Alterado
- Versão dos serviços: 3.0.0.
- Nenhuma mudança na lógica dos serviços: toda a configuração (banco, URLs dos outros serviços) já vinha de variáveis de ambiente, e agora é definida no compose.

## [entrega-2-microsservicos] Módulo 2: Serviços / Microsserviços

### Adicionado
- Serviço **salas** (`services/salas`): CRUD de salas (nome, capacidade, localização, ativa) com banco próprio `salas_db`.
- Serviço **usuarios** (`services/usuarios`): CRUD de usuários (nome, email, tipo) com banco próprio `usuarios_db`.
- Comunicação **HTTP síncrona**: reservas consulta `GET /salas/:id` e `GET /usuarios/:id` (em paralelo) antes de criar ou atualizar uma reserva.
- Tratamento de falha do serviço dependente: timeout configurável (`HTTP_TIMEOUT_MS`), nova tentativa (`HTTP_TENTATIVAS`) e resposta **503** com mensagem amigável.
- `GET /reservas/:id` devolve os dados da sala e do usuário; se um serviço estiver fora, responde com `avisos` (degradação graciosa).
- `/health` de reservas mostra o estado de salas e usuarios.
- Respostas **422** para sala inexistente, sala inativa e usuário inexistente.
- `scripts/dev.js` sobe os 3 serviços localmente; `scripts/testar-api.js` testa os 3 (20 verificações, local ou nuvem).
- Diagrama de arquitetura em `docs/arquitetura.svg` / `.png`.

### Alterado
- Código reorganizado em monorepo: `src/` virou `services/reservas/src/`.
- Reserva usa `sala_id` e `usuario_id` (antes, `sala` e `responsavel` eram texto livre).
- Filtros de `GET /reservas`: `?sala_id=`, `?usuario_id=`, `?status=`.
- Deploy: 3 Web Services no Render (um *Root Directory* por serviço) e 3 bancos no Neon.
- O serviço de reservas se recusa a iniciar se `DATABASE_URL` apontar para o banco antigo do Módulo 1.

## [entrega-1-cloud] Módulo 1: Computação em Nuvem

### Adicionado
- API REST (Node.js + Express) com CRUD da entidade `Reserva`.
- Mudança de status (`PENDENTE` → `CONFIRMADA` / `CANCELADA`) via `PATCH /reservas/:id/status`.
- Bloqueio de reservas em conflito de horário para a mesma sala (HTTP 409).
- Banco PostgreSQL gerenciado no Neon, com a tabela criada automaticamente no start.
- Deploy no Render a partir do GitHub, com `DATABASE_URL` configurada no painel.
- Endpoint `/health` para verificar a API e o banco.
- Script de teste de ponta a ponta (`npm run test:api`).
