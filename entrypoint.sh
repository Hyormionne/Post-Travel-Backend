#!/bin/sh
set -e

# Prisma 7 requires prisma.config.js for migrate deploy
# Generate it dynamically from DATABASE_URL env var
cat > /app/prisma.config.js << EOF
const { defineConfig } = require('prisma/config');
module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: '${DATABASE_URL}' },
});
EOF

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy
echo "Migrations complete. Starting server..."

exec node dist/src/main.js
