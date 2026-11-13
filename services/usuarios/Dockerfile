# Imagem do microsserviço de USUÁRIOS (Módulo 3 - Containers)
#
# Build em duas etapas (multi-stage):
#   1) "dependencias": instala só as dependências de produção (express e pg).
#   2) "final": copia node_modules e o código para uma imagem limpa, sem o cache do npm.

# ---------- Etapa 1: dependências ----------
FROM node:22-alpine AS dependencias
WORKDIR /app
# Copiar só o package*.json primeiro aproveita o cache de camadas do Docker:
# se o código mudar mas as dependências não, o "npm ci" não roda de novo.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Etapa 2: imagem final ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3002
WORKDIR /app
COPY --from=dependencias --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Não roda como root: o usuário "node" já vem na imagem oficial.
USER node
EXPOSE 3002

# O Docker só considera o container "healthy" quando o /health responde 200
# (serviço no ar E conectado ao banco).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3002/health || exit 1

CMD ["node", "src/index.js"]
