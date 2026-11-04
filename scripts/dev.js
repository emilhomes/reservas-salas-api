// Sobe os 3 microsserviços localmente, cada um em seu próprio processo e porta.
// Uso: npm run dev
//
// Cada serviço lê o seu próprio services/<nome>/.env. Os logs aparecem aqui,
// com um prefixo colorido indicando de qual serviço veio cada linha.
// Ctrl+C encerra todos.
const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

const SERVICOS = [
  { nome: "salas", cor: "\x1b[36m" },
  { nome: "usuarios", cor: "\x1b[35m" },
  { nome: "reservas", cor: "\x1b[33m" },
];
const RESET = "\x1b[0m";
const largura = Math.max(...SERVICOS.map((s) => s.nome.length));

const processos = SERVICOS.map(({ nome, cor }) => {
  const prefixo = `${cor}[${nome.padEnd(largura)}]${RESET}`;
  const filho = spawn(
    process.execPath,
    ["--watch", "--env-file-if-exists=.env", "src/index.js"],
    { cwd: path.join(__dirname, "..", "services", nome), stdio: ["ignore", "pipe", "pipe"] }
  );
  for (const fluxo of [filho.stdout, filho.stderr]) {
    readline.createInterface({ input: fluxo }).on("line", (linha) => console.log(`${prefixo} ${linha}`));
  }
  filho.on("exit", (codigo) => console.log(`${prefixo} processo encerrado (código ${codigo})`));
  return filho;
});

function encerrar() {
  for (const p of processos) p.kill();
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
