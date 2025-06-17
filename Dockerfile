# Multi-stage build for F# API + Webpack Web project
FROM node:18-alpine AS web-build

# Set working directory for web build
WORKDIR /app/web

# Copy web project files
COPY web/package.json web/yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy web source and build
COPY web/ ./
ENV URL=cards.joebad.com
RUN yarn build

# F# build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS api-build

# Set working directory for API build
WORKDIR /app/api

# Copy F# project files and restore dependencies
COPY api/*.fsproj ./
RUN dotnet restore

# Copy API source code
COPY api/ ./

# Copy built web assets to wwwroot
COPY --from=web-build /app/web/dist ./wwwroot/

# Build the F# application
RUN dotnet publish -c Release -o out

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0

# Create app directory
WORKDIR /app

# Copy the published API application
COPY --from=api-build /app/api/out ./

# Create directory for SQLite database with proper permissions
RUN mkdir -p /app/data && chown -R app:app /app/data

# Copy existing database if it exists (optional - comment out if database doesn't exist yet)
# COPY api/blackjack.db /app/data/blackjack.db

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:5001
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Start the application
ENTRYPOINT ["dotnet", "Api.dll"]