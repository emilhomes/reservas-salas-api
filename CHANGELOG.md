# Changelog

## [entrega-1-cloud] Módulo 1: Computação em Nuvem

### Adicionado
- API REST (Node.js + Express) com CRUD da entidade `Reserva`.
- Mudança de status (`PENDENTE` → `CONFIRMADA` / `CANCELADA`) via `PATCH /reservas/:id/status`.
- Bloqueio de reservas em conflito de horário para a mesma sala (HTTP 409).
- Banco PostgreSQL gerenciado no Neon, com a tabela criada automaticamente no start.
- Deploy no Render a partir do GitHub, com `DATABASE_URL` configurada no painel.
- Endpoint `/health` para verificar a API e o banco.
- Script de teste de ponta a ponta (`npm run test:api`).
