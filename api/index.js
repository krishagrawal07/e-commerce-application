const { handleVercelRequest } = require("../server");

module.exports = async function handler(req, res) {
  await handleVercelRequest(req, res);
};
