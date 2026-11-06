FROM node:24.18.0-bookworm-slim
ENV NODE_ENV=production
ENV MAILBOX_DATA_DIR=/data
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src/mailbox-protocol.js ./src/mailbox-protocol.js
COPY services/mailbox-receiver ./services/mailbox-receiver
EXPOSE 8080
CMD ["node","services/mailbox-receiver/entrypoint.js"]
