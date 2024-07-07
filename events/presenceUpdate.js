const { Events } = require('discord.js');

module.exports = { 
    name: Events.presenceUpdate, 
    execute(oldPresence, newPresence) { 
        console.log(`User ${newPresence.userID} has updated their presence.`);
    }
}
