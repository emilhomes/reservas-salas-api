// Conexão com o banco PRÓPRIO do serviço de salas.
// Nenhum outro serviço acessa este banco: quem precisar de dados de sala
// pergunta a este serviço via HTTP (GET /salas/:id).
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("ERRO: variável de ambiente DATABASE_URL não definida.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Cria a tabela na primeira execução (migração simples).
async function inicializarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salas (
      id            SERIAL PRIMARY KEY,
      nome          VARCHAR(100) NOT NULL UNIQUE,
      capacidade    INTEGER      NOT NULL,
      localizacao   VARCHAR(150),
      ativa         BOOLEAN      NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT capacidade_positiva CHECK (capacidade > 0)
    )
  `);
}

module.exports = { pool, inicializarBanco };
