// Teste de ponta a ponta dos 3 microsserviços (local ou em nuvem).
//
// Uso (local, portas padrão 3000/3001/3002):
//   npm run test:api
//
// Uso (nuvem):
//   npm run test:api -- --reservas https://RESERVAS.onrender.com \
//                       --salas    https://SALAS.onrender.com \
//                       --usuarios https://USUARIOS.onrender.com
//
// Também aceita as variáveis de ambiente RESERVAS_URL, SALAS_URL e USUARIOS_URL.

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const url = (nome, variavel, padrao) => (argumento(nome) || process.env[variavel] || padrao).replace(/\/$/, "");

const URLS = {
  reservas: url("reservas", "RESERVAS_URL", "http://localhost:3000"),
  salas: url("salas", "SALAS_URL", "http://localhost:3001"),
  usuarios: url("usuarios", "USUARIOS_URL", "http://localhost:3002"),
};

async function chamar(servico, metodo, caminho, corpo) {
  const resp = await fetch(URLS[servico] + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const texto = await resp.text();
  const dados = texto ? JSON.parse(texto) : null;
  console.log(`\n>>> [${servico}] ${metodo} ${caminho}  ->  HTTP ${resp.status}`);
  if (dados) console.log(JSON.stringify(dados, null, 2));
  return { status: resp.status, dados };
}

let passos = 0;
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error("FALHOU: " + mensagem);
  passos++;
  console.log("    ✔ " + mensagem);
}

// No plano gratuito do Render cada serviço "dorme" sozinho. Antes de testar,
// acordamos os três (o primeiro acesso pode levar ~1 minuto).
async function acordar(servico) {
  const inicio = Date.now();
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp = await fetch(`${URLS[servico]}/health`, { signal: AbortSignal.timeout(90000) });
      if (resp.ok) {
        console.log(`    ${servico.padEnd(8)} no ar (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
        return;
      }
    } catch {
      /* tenta de novo */
    }
  }
  throw new Error(`FALHOU: serviço de ${servico} não respondeu em ${URLS[servico]}`);
}

(async () => {
  console.log("Testando os microsserviços:");
  for (const [nome, endereco] of Object.entries(URLS)) console.log(`    ${nome.padEnd(8)} ${endereco}`);

  console.log("\n=== 0. Acordando os serviços ===");
  await Promise.all(Object.keys(URLS).map(acordar));

  const sufixo = Date.now(); // evita nomes/emails repetidos entre execuções

  console.log("\n=== 1. Serviço de SALAS ===");
  const sala = await chamar("salas", "POST", "/salas", {
    nome: `Laboratório 01 (teste ${sufixo})`,
    capacidade: 30,
    localizacao: "Bloco B, térreo",
  });
  conferir(sala.status === 201, "CRIAR sala");
  const salaId = sala.dados.id;

  const salaInativa = await chamar("salas", "POST", "/salas", {
    nome: `Auditório em reforma (teste ${sufixo})`,
    capacidade: 100,
    ativa: false,
  });
  conferir(salaInativa.status === 201 && salaInativa.dados.ativa === false, "CRIAR sala inativa");

  const salaAtualizada = await chamar("salas", "PUT", `/salas/${salaId}`, {
    nome: `Laboratório 01 (teste ${sufixo})`,
    capacidade: 35,
    localizacao: "Bloco B, térreo",
  });
  conferir(salaAtualizada.dados.capacidade === 35, "ATUALIZAR sala (PUT)");

  console.log("\n=== 2. Serviço de USUÁRIOS ===");
  const usuario = await chamar("usuarios", "POST", "/usuarios", {
    nome: "Maria Teste",
    email: `maria.${sufixo}@exemplo.com`,
    tipo: "PROFESSOR",
  });
  conferir(usuario.status === 201, "CRIAR usuário");
  const usuarioId = usuario.dados.id;

  const buscado = await chamar("usuarios", "GET", `/usuarios/${usuarioId}`);
  conferir(buscado.status === 200, "BUSCAR usuário por id");

  console.log("\n=== 3. Serviço de RESERVAS (consulta salas e usuários via HTTP) ===");
  const horario = { inicio: "2026-11-10T14:00:00-03:00", fim: "2026-11-10T16:00:00-03:00" };

  const reserva = await chamar("reservas", "POST", "/reservas", {
    sala_id: salaId,
    usuario_id: usuarioId,
    ...horario,
  });
  conferir(reserva.status === 201 && reserva.dados.status === "PENDENTE", "CRIAR reserva (sala e usuário validados nos outros serviços)");
  const reservaId = reserva.dados.id;

  const conflito = await chamar("reservas", "POST", "/reservas", {
    sala_id: salaId,
    usuario_id: usuarioId,
    inicio: "2026-11-10T15:00:00-03:00",
    fim: "2026-11-10T17:00:00-03:00",
  });
  conferir(conflito.status === 409, "Bloqueia horário em conflito (409)");

  const semSala = await chamar("reservas", "POST", "/reservas", {
    sala_id: 2147483000,
    usuario_id: usuarioId,
    ...horario,
  });
  conferir(semSala.status === 422, "Recusa sala que não existe no serviço de salas (422)");

  const semUsuario = await chamar("reservas", "POST", "/reservas", {
    sala_id: salaId,
    usuario_id: 2147483000,
    ...horario,
  });
  conferir(semUsuario.status === 422, "Recusa usuário que não existe no serviço de usuários (422)");

  const inativa = await chamar("reservas", "POST", "/reservas", {
    sala_id: salaInativa.dados.id,
    usuario_id: usuarioId,
    ...horario,
  });
  conferir(inativa.status === 422, "Recusa sala inativa (422)");

  const detalhe = await chamar("reservas", "GET", `/reservas/${reservaId}`);
  conferir(
    detalhe.dados.sala?.id === salaId && detalhe.dados.usuario?.id === usuarioId,
    "BUSCAR reserva já vem com dados da sala e do usuário (composição via HTTP)"
  );

  const lista = await chamar("reservas", "GET", `/reservas?sala_id=${salaId}`);
  conferir(lista.dados.some((r) => r.id === reservaId), "LISTAR reservas filtrando por sala");

  const atualizada = await chamar("reservas", "PUT", `/reservas/${reservaId}`, {
    sala_id: salaId,
    usuario_id: usuarioId,
    inicio: "2026-11-10T14:00:00-03:00",
    fim: "2026-11-10T18:00:00-03:00",
  });
  conferir(atualizada.status === 200 && atualizada.dados.fim.startsWith("2026-11-10T21:00"), "ATUALIZAR reserva (PUT)");

  const confirmada = await chamar("reservas", "PATCH", `/reservas/${reservaId}/status`, { status: "CONFIRMADA" });
  conferir(confirmada.dados.status === "CONFIRMADA", "MUDAR STATUS para CONFIRMADA (PATCH)");

  const saude = await chamar("reservas", "GET", "/health");
  conferir(
    saude.dados.dependencias?.salas === "ok" && saude.dados.dependencias?.usuarios === "ok",
    "/health de reservas enxerga salas e usuários"
  );

  console.log("\n=== 4. Limpeza ===");
  conferir((await chamar("reservas", "DELETE", `/reservas/${reservaId}`)).status === 204, "DELETAR reserva");
  conferir((await chamar("reservas", "GET", `/reservas/${reservaId}`)).status === 404, "Reserva deletada não existe mais");
  conferir((await chamar("salas", "DELETE", `/salas/${salaId}`)).status === 204, "DELETAR sala");
  conferir((await chamar("salas", "DELETE", `/salas/${salaInativa.dados.id}`)).status === 204, "DELETAR sala inativa");
  conferir((await chamar("usuarios", "DELETE", `/usuarios/${usuarioId}`)).status === 204, "DELETAR usuário");

  console.log(`\nTodos os ${passos} testes passaram! ✅`);
})().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
