const express = require('express');
const bodyParser = require('body-parser');
const BotManager = require('./botManager');
const { Client, GatewayIntentBits } = require('discord.js');

require('dotenv').config();

const { DISCORD_BOT_TOKEN } = process.env;

// Cria um aplicativo express
const app = express();
app.use(bodyParser.json());

// Inicializa o gerenciador de bots
const port = process.env.PORT || 7860;
const botManager = new BotManager();

// Status da API
app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'Dev Assistant Discord Bot is running' });
});

// Status do bot
app.get('/api/status', (req, res) => {
    const status = botManager.getBotStatus();
    res.json(status);
});

// Endpoint para iniciar o bot
app.post('/api/start', (req, res) => {
    const response = botManager.startBot();
    res.json({ message: response });
});

// Endpoint para parar o bot
app.post('/api/stop', (req, res) => {
    const response = botManager.stopBot();
    res.json({ message: response });
});

// Endpoint para enviar uma mensagem
app.post('/api/send-message', async (req, res) => {
    const { channelId, message } = req.body;
    try {
        const response = await botManager.sendMessage(channelId, message);
        res.json({ message: response });
    } catch (error) {
        res.status(500).json({ message: 'Failed to send message', error: error.message });
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Inicia o bot
botManager.startBot();