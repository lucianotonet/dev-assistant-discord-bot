require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { DISCORD_BOT_TOKEN } = process.env;

class Bot {    
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
                Partials.Reaction,
                Partials.User,
                Partials.ThreadMember
            ],	
        });
        this.client.cooldowns = new Collection();
        this.client.commands = new Collection();

        this.token = DISCORD_BOT_TOKEN;
        this.state = 'stopped'; // Estado inicial do bot

        this.loadCommands();
        this.loadEvents();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const commandPath = path.join(folderPath, file);
                const command = require(commandPath);
                if ('data' in command && 'execute' in command) {
                    this.client.commands.set(command.data.name, command);
                } else {
                    console.log(`[WARNING] The command at ${commandPath} is missing a required "data" or "execute" property.`);
                }
            }
        }
    }

    loadEvents() {
        const eventsPath = path.join(__dirname, 'events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        
        for (const file of eventFiles) {
            const eventPath = path.join(eventsPath, file);
            const event = require(eventPath);
            if (event.once) {
                this.client.once(event.name, (...args) => event.execute(...args));
            } else {
                this.client.on(event.name, (...args) => event.execute(...args));
            }
        }
    }

    start() {
        if (this.state === 'running') {
            console.log('Bot já está em execução');
            return;
        }
        this.client.login(this.token);
        this.state = 'running';
        console.log('Bot iniciado');
    }

    stop() {
        if (this.state === 'stopped') {
            console.log('Bot já está parado');
            return;
        }
        this.client.destroy();
        this.state = 'stopped';
        console.log('Bot parado');
    }

    restart() {
        if (this.state === 'stopped') {
            console.log('Bot não está em execução');
            return;
        }
        this.stop();
        this.start();
        console.log('Bot reiniciado');
    }

    getStatus() {
        return {
            status: this.state,
            botStatus: this.client.isReady() ? 'online' : 'offline'
        };
    }
}

module.exports = Bot;