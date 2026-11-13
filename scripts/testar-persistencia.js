// Teste de PERSISTÊNCIA dos dados nos volumes do Docker (Módulo 3).
//
// Uso (com o docker compose já no ar):
//   npm run test:persistencia
//
// O que ele faz:
//   1. Cria uma sala, um usuário e uma reserva CONFIRMADA (um registro em cada banco).
//   2. Roda "docker compose down": apaga TODOS os containers (serviços e bancos).
//   3. Confere que a API saiu do ar de verdade.
//   4. Roda "docker compose up -d --wait": cria containers NOVOS a partir das imagens.
//   5. Busca os 3 registros de novo e confere que continuam iguais.
//
// Os dados sobrevivem porque ficam nos volumes nomeados (dados-salas,
// dados-usuarios, dados-reservas), e não dentro dos containers.
// Os registros criados NÃO são apagados no final, para poderem ser vistos depois.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const URLS = {
  reservas: "http://localhost:3000",
  salas: "http://localhost:3001",
  usuarios: "http://localhost:3002",
};

async function chamar(servico, metodo, caminho, corpo) {
  const resp = await fetch(URLS[servico] + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const texto = await resp.text();
  return { status: resp.status, dados: texto ? JSON.parse(texto) : null };
}

let passos = 0;
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error("FALHOU: " + mensagem);
  passos++;
  console.log("    ✔ " + mensagem);
}

function docker(...args) {
  console.log(`\n$ docker ${args.join(" ")}`);
  execFileSync("docker", args, { cwd: RAIZ, stdio: "inherit" });
}

async function apiNoAr() {
  try {
    await fetch(`${URLS.reservas}/health`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const sufixo = Date.now();

  console.log("=== 1. Criando dados (um registro em cada banco) ===");
  const sala = await chamar("salas", "POST", "/salas", {
    nome: `Sala persistente ${sufixo}`,
    capacidade: 40,
    localizacao: "Bloco C",
  });
  conferir(sala.status === 201, `Sala criada (id ${sala.dados?.id}) no banco salas_db`);

  const usuario = await chamar("usuarios", "POST", "/usuarios", {
    nome: "João Persistente",
    email: `joao.${sufixo}@exemplo.com`,
    tipo: "ALUNO",
  });
  conferir(usuario.status === 201, `Usuário criado (id ${usuario.dados?.id}) no banco usuarios_db`);

  // Horário único por execução, para nunca conflitar com execuções anteriores.
  const dia = new Date(Date.UTC(2027, 0, 1) + (sufixo % 1000) * 86400000).toISOString().slice(0, 10);
  const reserva = await chamar("reservas", "POST", "/reservas", {
    sala_id: sala.dados.id,
    usuario_id: usuario.dados.id,
    inicio: `${dia}T08:00:00-03:00`,
    fim: `${dia}T10:00:00-03:00`,
  });
  conferir(reserva.status === 201, `Reserva criada (id ${reserva.dados?.id}) no banco reservas_db`);
  const confirmada = await chamar("reservas", "PATCH", `/reservas/${reserva.dados.id}/status`, {
    status: "CONFIRMADA",
  });
  conferir(confirmada.dados?.status === "CONFIRMADA", "Reserva CONFIRMADA");

  console.log("\n=== 2. Derrubando TUDO (containers dos serviços e dos bancos) ===");
  docker("compose", "down");
  conferir(!(await apiNoAr()), "API fora do ar: os containers não existem mais");

  console.log("\n=== 3. Subindo containers NOVOS ===");
  docker("compose", "up", "-d", "--wait");

  console.log("\n=== 4. Os dados continuam lá? ===");
  const salaDepois = await chamar("salas", "GET", `/salas/${sala.dados.id}`);
  conferir(
    salaDepois.status === 200 && salaDepois.dados.nome === sala.dados.nome,
    `Sala ${sala.dados.id} ainda existe: "${salaDepois.dados?.nome}"`
  );

  const usuarioDepois = await chamar("usuarios", "GET", `/usuarios/${usuario.dados.id}`);
  conferir(
    usuarioDepois.status === 200 && usuarioDepois.dados.email === usuario.dados.email,
    `Usuário ${usuario.dados.id} ainda existe: ${usuarioDepois.dados?.email}`
  );

  const reservaDepois = await chamar("reservas", "GET", `/reservas/${reserva.dados.id}`);
  conferir(
    reservaDepois.status === 200 &&
      reservaDepois.dados.status === "CONFIRMADA" &&
      reservaDepois.dados.inicio === reserva.dados.inicio,
    `Reserva ${reserva.dados.id} ainda existe e continua CONFIRMADA`
  );
  conferir(
    reservaDepois.dados.sala?.id === sala.dados.id && reservaDepois.dados.usuario?.id === usuario.dados.id,
    "Reserva continua compondo sala e usuário via HTTP (os 3 bancos persistiram)"
  );

  console.log(`\nTodos os ${passos} testes de persistência passaram! ✅`);
  console.log("Os dados ficam nos volumes. Para apagar tudo de verdade: docker compose down -v");
})().catch((err) => {
  console.error("\n" + (err.cause?.code === "ECONNREFUSED" ? "A API não está no ar. Rode antes: docker compose up -d --build" : err.message));
  process.exit(1);
});
