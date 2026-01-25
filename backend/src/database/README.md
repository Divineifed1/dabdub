## 🛠 Database Setup Guide

This project uses **PostgreSQL** with **TypeORM** as the ORM layer for robust data persistence.

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and update the database credentials:

```bash
cp .env.example .env
```

```dotenv
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=dabdub_dev
DB_POOL_SIZE=10
```

### 2. Start PostgreSQL

Ensure PostgreSQL is running on your machine:

```bash
# macOS (using Homebrew)
brew services start postgresql

# Linux
sudo systemctl start postgresql

# Windows (using Docker - recommended)
docker run --name postgres-dabdub -e POSTGRES_PASSWORD=your_postgres_password -p 5432:5432 -d postgres:15
```

### 3. Create the Database

```bash
# Connect to PostgreSQL
psql -U postgres -h localhost

# Inside psql, create the database:
CREATE DATABASE dabdub_dev;

# Exit psql
\q
```

### 4. Run Migrations

```bash
npm run migration:run
```

You should see output like:

```
query: SELECT * FROM "typeorm_metadata" WHERE "type" = $1 AND "database" = $2 AND "schema" = $3
query: CREATE TABLE "users" ...
query: INSERT INTO "typeorm_metadata" ...
✓ Migration completed
```

## Database Commands

### Migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Generate a new migration from entities (requires build first)
npm run build
npx typeorm migration:generate -d dist/typeorm.config.js src/database/migrations/DescriptionOfChange
```

### Seeding

```bash
# Run database seeds (populate with initial data)
npm run seed:run
```

## Project Structure

```
src/database/
├── database.module.ts          # TypeORM configuration & setup
├── database-config.ts          # Shared database config for CLI tools
├── health.indicator.ts         # Database health check provider
├── DATABASE_CONVENTIONS.md     # Naming conventions & best practices
├── entities/
│   └── base.entity.ts         # Base class for all entities
├── migrations/
│   ├── 1704067200000-CreateUsersTable.ts
│   └── ...                    # Add new migrations here
└── seeds/
    ├── database.seeder.ts     # Main seeding orchestrator
    └── ...                    # Add seed data here
```

## Connection Features

### Connection Pooling

- **Pool Size**: Configured via `DB_POOL_SIZE` (default: 10)
- **Idle Timeout**: 30 seconds
- **Connection Timeout**: 5 seconds
- **Statement Timeout**: 30 seconds

### Query Logging

- **Development**: All queries logged with execution time
- **Production**: Only slow queries (>30s) logged
- Enable/disable via environment: set `NODE_ENV=development` or `NODE_ENV=production`

### SSL Configuration

- **Development**: SSL disabled for easier local development
- **Production**: SSL enabled with `rejectUnauthorized: false`
- Set via environment: `NODE_ENV=production`

## Health Check Endpoint

Monitor database health at runtime:

```bash
curl http://localhost:4000/health
```

Response:

```json
{
  "status": "ok",
  "database": {
    "status": "ok",
    "database": "postgres",
    "responseTime": "2ms",
    "connected": true
  }
}
```

## Creating New Entities

1. Create entity file in `src/entities/`:

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from './database/entities/base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  name: string;
}
```

2. Register in `database.module.ts` (auto-discovered from `src/**/*.entity.ts`)

3. Create migration:

```bash
npm run migration:generate -- src/database/migrations/AddUserEntity
```

4. Review & run migration:

```bash
npm run migration:run
```

## Naming Conventions

See [DATABASE_CONVENTIONS.md](./DATABASE_CONVENTIONS.md) for:

- Entity naming patterns
- Table & column naming rules
- Relationship conventions
- Index naming standards
- Migration best practices

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

- Ensure PostgreSQL is running
- Check `DB_HOST` and `DB_PORT` in `.env`

### Migration Conflicts

- Don't manually edit migration files after they're run
- For local development, use `npm run migration:revert` and regenerate
- In production, create new migration files to undo changes

### Query Timeouts

- Default timeout is 30 seconds
- Optimize slow queries with proper indexes
- Check `DATABASE_CONVENTIONS.md` for indexing patterns

## Production Deployment

1. Set environment variables:

```bash
export NODE_ENV=production
export DB_HOST=your-prod-db.rds.amazonaws.com
export DB_PASSWORD=secure-password
```

2. Run migrations:

```bash
npm run migration:run
```

3. Start application:

```bash
npm run start:prod
```

4. Monitor health:

```bash
curl https://your-api.com/health
```
