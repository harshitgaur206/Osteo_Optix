# Stage 1: Build the Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy the frontend folder
COPY frontend/ ./frontend/

# Install dependencies and build
WORKDIR /app/frontend
RUN npm ci
RUN npm run build

# Stage 2: Setup the Python backend
FROM python:3.11-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy the built frontend (index.html) from the builder stage
# The frontend build script copies the dist to /app/index.html
COPY --from=frontend-builder /app/index.html ./index.html

# Change working directory for Uvicorn
WORKDIR /app/backend

# Expose the port Uvicorn runs on
EXPOSE 8000

# Seed the database and start the server
CMD ["sh", "-c", "python -m app.seed_data && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
