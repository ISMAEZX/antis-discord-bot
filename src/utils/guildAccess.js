const { handleInviteMessage } = require('./messageHandler');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (newMessage.author.bot) return;
    await handleInviteMessage(newMessage, true);
  }
};
