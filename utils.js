
const { v4: uuidv4 } = require('uuid');

function generateUUID() {
  return uuidv4();
}

// Outras funções utilitárias podem ser adicionadas aqui

module.exports = {
  generateUUID,
};
