FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    USE_TF=0 \
    DISABLE_HEAVY_CV=1 \
    USE_TFIDF_RAG=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN python -m pip install --upgrade pip \
    && python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
    && python -m pip install -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 app \
    && chown -R app:app /app

USER app

EXPOSE 5050

CMD ["sh", "-c", "exec gunicorn --chdir dashboard server:app --bind 0.0.0.0:${PORT:-5050} --workers 1 --timeout 600"]
