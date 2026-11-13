// Microsserviço de RESERVAS: entidade central do domínio.
// Depende dos serviços de SALAS e USUÁRIOS, consultados via HTTP.
const express = require("express");
const { pool, inicializarBanco } = require("./db");
const reservasRouter = require("./reservas");
const {
  verificarDependencias,
  ServicoIndisponivelError,
  SALAS_URL,
  USUARIOS_URL,
  TIMEOUT_MS,
  TENTATIVAS,
} = require("./clientes");

const app = express();
// O Render define a porta via variável de ambiente PORT.
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Requisição sem corpo: req.body vem undefined no Express 5; usamos {} para validar.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

app.get("/", (req, res) => {
  res.json({
    servico: "reservas",
    versao: "3.0.0 (Módulo 3 - Containers)",
    dependencias: { salas: SALAS_URL, usuarios: USUARIOS_URL },
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

// Health check: estado do próprio serviço + estado dos serviços de que ele depende.
// O código HTTP reflete só o próprio serviço (banco): se salas cair, reservas
// continua "vivo" (consegue listar, mudar status, apagar), apenas degradado.
app.get("/health", async (req, res) => {
  const dependencias = await verificarDependencias();
  try {
    await pool.query("SELECT 1");
    res.json({ servico: "reservas", status: "ok", banco: "conectado", dependencias });
  } catch {
    res.status(503).json({ servico: "reservas", status: "erro", banco: "indisponível", dependencias });
  }
});

app.use("/reservas", reservasRouter);

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

// Tratamento central de erros (Express 5 captura erros de rotas async automaticamente).
app.use((err, req, res, next) => {
  // Serviço dependente fora do ar ou lento demais: 503 com mensagem amigável.
  if (err instanceof ServicoIndisponivelError) {
    console.error(`[reservas] ${err.message} (${err.causa}). Respondendo 503.`);
    return res.status(503).json({
      erro: `O serviço de ${err.servico} está indisponível no momento. Tente novamente em instantes.`,
      servico: err.servico,
    });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "JSON inválido no corpo da requisição" });
  }
  // 22P02 = parâmetro em formato inválido (ex.: /reservas/abc)
  if (err.code === "22P02") {
    return res.status(400).json({ erro: "Parâmetro em formato inválido" });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

inicializarBanco()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serviço de RESERVAS rodando na porta ${PORT}`);
      console.log(`  -> salas:    ${SALAS_URL}`);
      console.log(`  -> usuarios: ${USUARIOS_URL}`);
      console.log(`  -> timeout ${TIMEOUT_MS} ms, ${TENTATIVAS} tentativa(s) por chamada`);
    });
  })
  .catch((err) => {
    console.error("Falha ao iniciar o serviço de reservas:", err.message || err.code || err);
    process.exit(1);
  });
