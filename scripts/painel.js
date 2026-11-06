// Painel web para demonstrar os 3 microsserviços (Módulo 2).
//
// Uso:
//   npm run painel                 -> painel em http://localhost:4000 (fala com a nuvem ou com serviços locais já rodando)
//   npm run painel -- --local      -> também sobe os 3 serviços locais (precisa dos .env) e permite
//                                     derrubar/religar cada um pelo painel, com os logs ao vivo
//
// O navegador não fala direto com os serviços (eles não têm CORS): o painel faz
// o papel de cliente HTTP, repassando cada requisição para o serviço escolhido.
// Nenhum código dos serviços foi alterado para o painel funcionar.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const PORTA = Number(process.env.PAINEL_PORT) || 4000;
const GERENCIAR_LOCAL = process.argv.includes("--local");
const HTML = path.join(__dirname, "..", "painel", "index.html");

const semBarra = (u) => u.replace(/\/$/, "");
const ALVOS = {
  nuvem: {
    reservas: semBarra(process.env.RESERVAS_NUVEM || "https://reservas-salas-api.onrender.com"),
    salas: semBarra(process.env.SALAS_NUVEM || "https://servico-salas.onrender.com"),
    usuarios: semBarra(process.env.USUARIOS_NUVEM || "https://servico-usuarios.onrender.com"),
  },
  local: {
    reservas: "http://localhost:3000",
    salas: "http://localhost:3001",
    usuarios: "http://localhost:3002",
  },
};
const SERVICOS = ["salas", "usuarios", "reservas"];

// ---------- Eventos ao vivo (Server-Sent Events): logs e estado dos processos locais ----------
const clientes = new Set();
const historico = [];
function emitir(evento) {
  historico.push(evento);
  if (historico.length > 400) historico.shift();
  const dados = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of clientes) res.write(dados);
}

// ---------- Processos locais (só com --local) ----------
const processos = {};
const estados = Object.fromEntries(SERVICOS.map((s) => [s, GERENCIAR_LOCAL ? "parado" : "externo"]));

function mudarEstado(servico, estado) {
  estados[servico] = estado;
  emitir({ tipo: "estado", servico, estado });
}

function iniciar(servico) {
  if (processos[servico]) return;
  mudarEstado(servico, "iniciando");
  const filho = spawn(process.execPath, ["--env-file-if-exists=.env", "src/index.js"], {
    cwd: path.join(__dirname, "..", "services", servico),
    stdio: ["ignore", "pipe", "pipe"],
  });
  processos[servico] = filho;
  for (const fluxo of [filho.stdout, filho.stderr]) {
    readline.createInterface({ input: fluxo }).on("line", (linha) => {
      console.log(`[${servico.padEnd(8)}] ${linha}`);
      emitir({ tipo: "log", servico, linha, hora: Date.now() });
      if (linha.includes("rodando na porta")) mudarEstado(servico, "rodando");
    });
  }
  filho.on("exit", (codigo) => {
    delete processos[servico];
    emitir({ tipo: "log", servico, linha: `processo encerrado (código ${codigo})`, hora: Date.now() });
    mudarEstado(servico, "parado");
  });
}

function parar(servico) {
  processos[servico]?.kill();
}

// ---------- Proxy: /api/<alvo>/<servico>/<caminho> ----------
async function repassar(req, res, alvo, servico, caminho) {
  const base = ALVOS[alvo]?.[servico];
  if (!base) return json(res, 404, { erro: "Alvo ou serviço desconhecido" });

  const corpo = await lerCorpo(req);
  const destino = base + caminho;
  const inicio = Date.now();
  try {
    // 90 s: no plano Free do Render o primeiro acesso a um serviço dormindo é lento.
    const resp = await fetch(destino, {
      method: req.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: ["GET", "HEAD", "DELETE"].includes(req.method) ? undefined : corpo || undefined,
      signal: AbortSignal.timeout(90000),
    });
    const texto = await resp.text();
    res.writeHead(resp.status, {
      "Content-Type": resp.headers.get("content-type") || "application/json",
      "X-Destino": destino,
      "X-Duracao-Ms": String(Date.now() - inicio),
    });
    res.end(texto);
  } catch (err) {
    // O próprio serviço chamado não respondeu (diferente do 503 que reservas devolve).
    const causa = err.name === "TimeoutError" ? "timeout de 90 s" : err.cause?.code || err.message;
    res.writeHead(502, {
      "Content-Type": "application/json",
      "X-Destino": destino,
      "X-Duracao-Ms": String(Date.now() - inicio),
      "X-Erro-Painel": "1",
    });
    res.end(JSON.stringify({ erro: `O painel não conseguiu falar com o serviço de ${servico} (${causa})` }));
  }
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => resolve(Buffer.concat(partes).toString()));
  });
}

function json(res, status, dados) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(dados));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://painel");
  const partes = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(HTML).pipe(res);
  }

  if (url.pathname === "/config") {
    return json(res, 200, { alvos: ALVOS, gerenciarLocal: GERENCIAR_LOCAL, estados });
  }

  if (url.pathname === "/eventos") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    for (const evento of historico) res.write(`data: ${JSON.stringify(evento)}\n\n`);
    clientes.add(res);
    req.on("close", () => clientes.delete(res));
    return;
  }

  // POST /processo/<servico>/<iniciar|parar>
  if (partes[0] === "processo" && req.method === "POST") {
    const [, servico, acao] = partes;
    if (!GERENCIAR_LOCAL) return json(res, 400, { erro: "Rode o painel com --local para controlar os serviços" });
    if (!SERVICOS.includes(servico)) return json(res, 404, { erro: "Serviço desconhecido" });
    if (acao === "iniciar") iniciar(servico);
    else if (acao === "parar") parar(servico);
    else return json(res, 404, { erro: "Ação desconhecida" });
    return json(res, 200, { servico, acao });
  }

  if (partes[0] === "api" && partes.length >= 3) {
    const [, alvo, servico, ...resto] = partes;
    return repassar(req, res, alvo, servico, "/" + resto.join("/") + url.search);
  }

  json(res, 404, { erro: "Rota não encontrada" });
});

servidor.listen(PORTA, () => {
  console.log(`Painel de demonstração: http://localhost:${PORTA}`);
  if (GERENCIAR_LOCAL) {
    console.log("Subindo os 3 serviços locais (portas 3001, 3002 e 3000)...");
    SERVICOS.forEach(iniciar);
  }
});

function encerrar() {
  for (const p of Object.values(processos)) p.kill();
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
