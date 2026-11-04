// Microsserviço de USUÁRIOS: cadastro de quem pode fazer reservas.
const express = require("express");
const { pool, inicializarBanco } = require("./db");
const usuariosRouter = require("./usuarios");

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
// Requisição sem corpo: req.body vem undefined no Express 5; usamos {} para validar.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

app.get("/", (req, res) => {
  res.json({
    servico: "usuarios",
    versao: "2.0.0 (Módulo 2 - Microsserviços)",
    endpoints: [
      "GET    /health",
      "GET    /usuarios",
      "GET    /usuarios/:id",
      "POST   /usuarios",
      "PUT    /usuarios/:id",
      "DELETE /usuarios/:id",
    ],
  });
});

// Health check: confirma que o serviço está no ar e consegue falar com o banco.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ servico: "usuarios", status: "ok", banco: "conectado" });
  } catch {
    res.status(503).json({ servico: "usuarios", status: "erro", banco: "indisponível" });
  }
});

app.use("/usuarios", usuariosRouter);

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

// Tratamento central de erros (Express 5 captura erros de rotas async automaticamente).
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "JSON inválido no corpo da requisição" });
  }
  // 22P02 = parâmetro em formato inválido (ex.: /usuarios/abc)
  if (err.code === "22P02") {
    return res.status(400).json({ erro: "Parâmetro em formato inválido" });
  }
  // 23505 = violação de UNIQUE (email repetido)
  if (err.code === "23505") {
    return res.status(409).json({ erro: "Já existe um usuário com esse email" });
  }
  // Não registra dados pessoais (nome/email) no log, só o erro.
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

inicializarBanco()
  .then(() => {
    app.listen(PORT, () => console.log(`Serviço de USUÁRIOS rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao conectar no banco de dados:", err.message || err.code || err);
    process.exit(1);
  });
