const { Events } = require('discord.js');

// Cria um mapa global para rastrear quem está digitando
global.typingUsers = new Map();

module.exports = {
    name: Events.TypingStart,
    execute({ channel, user }) {        

        if (!typingUsers.has(channel.id)) {
            typingUsers.set(channel.id, new Set());            
        }
        typingUsers.get(channel.id).add(user.id);        

        let location = channel.isThread() ? `thread ${channel.name} in ${channel.parent.name} channel` : `${channel.name} channel`;
        console.log(`${user.username} is typing in the ${location}...`);

        // Remove a entrada após 5 segundos
        setTimeout(() => {
            if (typingUsers.has(channel.id)) {
                typingUsers.get(channel.id).delete(user.id);                
                if (typingUsers.get(channel.id).size === 0) {
                    typingUsers.delete(channel.id);                    
                }
            }
        }, 5000);
    }
};
