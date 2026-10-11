# Die Seite auf Hugging Face Spaces (kostenlos, ohne Karte, 2 vCPU / 16 GB).
#
# Kein eigener Bau: das Image kommt fertig aus dem GitHub-Ablauf web-image.yml und ist oeffentlich.
# Hugging Face startet den Container als Nutzer 1000 und erwartet den Port 7860.
FROM ghcr.io/comphubgg/comphub-web:latest
USER root
ENV PORT=7860 HOSTNAME=0.0.0.0 \
    COMPHUB_INTERN_URL=http://127.0.0.1:7860 \
    NODE_OPTIONS=--max-old-space-size=3500
RUN chown -R 1000:1000 /app
USER 1000
EXPOSE 7860
CMD ["node", "server.js"]
