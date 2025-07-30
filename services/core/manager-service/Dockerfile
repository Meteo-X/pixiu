FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY tests/ ./tests/
COPY migrations/ ./migrations/
COPY alembic.ini .

# Set Python path
ENV PYTHONPATH=/app

# Run database migrations and start the service
CMD alembic upgrade head && python -m src.main