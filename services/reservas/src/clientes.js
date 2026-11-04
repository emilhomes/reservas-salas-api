// Clientes HTTP para os outros microsserviços (comunicação SÍNCRONA via REST).
//
// O serviço de reservas não acessa os bancos de salas e usuários: ele pergunta
// aos serviços donos desses dados. Se o serviço não responder dentro do prazo
// (timeout) ou estiver fora do ar, tentamos de novo e, se ainda falhar,
// lançamos ServicoIndisponivelError, que vira uma resposta 503 amigável.

const TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 5000;
const TENTATIVAS = Number(process.env.HTTP_TENTATIVAS) || 2;
const ESPERA_ENTRE_TENTATIVAS_MS = 500;

function urlBase(variavel, padrao) {
  return (process.env[variavel] || padrao).replace(/\/$/, "");
}

const SALAS_URL = urlBase("SALAS_URL", "http://localhost:3001");
const USUARIOS_URL = urlBase("USUARIOS_URL", "http://localhost:3002");

class ServicoIndisponivelError extends Error {
  constructor(servico, causa) {
    super(`Serviço de ${servico} indisponível`);
    this.servico = servico;
    this.causa = causa;
  }
}

// Descreve a falha de forma curta para o log (ex.: "ECONNREFUSED", "timeout de 5000 ms").
function descreverFalha(err) {
  if (err.name === "TimeoutError") return `timeout de ${TIMEOUT_MS} ms`;
  return err.cause?.code || err.message;
}

// Faz GET em outro serviço.
// Retorna o JSON (200), null (404 = recurso não existe) ou lança ServicoIndisponivelError.
async function buscar(servico, url) {
  let ultimaFalha;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const inicio = Date.now();
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      console.log(`[reservas -> ${servico}] GET ${url} -> HTTP ${resp.status} (${Date.now() - inicio} ms)`);

      if (resp.status === 404) return null;
      if (resp.ok) return await resp.json();
      ultimaFalha = `HTTP ${resp.status}`;
    } catch (err) {
      ultimaFalha = descreverFalha(err);
    }

    console.warn(`[reservas -> ${servico}] tentativa ${tentativa}/${TENTATIVAS} falhou: ${ultimaFalha}`);
    if (tentativa < TENTATIVAS) {
      await new Promise((r) => setTimeout(r, ESPERA_ENTRE_TENTATIVAS_MS));
    }
  }

  throw new ServicoIndisponivelError(servico, ultimaFalha);
}

const buscarSala = (id) => buscar("salas", `${SALAS_URL}/salas/${id}`);
const buscarUsuario = (id) => buscar("usuarios", `${USUARIOS_URL}/usuarios/${id}`);

// Verifica rapidamente (1 tentativa, 2 s) se um serviço responde ao /health.
async function verificarSaude(baseUrl) {
  try {
    const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? "ok" : `erro (HTTP ${resp.status})`;
  } catch (err) {
    return `indisponível (${descreverFalha(err)})`;
  }
}

const verificarDependencias = async () => {
  const [salas, usuarios] = await Promise.all([
    verificarSaude(SALAS_URL),
    verificarSaude(USUARIOS_URL),
  ]);
  return { salas, usuarios };
};

module.exports = {
  buscarSala,
  buscarUsuario,
  verificarDependencias,
  ServicoIndisponivelError,
  SALAS_URL,
  USUARIOS_URL,
  TIMEOUT_MS,
  TENTATIVAS,
};
