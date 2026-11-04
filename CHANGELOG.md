# Changelog

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
