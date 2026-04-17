# Prabu Rust Copy Engine Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build
FROM rust:1.75-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for better caching
COPY Cargo.toml Cargo.lock* ./

# Create dummy source for dependency caching
RUN mkdir -p src && echo "fn main() {}" > src/main.rs && echo "mod types; mod state; mod websocket; mod trading; mod dex; mod jito; mod health;" > src/lib.rs

# Build dependencies only
RUN cargo build --release --manifest-path ./Cargo.toml && rm -rf src

# Copy actual source
COPY . .

# Build the application
RUN touch src/main.rs src/lib.rs && cargo build --release --manifest-path ./Cargo.toml

# Stage 2: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/prabu-copy-engine /app/prabu-copy-engine

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Run the application
CMD ["./prabu-copy-engine"]
