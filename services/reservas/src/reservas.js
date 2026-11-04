// Rotas REST da entidade central: Reserva de sala.
// Antes de gravar, consulta os serviços de SALAS e USUÁRIOS via HTTP.
const express = require("express");
const { pool } = require("./db");
const { buscarSala, buscarUsuario, ServicoIndisponivelError } = require("./clientes");

const router = express.Router();

const STATUS_VALIDOS = ["PENDENTE", "CONFIRMADA", "CANCELADA"];
const MAIOR_INT = 2147483647; // limite do INTEGER do PostgreSQL

const idValido = (v) => Number.isInteger(v) && v > 0 && v <= MAIOR_INT;

// Valida o corpo de criação/atualização. Retorna uma mensagem de erro ou null.
function validar({ sala_id, usuario_id, inicio, fim, status }) {
  if (sala_id === undefined || usuario_id === undefined || !inicio || !fim) {
    return "Campos obrigatórios: sala_id, usuario_id, inicio, fim";
  }
  if (!idValido(sala_id) || !idValido(usuario_id)) {
    return "sala_id e usuario_id devem ser números inteiros positivos";
  }
  if (isNaN(Date.parse(inicio)) || isNaN(Date.parse(fim))) {
    return "inicio e fim devem ser datas no formato ISO 8601 (ex.: 2026-11-10T14:00:00-03:00)";
  }
  if (new Date(fim) <= new Date(inicio)) {
    return "fim deve ser depois de inicio";
  }
  if (status && !STATUS_VALIDOS.includes(status)) {
    return `status deve ser um de: ${STATUS_VALIDOS.join(", ")}`;
  }
  return null;
}

// Consulta, em paralelo, os serviços de salas e usuários.
// Retorna uma mensagem de erro de negócio (422) ou null se estiver tudo certo.
// Se algum serviço estiver fora do ar, a ServicoIndisponivelError sobe até o
// tratador de erros do index.js, que responde 503.
async function validarSalaEUsuario({ sala_id, usuario_id }) {
  const [sala, usuario] = await Promise.all([buscarSala(sala_id), buscarUsuario(usuario_id)]);
  if (!sala) return `Sala ${sala_id} não existe (consultado no serviço de salas)`;
  if (!sala.ativa) return `Sala "${sala.nome}" está inativa e não aceita reservas`;
  if (!usuario) return `Usuário ${usuario_id} não existe (consultado no serviço de usuários)`;
  return null;
}

// Verifica se já existe reserva ativa (não cancelada) da mesma sala no mesmo horário.
async function existeConflito({ sala_id, inicio, fim }, ignorarId = null) {
  const { rows } = await pool.query(
    `SELECT id FROM reservas
      WHERE sala_id = $1
        AND status <> 'CANCELADA'
        AND inicio < $3 AND fim > $2
        AND ($4::int IS NULL OR id <> $4)
      LIMIT 1`,
    [sala_id, inicio, fim, ignorarId]
  );
  return rows.length > 0;
}

// LISTAR — GET /reservas (filtros opcionais: ?sala_id=...&usuario_id=...&status=...)
// Não consulta os outros serviços: listar N reservas geraria 2N chamadas HTTP.
router.get("/", async (req, res) => {
  const { sala_id, usuario_id, status } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM reservas
      WHERE ($1::int  IS NULL OR sala_id = $1)
        AND ($2::int  IS NULL OR usuario_id = $2)
        AND ($3::text IS NULL OR status = $3)
      ORDER BY inicio`,
    [sala_id ?? null, usuario_id ?? null, status ?? null]
  );
  res.json(rows);
});

// BUSCAR POR ID — GET /reservas/:id
// Devolve a reserva junto com os dados da sala e do usuário, buscados nos outros
// serviços. Se algum estiver fora do ar, a reserva volta assim mesmo, com um aviso
// (degradação graciosa: a falha de um serviço não derruba a consulta inteira).
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM reservas WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  const reserva = rows[0];

  const [sala, usuario] = await Promise.allSettled([
    buscarSala(reserva.sala_id),
    buscarUsuario(reserva.usuario_id),
  ]);

  const avisos = [];
  const detalhar = (resultado, nomeServico) => {
    if (resultado.status === "fulfilled") return resultado.value; // objeto ou null (404)
    if (resultado.reason instanceof ServicoIndisponivelError) {
      avisos.push(`Serviço de ${nomeServico} indisponível: dados não carregados`);
      return null;
    }
    throw resultado.reason;
  };

  const resposta = {
    ...reserva,
    sala: detalhar(sala, "salas"),
    usuario: detalhar(usuario, "usuarios"),
  };
  if (avisos.length > 0) resposta.avisos = avisos;
  res.json(resposta);
});

// CRIAR — POST /reservas
router.post("/", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const erroNegocio = await validarSalaEUsuario(req.body);
  if (erroNegocio) return res.status(422).json({ erro: erroNegocio });

  const { sala_id, usuario_id, inicio, fim } = req.body;
  if (await existeConflito({ sala_id, inicio, fim })) {
    return res.status(409).json({ erro: "Sala já reservada nesse horário" });
  }

  const { rows } = await pool.query(
    `INSERT INTO reservas (sala_id, usuario_id, inicio, fim)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sala_id, usuario_id, inicio, fim]
  );
  res.status(201).json(rows[0]);
});

// ATUALIZAR — PUT /reservas/:id (substitui os dados da reserva)
router.put("/:id", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { rows: existentes } = await pool.query("SELECT id FROM reservas WHERE id = $1", [req.params.id]);
  if (existentes.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });

  const erroNegocio = await validarSalaEUsuario(req.body);
  if (erroNegocio) return res.status(422).json({ erro: erroNegocio });

  const { sala_id, usuario_id, inicio, fim, status = "PENDENTE" } = req.body;
  if (status !== "CANCELADA" && (await existeConflito({ sala_id, inicio, fim }, req.params.id))) {
    return res.status(409).json({ erro: "Sala já reservada nesse horário" });
  }

  const { rows } = await pool.query(
    `UPDATE reservas
        SET sala_id = $1, usuario_id = $2, inicio = $3, fim = $4, status = $5, atualizado_em = NOW()
      WHERE id = $6 RETURNING *`,
    [sala_id, usuario_id, inicio, fim, status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  res.json(rows[0]);
});

// MUDAR STATUS — PATCH /reservas/:id/status
// Esta mudança de estado (ex.: "reserva confirmada") será o evento do Módulo 4 (mensageria).
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `status deve ser um de: ${STATUS_VALIDOS.join(", ")}` });
  }

  const { rows } = await pool.query(
    `UPDATE reservas SET status = $1, atualizado_em = NOW()
      WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  res.json(rows[0]);
});

// DELETAR — DELETE /reservas/:id
router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM reservas WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  res.status(204).end();
});

module.exports = router;
