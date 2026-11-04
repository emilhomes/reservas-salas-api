// Conexão com o banco PRÓPRIO do serviço de reservas.
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
// sala_id e usuario_id NÃO são chaves estrangeiras: salas e usuários vivem em
// outros bancos, de outros serviços. A integridade é garantida consultando
// esses serviços via HTTP antes de gravar (ver clientes.js).
async function inicializarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id            SERIAL PRIMARY KEY,
      sala_id       INTEGER      NOT NULL,
      usuario_id    INTEGER      NOT NULL,
      inicio        TIMESTAMPTZ  NOT NULL,
      fim           TIMESTAMPTZ  NOT NULL,
      status        VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',
      criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT fim_depois_do_inicio CHECK (fim > inicio),
      CONSTRAINT status_valido CHECK (status IN ('PENDENTE', 'CONFIRMADA', 'CANCELADA'))
    )
  `);

  // Proteção: se DATABASE_URL apontar para o banco antigo do Módulo 1, a tabela
  // "reservas" já existe com a coluna "sala" (texto) e o CREATE acima não faz nada.
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'reservas' AND column_name = 'sala_id'`
  );
  if (rows.length === 0) {
    throw new Error(
      "A tabela 'reservas' deste banco é a do Módulo 1 (sem sala_id). " +
        "Aponte DATABASE_URL para um banco novo, exclusivo do serviço de reservas (ex.: reservas_db)."
    );
  }
}

module.exports = { pool, inicializarBanco };
