# cards.joebad.com

A blackjack game

## Project Structure

```
cards/
├── api/                   # F# API project
│   ├── blackjack.db       # SQLite database
│   ├── wwwroot/           # Static web assets (built from web/)
│   └── *.fsproj           # F# project files
├── web/                   # Frontend web project
│   ├── src/               # Source code
│   ├── package.json       # Node.js dependencies
│   ├── yarn.lock          # Yarn lockfile
│   └── webpack.config.js  # Webpack configuration
├── Dockerfile             # Multi-stage Docker build
└── README.md
```

## Prerequisites

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js 18+](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

## Local Development

### Running the API (F# Backend)

1. Navigate to the API directory:
   ```bash
   cd api
   ```

2. Restore dependencies:
   ```bash
   dotnet restore
   ```

3. Run the API:
   ```bash
   dotnet run
   ```

The API will start on `https://localhost:8080`

### Running the Web Frontend

1. Navigate to the web directory:
   ```bash
   cd web
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the development server:
   ```bash
   yarn dev
   ```

The frontend development server will run on `http://localhost:8081` with hot reload enabled.

## Database

The SQLite database (`blackjack.db`) is automatically created by the F# application on first run if it doesn't exist. The database file is stored in the `api/` directory during local development.

## Docker Deployment

### Building the Docker Image

From the project root:

```bash
docker build -t blackjack-app .
```

### Running with Docker

```bash
# Run with database persistence
docker run -d -p 8080:8080 -v blackjack-data:/app/data blackjack-app
```

The application will be available at `http://localhost:8080`.

### Docker Volume

The SQLite database is persisted in the Docker volume `blackjack-data`. This ensures your game data survives container restarts.

To inspect the volume:
```bash
docker volume inspect blackjack-data
```