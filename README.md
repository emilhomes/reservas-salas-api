# 🏫 API de Reserva de Salas

Projeto incremental da disciplina **Sistemas Distribuídos** (UERN, 3ª unidade).

> **Entrega atual: Módulo 1, Computação em Nuvem.** API REST publicada em nuvem com banco de dados gerenciado.

| | |
|---|---|
| 🌐 **URL pública** | https://reservas-salas-api.onrender.com |
| 🎥 **Vídeo de demonstração** | https://youtu.be/SEU-VIDEO ← *(substituir)* |
| 🏷️ **Tag da entrega** | `entrega-1-cloud` |

---

## 1. Domínio

Sistema de **reserva de salas** (laboratórios, auditórios, salas de reunião).

**Entidade central:** `Reserva`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | inteiro | gerado automaticamente |
| `sala` | texto | nome da sala (ex.: "Laboratório 01") |
| `responsavel` | texto | quem fez a reserva |
| `inicio` / `fim` | data/hora (ISO 8601) | período reservado (`fim` > `inicio`) |
| `status` | `PENDENTE` · `CONFIRMADA` · `CANCELADA` | estado da reserva |
| `criado_em` / `atualizado_em` | data/hora | auditoria |

**Fluxo de estados:**

```
PENDENTE ──► CONFIRMADA
    │             │
    └──► CANCELADA ◄┘
```

A mudança de estado (ex.: **"reserva confirmada"**) é o evento que será publicado via mensageria no Módulo 4.

**Regra de negócio:** a API não deixa reservar a mesma sala em horários sobrepostos (retorna `409 Conflict`). Reservas canceladas não contam como conflito.

---

## 2. Arquitetura (Módulo 1)

```
  Cliente (curl / Postman / navegador)
              │  HTTPS
              ▼
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │  Render (Web Service)    │  SQL   │  Neon (PostgreSQL        │
  │  Node.js + Express       │ ─────► │  gerenciado, serverless) │
  │  API REST /reservas      │  TLS   │  tabela "reservas"       │
  └──────────────────────────┘        └──────────────────────────┘
        DATABASE_URL vem de variável de ambiente (painel do Render)
```

Arquitetura **cliente-servidor**: a API não guarda estado em memória. Todo o estado fica no banco gerenciado, então a plataforma pode reiniciar ou recriar a instância sem perder dados.

### Justificativa das escolhas técnicas

| Escolha | Por quê |
|---|---|
| **Node.js + Express** | Stack leve e popular, ótima para APIs REST. No Módulo 4 a biblioteca `amqplib` (RabbitMQ) se integra direto. |
| **Render** (PaaS) | Free tier sem cartão. Faz o deploy direto do GitHub: detecta Node, roda `npm install` e `npm start` e gera uma URL HTTPS pública. A cada `git push` há um redeploy automático. |
| **Neon** (PostgreSQL gerenciado) | DBaaS com free tier: backups, TLS e disponibilidade ficam por conta do provedor. Escolhi um banco relacional porque reserva tem estrutura fixa e precisa de consultas por intervalo de tempo (checagem de conflito). |
| **Variáveis de ambiente** | Segue o princípio *12-factor app*: a configuração fica fora do código. A senha do banco nunca vai para o Git (`.env` está no `.gitignore`). |
| **Tabela criada no start** | `CREATE TABLE IF NOT EXISTS` na inicialização, uma migração simples sem ferramentas extras. |

---

## 3. Endpoints

| Método | Rota | Descrição | Respostas |
|---|---|---|---|
| `GET` | `/` | Informações da API | 200 |
| `GET` | `/health` | Verifica a API e a conexão com o banco | 200 / 503 |
| `GET` | `/reservas` | Lista reservas (filtros opcionais `?sala=` e `?status=`) | 200 |
| `GET` | `/reservas/:id` | Busca uma reserva | 200 / 404 |
| `POST` | `/reservas` | Cria reserva (status inicial `PENDENTE`) | 201 / 400 / 409 |
| `PUT` | `/reservas/:id` | Atualiza todos os dados da reserva | 200 / 400 / 404 / 409 |
| `PATCH` | `/reservas/:id/status` | Muda só o status | 200 / 400 / 404 |
| `DELETE` | `/reservas/:id` | Remove reserva | 204 / 404 |

Exemplo de corpo para `POST /reservas`:

```json
{
  "sala": "Laboratório 01",
  "responsavel": "Maria",
  "inicio": "2026-11-10T14:00:00-03:00",
  "fim": "2026-11-10T16:00:00-03:00"
}
```

---

## 4. Como executar localmente

Pré-requisitos: **Node.js 22+** e uma URL de PostgreSQL (pode ser a mesma do Neon).

```bash
git clone https://github.com/SEU-USUARIO/reservas-salas-api.git
cd reservas-salas-api
npm install
cp .env.example .env        # depois edite o .env com sua DATABASE_URL
npm run dev                  # API em http://localhost:3000
```

---

## 5. Deploy em nuvem (passo a passo)

### 5.1 Banco: Neon
1. Crie uma conta em https://neon.tech e depois um projeto (região **AWS São Paulo / sa-east-1**, se disponível).
2. Em **Connect**, copie a *connection string* (`postgresql://...neon.tech/neondb?sslmode=require`).

### 5.2 API: Render
1. Crie uma conta em https://render.com entrando com o GitHub.
2. **New + → Web Service** → selecione este repositório.
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Em **Environment → Environment Variables**, adicione:
   - `DATABASE_URL` = *(connection string do Neon)*
5. **Deploy**. A URL pública aparece no topo (ex.: `https://reservas-salas-api.onrender.com`).

> ⚠️ No plano gratuito o Render "adormece" o serviço depois de ~15 min sem acesso. A primeira requisição seguinte pode levar ~1 min (*cold start*).

---

## 6. Testes (API respondendo publicamente)

### Script automatizado (Node, funciona no Windows/Linux/Mac)

```bash
npm run test:api -- https://reservas-salas-api.onrender.com
```

Ele executa o fluxo completo: health, criar, conflito (409), listar, atualizar, confirmar, deletar e verificar 404.

### Comandos curl

```bash
URL=https://reservas-salas-api.onrender.com

curl $URL/health

curl -X POST $URL/reservas -H "Content-Type: application/json" \
  -d '{"sala":"Laboratório 01","responsavel":"Maria","inicio":"2026-11-10T14:00:00-03:00","fim":"2026-11-10T16:00:00-03:00"}'

curl $URL/reservas

curl -X PUT $URL/reservas/1 -H "Content-Type: application/json" \
  -d '{"sala":"Laboratório 02","responsavel":"Maria","inicio":"2026-11-10T14:00:00-03:00","fim":"2026-11-10T18:00:00-03:00"}'

curl -X PATCH $URL/reservas/1/status -H "Content-Type: application/json" -d '{"status":"CONFIRMADA"}'

curl -X DELETE $URL/reservas/1
```

### Evidências

Prints em [`docs/prints/`](docs/prints/):

- Painel do Render com o deploy *Live* e as variáveis de ambiente (valores ocultos)
- Painel do Neon com a tabela `reservas`
- Saída do `npm run test:api` contra a URL pública

---

## 7. Estrutura do projeto

```
├── src/
│   ├── index.js        # servidor Express, rotas gerais e tratamento de erros
│   ├── db.js           # conexão com PostgreSQL + criação da tabela
│   └── reservas.js     # CRUD da entidade Reserva
├── scripts/
│   └── testar-api.js   # teste de ponta a ponta contra qualquer URL
├── docs/prints/        # evidências dos testes
├── .env.example        # modelo das variáveis de ambiente
├── CHANGELOG.md
└── README.md
```

## 8. Roadmap

- [x] **Módulo 1:** Computação em Nuvem (esta entrega)
- [ ] **Módulo 2:** Microsserviços (reservas, salas, usuários)
- [ ] **Módulo 3:** Containers (Dockerfile + docker-compose)
- [ ] **Módulo 4:** Mensageria (evento "reserva confirmada" via RabbitMQ)
