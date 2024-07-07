const { DISCORD_BOT_TOKEN } = process.env;
const Bot = require('./bot');

class BotManager {
    constructor() {
        this.bot = new Bot(DISCORD_BOT_TOKEN);
        this.state = 'stopped'; // Estado inicial do bot
    }

    startBot() {
        if (this.state === 'running') {
            return 'Bot já está em execução';
        }

        this.bot.start();
        this.state = 'running';

        return 'Bot iniciado';
    }

    stopBot() {
        if (this.state === 'stopped') {
            return 'Bot já está parado';
        }

        this.bot.stop();
        this.state = 'stopped';
        return 'Bot parado';
    }

    restartBot() {
        if (this.state === 'stopped') {
            return 'Bot não está em execução';
        }

        this.bot.stop();
        this.bot.start();
        return 'Bot reiniciado';
    }

    getBotStatus() {
        return {
            status: this.state,
            botStatus: this.bot ? this.bot.getStatus() : 'Bot não iniciado'
        };
    }

    setBotState(newState) {
        switch (newState) {
            case 'running':
                return this.startBot();
            case 'stopped':
                return this.stopBot();
            case 'restarted':
                return this.restartBot();
            default:
                return `Estado inválido: ${newState}`;
        }
    }

    async sendMessage(channelId, message) {
        if (this.state !== 'running') {
            return 'Bot não está em execução';
        }

        try {
            const channel = await this.bot.client.channels.fetch(channelId);
            await channel.send(message);
            return 'Mensagem enviada';
        } catch (error) {
            return `Erro ao enviar mensagem: ${error.message}`;
        }
    }

    async fetchChannelMessages(channelId, limit = 10) {
        if (this.state !== 'running') {
            return 'Bot não está em execução';
        }

        try {
            const channel = await this.bot.client.channels.fetch(channelId);
            const messages = await channel.messages.fetch({ limit });
            return messages.map(msg => msg.content);
        } catch (error) {
            return `Erro ao buscar mensagens: ${error.message}`;
        }
    }
}

module.exports = BotManager;
