const http = require('http');
const configs = require('./configs');
const configureApp = require('./src/app');
const configureBroker = require('./src/broker');
const configureDb = require('./src/db');
const configureLogger = require('./src/logger');
const configureMetrics = require('./src/metrics');
const configureSockets = require('./src/sockets');
const {auth} = require('./src/middlewares');

(async() => {
  const injects = {};

  injects.config = configs[process.env.NODE_ENV || 'development']
  injects.db = await configureDb(injects);
  injects.auth = auth(injects);
  injects.broker = await configureBroker(injects);
  injects.logger = configureLogger(injects);
  injects.metrics = configureMetrics(injects);
  injects.server = http.createServer(await configureApp(injects));

  process.on(
    'SIGINT',
    async() => {
      try {
        await Promise.all([
          injects.db.destroy(),
          injects.broker.pub.disconnect(),
          injects.broker.sub.disconnect()
        ]);

        injects.server.close(
          (err) => {
            process.exit(err ? 1 : 0);
          }
        );
      } catch (err) {
        process.exit(1);
      }
    }
  );

  const initSockets = await configureSockets(injects);

  injects.server.listen(
    process.env.PORT || 12321,
    async() => {
      await initSockets();

      process.send('ready');
    }
  );
})();
