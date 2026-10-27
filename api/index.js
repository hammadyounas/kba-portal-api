const { existsSync } = require('fs');
const { join } = require('path');

function pinPrismaEngine() {
  if (process.platform !== 'linux') return;

  const engine = join(
    __dirname,
    '../prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node',
  );
  if (existsSync(engine)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
  }
}

let handlerPromise;

function loadHandler() {
  if (!handlerPromise) {
    pinPrismaEngine();
    handlerPromise = Promise.resolve()
      .then(() => require('../dist/main').default)
      .catch((error) => {
        handlerPromise = undefined;
        throw error;
      });
  }
  return handlerPromise;
}

module.exports = async function handler(req, res) {
  try {
    const nestHandler = await loadHandler();
    await nestHandler(req, res);
  } catch (error) {
    console.error(error);
    if (res.headersSent) return;
    const message = error instanceof Error ? error.message : 'Server failed to start';
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message }));
  }
};
