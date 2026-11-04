// Rotas REST do serviço de salas.
const express = require("express");
const { pool } = require("./db");

const router = express.Router();

// Valida o corpo de criação/atualização. Retorna uma mensagem de erro ou null.
function validar({ nome, capacidade, localizacao, ativa }) {
  if (!nome || capacidade === undefined) {
    return "Campos obrigatórios: nome, capacidade";
  }
  if (typeof nome !== "string" || nome.trim().length === 0 || nome.length > 100) {
    return "nome deve ser um texto de até 100 caracteres";
  }
  if (!Number.isInteger(capacidade) || capacidade <= 0) {
    return "capacidade deve ser um número inteiro maior que zero";
  }
  if (localizacao !== undefined && localizacao !== null && typeof localizacao !== "string") {
    return "localizacao deve ser um texto";
  }
  if (ativa !== undefined && typeof ativa !== "boolean") {
    return "ativa deve ser true ou false";
  }
  return null;
}

// LISTAR — GET /salas (filtro opcional: ?ativa=true|false)
router.get("/", async (req, res) => {
  const { ativa } = req.query;
  if (ativa !== undefined && ativa !== "true" && ativa !== "false") {
    return res.status(400).json({ erro: "ativa deve ser true ou false" });
  }
  const { rows } = await pool.query(
    `SELECT * FROM salas
      WHERE ($1::boolean IS NULL OR ativa = $1)
      ORDER BY nome`,
    [ativa ?? null]
  );
  res.json(rows);
});

// BUSCAR POR ID — GET /salas/:id
// É esta rota que o serviço de reservas chama para validar a sala.
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM salas WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ erro: "Sala não encontrada" });
  res.json(rows[0]);
});

// CRIAR — POST /salas
router.post("/", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { nome, capacidade, localizacao = null, ativa = true } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO salas (nome, capacidade, localizacao, ativa)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nome.trim(), capacidade, localizacao, ativa]
  );
  res.status(201).json(rows[0]);
});

// ATUALIZAR — PUT /salas/:id (substitui os dados da sala)
router.put("/:id", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { nome, capacidade, localizacao = null, ativa = true } = req.body;
  const { rows } = await pool.query(
    `UPDATE salas
        SET nome = $1, capacidade = $2, localizacao = $3, ativa = $4, atualizado_em = NOW()
      WHERE id = $5 RETURNING *`,
    [nome.trim(), capacidade, localizacao, ativa, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ erro: "Sala não encontrada" });
  res.json(rows[0]);
});

// DELETAR — DELETE /salas/:id
router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM salas WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ erro: "Sala não encontrada" });
  res.status(204).end();
});

module.exports = router;
