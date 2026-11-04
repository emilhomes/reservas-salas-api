// Conexão com o banco PRÓPRIO do serviço de usuários.
// Nenhum outro serviço acessa este banco: quem precisar de dados de usuário
// pergunta a este serviço via HTTP (GET /usuarios/:id).
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
    CREATE TABLE IF NOT EXISTS usuarios (
      id            SERIAL PRIMARY KEY,
      nome          VARCHAR(100) NOT NULL,
      email         VARCHAR(150) NOT NULL UNIQUE,
      tipo          VARCHAR(20)  NOT NULL,
      criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT tipo_valido CHECK (tipo IN ('ALUNO', 'PROFESSOR', 'SERVIDOR'))
    )
  `);
}

module.exports = { pool, inicializarBanco };
