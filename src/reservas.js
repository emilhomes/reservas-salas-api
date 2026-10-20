// Rotas REST da entidade central: Reserva de sala.
const express = require("express");
const { pool } = require("./db");

const router = express.Router();

const STATUS_VALIDOS = ["PENDENTE", "CONFIRMADA", "CANCELADA"];

// Valida o corpo de criação/atualização. Retorna uma mensagem de erro ou null.
function validar({ sala, responsavel, inicio, fim, status }) {
  if (!sala || !responsavel || !inicio || !fim) {
    return "Campos obrigatórios: sala, responsavel, inicio, fim";
  }
  if (isNaN(Date.parse(inicio)) || isNaN(Date.parse(fim))) {
    return "inicio e fim devem ser datas no formato ISO 8601 (ex.: 2026-10-25T14:00:00-03:00)";
  }
  if (new Date(fim) <= new Date(inicio)) {
    return "fim deve ser depois de inicio";
  }
  if (status && !STATUS_VALIDOS.includes(status)) {
    return `status deve ser um de: ${STATUS_VALIDOS.join(", ")}`;
  }
  return null;
}

// Verifica se já existe reserva ativa (não cancelada) da mesma sala no mesmo horário.
async function existeConflito({ sala, inicio, fim }, ignorarId = null) {
  const { rows } = await pool.query(
    `SELECT id FROM reservas
      WHERE sala = $1
        AND status <> 'CANCELADA'
        AND inicio < $3 AND fim > $2
        AND ($4::int IS NULL OR id <> $4)
      LIMIT 1`,
    [sala, inicio, fim, ignorarId]
  );
  return rows.length > 0;
}

// LISTAR — GET /reservas (filtros opcionais: ?sala=...&status=...)
router.get("/", async (req, res) => {
  const { sala, status } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM reservas
      WHERE ($1::text IS NULL OR sala = $1)
        AND ($2::text IS NULL OR status = $2)
      ORDER BY inicio`,
    [sala ?? null, status ?? null]
  );
  res.json(rows);
});

// BUSCAR POR ID — GET /reservas/:id
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM reservas WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  res.json(rows[0]);
});

// CRIAR — POST /reservas
router.post("/", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { sala, responsavel, inicio, fim } = req.body;
  if (await existeConflito({ sala, inicio, fim })) {
    return res.status(409).json({ erro: "Sala já reservada nesse horário" });
  }

  const { rows } = await pool.query(
    `INSERT INTO reservas (sala, responsavel, inicio, fim)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sala, responsavel, inicio, fim]
  );
  res.status(201).json(rows[0]);
});

// ATUALIZAR — PUT /reservas/:id (substitui os dados da reserva)
router.put("/:id", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { sala, responsavel, inicio, fim, status = "PENDENTE" } = req.body;
  if (status !== "CANCELADA" && (await existeConflito({ sala, inicio, fim }, req.params.id))) {
    return res.status(409).json({ erro: "Sala já reservada nesse horário" });
  }

  const { rows } = await pool.query(
    `UPDATE reservas
        SET sala = $1, responsavel = $2, inicio = $3, fim = $4, status = $5, atualizado_em = NOW()
      WHERE id = $6 RETURNING *`,
    [sala, responsavel, inicio, fim, status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ erro: "Reserva não encontrada" });
  res.json(rows[0]);
});

// MUDAR STATUS — PATCH /reservas/:id/status
// Esta mudança de estado (ex.: "reserva confirmada") será o evento do Módulo 4 (mensageria).
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
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
