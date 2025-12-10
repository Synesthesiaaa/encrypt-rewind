module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`✅ ${client.user.tag} is online and ready to create epic LoL Year-end rewinds!`);
    client.user.setActivity('LoL Year-end Rewind', { type: 'WATCHING' });
  },
};