// Rotas REST do serviço de usuários (quem faz as reservas).
const express = require("express");
const { pool } = require("./db");

const router = express.Router();

const TIPOS_VALIDOS = ["ALUNO", "PROFESSOR", "SERVIDOR"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida o corpo de criação/atualização. Retorna uma mensagem de erro ou null.
function validar({ nome, email, tipo }) {
  if (!nome || !email || !tipo) {
    return "Campos obrigatórios: nome, email, tipo";
  }
  if (typeof nome !== "string" || nome.trim().length === 0 || nome.length > 100) {
    return "nome deve ser um texto de até 100 caracteres";
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || email.length > 150) {
    return "email inválido";
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return `tipo deve ser um de: ${TIPOS_VALIDOS.join(", ")}`;
  }
  return null;
}

// LISTAR — GET /usuarios (filtro opcional: ?tipo=...)
router.get("/", async (req, res) => {
  const { tipo } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM usuarios
      WHERE ($1::text IS NULL OR tipo = $1)
      ORDER BY nome`,
    [tipo ?? null]
  );
  res.json(rows);
});

// BUSCAR POR ID — GET /usuarios/:id
// É esta rota que o serviço de reservas chama para validar o responsável.
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM usuarios WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ erro: "Usuário não encontrado" });
  res.json(rows[0]);
});

// CRIAR — POST /usuarios
router.post("/", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { nome, email, tipo } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, tipo)
     VALUES ($1, $2, $3) RETURNING *`,
    [nome.trim(), email.trim().toLowerCase(), tipo]
  );
  res.status(201).json(rows[0]);
});

// ATUALIZAR — PUT /usuarios/:id (substitui os dados do usuário)
router.put("/:id", async (req, res) => {
  const erro = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const { nome, email, tipo } = req.body;
  const { rows } = await pool.query(
    `UPDATE usuarios
        SET nome = $1, email = $2, tipo = $3, atualizado_em = NOW()
      WHERE id = $4 RETURNING *`,
    [nome.trim(), email.trim().toLowerCase(), tipo, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ erro: "Usuário não encontrado" });
  res.json(rows[0]);
});

// DELETAR — DELETE /usuarios/:id
router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM usuarios WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ erro: "Usuário não encontrado" });
  res.status(204).end();
});

module.exports = router;
