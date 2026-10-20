const express = require("express");
const { pool, inicializarBanco } = require("./db");
const reservasRouter = require("./reservas");

const app = express();
// O Render define a porta via variável de ambiente PORT.
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    servico: "API de Reserva de Salas",
    versao: "1.0.0 (Módulo 1 - Computação em Nuvem)",
    endpoints: [
      "GET    /health",
      "GET    /reservas",
      "GET    /reservas/:id",
      "POST   /reservas",
      "PUT    /reservas/:id",
      "PATCH  /reservas/:id/status",
      "DELETE /reservas/:id",
    ],
  });
});

// Health check: confirma que a API está no ar e consegue falar com o banco.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", banco: "conectado" });
  } catch {
    res.status(503).json({ status: "erro", banco: "indisponível" });
  }
});

app.use("/reservas", reservasRouter);

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

// Tratamento central de erros (Express 5 captura erros de rotas async automaticamente).
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "JSON inválido no corpo da requisição" });
  }
  // 22P02 = id em formato inválido (ex.: /reservas/abc)
  if (err.code === "22P02") {
    return res.status(400).json({ erro: "Parâmetro em formato inválido" });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

inicializarBanco()
  .then(() => {
    app.listen(PORT, () => console.log(`API de reservas rodando na porta ${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao conectar no banco de dados:", err.message || err.code || err);
    process.exit(1);
  });
