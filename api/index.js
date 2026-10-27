const { default: handler } = require('../dist/src/vercel');

module.exports = handler;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
