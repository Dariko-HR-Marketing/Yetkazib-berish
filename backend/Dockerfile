FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /app/
COPY frontend/ /frontend/
ENV FRONTEND_DIR=/frontend APP_ENV=production
RUN python manage.py collectstatic --noinput
RUN useradd -m app && mkdir -p /app/media && chown -R app /app/media
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')"
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application -b 0.0.0.0:8000 -w ${WEB_CONCURRENCY:-3} --access-logfile -"]
