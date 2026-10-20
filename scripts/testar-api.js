// Teste de ponta a ponta da API publicada.
// Uso:  node scripts/testar-api.js https://SUA-API.onrender.com
//   ou: npm run test:api -- https://SUA-API.onrender.com
const BASE_URL = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(BASE_URL + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  const dados = texto ? JSON.parse(texto) : null;
  console.log(`\n>>> ${metodo} ${caminho}  ->  HTTP ${resp.status}`);
  if (dados) console.log(JSON.stringify(dados, null, 2));
  return { status: resp.status, dados };
}

function conferir(condicao, mensagem) {
  if (!condicao) throw new Error("FALHOU: " + mensagem);
  console.log("    ✔ " + mensagem);
}

(async () => {
  console.log(`Testando a API em: ${BASE_URL}`);

  const health = await chamar("GET", "/health");
  conferir(health.status === 200, "API no ar e conectada ao banco");

  const criada = await chamar("POST", "/reservas", {
    sala: "Laboratório 01",
    responsavel: "Turma de Sistemas Distribuídos",
    inicio: "2026-11-10T14:00:00-03:00",
    fim: "2026-11-10T16:00:00-03:00",
  });
  conferir(criada.status === 201, "CRIAR reserva (POST)");
  const id = criada.dados.id;

  const conflito = await chamar("POST", "/reservas", {
    sala: "Laboratório 01",
    responsavel: "Outra pessoa",
    inicio: "2026-11-10T15:00:00-03:00",
    fim: "2026-11-10T17:00:00-03:00",
  });
  conferir(conflito.status === 409, "Bloqueia reserva com horário em conflito");

  const lista = await chamar("GET", "/reservas");
  conferir(lista.dados.some((r) => r.id === id), "LISTAR reservas (GET)");

  const atualizada = await chamar("PUT", `/reservas/${id}`, {
    sala: "Laboratório 02",
    responsavel: "Turma de Sistemas Distribuídos",
    inicio: "2026-11-10T14:00:00-03:00",
    fim: "2026-11-10T18:00:00-03:00",
  });
  conferir(atualizada.dados.sala === "Laboratório 02", "ATUALIZAR reserva (PUT)");

  const confirmada = await chamar("PATCH", `/reservas/${id}/status`, { status: "CONFIRMADA" });
  conferir(confirmada.dados.status === "CONFIRMADA", "MUDAR STATUS para CONFIRMADA (PATCH)");

  const removida = await chamar("DELETE", `/reservas/${id}`);
  conferir(removida.status === 204, "DELETAR reserva (DELETE)");

  const sumiu = await chamar("GET", `/reservas/${id}`);
  conferir(sumiu.status === 404, "Reserva deletada não existe mais");

  console.log("\nTodos os testes passaram! ✅");
})().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
