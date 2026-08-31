FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ingest-worker/syraa_ingest ./services/ingest-worker/syraa_ingest
COPY services/ingest-worker/worker.py ./services/ingest-worker/worker.py

ENV PYTHONPATH=/app/services/ingest-worker
ENV DRIVE_ROOT=/data/drive

CMD ["python", "services/ingest-worker/worker.py"]
