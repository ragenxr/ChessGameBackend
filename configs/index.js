module.exports = {
  development: {
    auth: {
      secret: 'super-secret',
    },
    broker: {
      url: 'redis://localhost:6379'
    },
    logger: {
      level: 'debug',
      host: 'http://localhost:3100',
      console: 1
    },
    metrics: {
      prefix: 'multiplayer_chess_game'
    },
    database: {
      client: 'pg',
      connection: 'postgresql://multiplayer_chess_game:Passw0rd@localhost:5432/multiplayer_chess_game',
      pool: {
        min: 4,
        max: 16
      },
      migrations: {
        tableName: 'migrations',
        directory: './db/migrations'
      },
      seeds: {
        directory: './db/seeds'
      }
    }
  },
  production: {
    auth: {
      secret: process.env.AUTH_SECRET,
    },
    broker: {
      url: process.env.REDIS_URL
    },
    logger: {
      level: process.env.LOGGER_LEVEL,
      host: process.env.LOKI_HOST,
      console: Number(process.env.ENABLE_CONSOLE)
    },
    metrics: {
      prefix: process.env.METRICS_PREFIX
    },
    database: {
      client: 'pg',
      connection: process.env.DB_URL,
      pool: {
        min: Number(process.env.DB_MIN_POOL),
        max: Number(process.env.DB_MAX_POOL)
      },
      migrations: {
        tableName: 'migrations',
        directory: './db/migrations'
      },
      seeds: {
        directory: './db/seeds'
      }
    }
  }
};