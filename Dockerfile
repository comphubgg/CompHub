FROM mcr.microsoft.com/playwright/python:latest

WORKDIR /app

# Copy project files
COPY . /app

# Install Python deps (requirements.txt optional)
RUN python -m pip install --upgrade pip && \
    python -m pip install --no-cache-dir playwright requests python-dotenv supabase || true

RUN chmod +x /app/entrypoint.sh || true

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/app/entrypoint.sh"]
