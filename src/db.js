// Conexão com o PostgreSQL (Neon em produção).
// A string de conexão vem da variável de ambiente DATABASE_URL,
// configurada no painel do Render — nunca escrita no código.
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
    CREATE TABLE IF NOT EXISTS reservas (
      id            SERIAL PRIMARY KEY,
      sala          VARCHAR(100) NOT NULL,
      responsavel   VARCHAR(100) NOT NULL,
      inicio        TIMESTAMPTZ  NOT NULL,
      fim           TIMESTAMPTZ  NOT NULL,
      status        VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',
      criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT fim_depois_do_inicio CHECK (fim > inicio),
      CONSTRAINT status_valido CHECK (status IN ('PENDENTE', 'CONFIRMADA', 'CANCELADA'))
    )
  `);
}

module.exports = { pool, inicializarBanco };
