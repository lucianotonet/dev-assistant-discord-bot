const { Events, EmbedBuilder } = require('discord.js');
const { Groq, APIError } = require('groq-sdk');
const { APP_URL, GROQ_API_KEY } = process.env;
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const groq = new Groq({ apiKey: GROQ_API_KEY });

const TOKEN_LIMIT = 8192;
const LLM_MODELS = ['gemma2-9b-it', 'llama3-8b-8192', 'llama3-70b-8192', 'gemma-7b-it'];
const LLM_TEMPERATURE = 0.5;

const sanitizeMessage = (content) => content.replace(/@\S+/g, '@user');

// Funções de Ferramentas
const tools = [
    {
        type: "function",
        function: {
            name: "calendar_tool",
            description: "Use this function to get the current time.",
            parameters: {
                type: "object",
                properties: {
                    format: {
                        type: "string",
                        description: "The format of the time to return."
                    },
                },
                required: ["format"]
            }
        },
        function_call: (parameters = {}) => {
            const format = parameters.format || 'h:i:s';
            return new Date().toLocaleString('pt-BR', { hour12: false });
        }
    },
    {
        type: "function",
        function: {
            name: "weather_tool",
            description: "Use this function to get the current weather in a specific location.",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The location for which to get the weather."
                    }
                },
                required: ["location"]
            }
        },
        function_call: (parameters = {}) => {
            const location = parameters.location || 'New York';
            return `30°C, sunny in ${location}`;
        }
    }
];

const countTokens = (text) => {
    // Função simples para contar tokens com base no número de palavras
    return text.split(/\s+/).length;
};

const generateResponse = async (message, bot, messageHistory) => {
    const systemPrompt = `
    Você é ${bot.username} <@!${bot.id}> e esta é uma conversa profissional via chat.
    INSTRUÇÕES: Você deve continuar a compreender a conversa e responder coerentemente. Use as ferramentas disponíveis quando apropriado.
    CONTEXTO: Esta conversa pode incluir múltiplos tópicos e participantes.
    HISTÓRICO DE MENSAGENS: ${JSON.stringify(messageHistory)}
    ÚLTIMA MENSAGEM: ${JSON.stringify({ role: 'user', content: sanitizeMessage(message.content), name: (message.author.globalName || message.author.username) })}
  `;

    const contextLength = countTokens(systemPrompt);
    const maxTokens = Math.max(TOKEN_LIMIT - contextLength, 100);

    let chatResponse;
    let modelIndex = 0;
    let success = false;

    while (!success && modelIndex < LLM_MODELS.length) {
        await message.channel.sendTyping();
        try {
            chatResponse = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: sanitizeMessage(message.content), name: `${message.author.globalName || message.author.username} <@!${message.author.id}>` },
                ],
                // model: LLM_MODELS[modelIndex],
                model: 'llama3-8b-8192', // <- IMPORTANTE! Mantenha este modelo fixo para garantir a chamada de funções
                max_tokens: maxTokens,
                temperature: LLM_TEMPERATURE,
                top_p: 1,
                tool_choice: "auto",
                tools: tools.map(tool => ({ ...tool }))
            });
            success = true;
        } catch (error) {
            if (error instanceof APIError && error.status === 429) {
                console.log(`Erro 429: Rate limit exceeded para o modelo ${LLM_MODELS[modelIndex]}. Tentando novamente após pausa.`);
                await pause(1000); // Pausa de 1 segundo antes de tentar novamente
                modelIndex++;
            } else {
                throw error;
            }
        }
    }

    if (!success) {
        throw new Error('Falha ao gerar resposta após várias tentativas.');
    }

    const toolCalls = chatResponse.choices[0].message.tool_calls;
    if (toolCalls) {
        for (const toolCall of toolCalls) {
            await message.channel.sendTyping();
            const tool = tools.find(t => t.function.name === toolCall.function.name);
            if (tool) {
                const functionArgs = JSON.parse(toolCall.function.arguments);
                const functionResponse = tool.function_call(functionArgs);

                messageHistory.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: tool.function.name,
                    content: functionResponse
                });
            }
        }

        // Nova inferência para montar a resposta final ao usuário
        const finalPrompt = `
            Você é ${bot.username} <@!${bot.id}> e esta é uma conversa profissional via chat.
            INSTRUÇÕES: Você deve continuar a compreender a conversa e responder coerentemente. Use as ferramentas disponíveis quando apropriado.
            CONTEXTO: Esta conversa pode incluir múltiplos tópicos e participantes.
            HISTÓRICO DE MENSAGENS: ${JSON.stringify(messageHistory)}
            ÚLTIMA MENSAGEM: ${JSON.stringify({ role: 'user', content: sanitizeMessage(message.content), name: (message.author.globalName || message.author.username) })}
        `;

        await message.channel.sendTyping();
        const finalResponse = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: finalPrompt },
                { role: 'user', content: sanitizeMessage(message.content), name: `${message.author.globalName || message.author.username} <@!${message.author.id}>` },
            ],
            model: LLM_MODELS[modelIndex],
            max_tokens: maxTokens,
            temperature: LLM_TEMPERATURE,
            top_p: 1
        });

        return finalResponse.choices[0].message.content;
    } else {
        return chatResponse.choices[0].message.content;
    }
};

const fetchMessageHistory = async (message) => {
    const messages = await message.channel.messages.fetch({ limit: 100, before: message.id });
    return messages.reverse().map(msg => ({
        role: msg.author.bot ? 'assistant' : 'user',
        name: `${msg.author.globalName || msg.author.username} <@!${msg.author.id}>`,
        content: sanitizeMessage(msg.content),
    }));
};

const truncateMessageHistory = (messageHistory) => {
    let totalTokens = messageHistory.reduce((acc, msg) => acc + countTokens(JSON.stringify(msg)), 0);
    while (totalTokens > TOKEN_LIMIT && messageHistory.length > 1) {
        messageHistory.shift();
        totalTokens = messageHistory.reduce((acc, msg) => acc + countTokens(JSON.stringify(msg)), 0);
    }
    return messageHistory;
};

const shouldRespondToMessage = async (message, bot) => {
    const shouldRespondPrompt = `
        Você é um assistente de conversa que decide se deve responder a uma mensagem do usuário.
        INSTRUÇÕES: Leia a mensagem do usuário e decida se é necessário responder. Considere o contexto da conversa e a relevância da mensagem.
        Responda em JSON com o seguinte formato: '{"shouldRespond": true/false, "reason": "Motivo da decisão"}'.
        CONTEXTO: Esta conversa pode incluir múltiplos tópicos e participantes.
        HISTÓRICO DE MENSAGENS: ${JSON.stringify(await fetchMessageHistory(message))}
        MENSAGEM DO USUÁRIO: ${JSON.stringify({ role: 'user', content: sanitizeMessage(message.content), name: `${message.author.globalName || message.author.username} <@!${message.author.id}>` })}
    `;

    const response = await groq.chat.completions.create({
        messages: [{ role: 'system', content: shouldRespondPrompt }],
        model: LLM_MODELS[0],
        max_tokens: TOKEN_LIMIT,
        temperature: LLM_TEMPERATURE,
        top_p: 1,
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
};

const handleAPIError = async (message, err) => {
    const maxRetries = 3;
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
        try {
            const messageHistory = await fetchMessageHistory(message);
            const truncatedHistory = truncateMessageHistory(messageHistory);

            const shouldRespondResponse = await shouldRespondToMessage(message, message.client.user);
            if (!shouldRespondResponse.shouldRespond) {
                console.log(`Decidi não responder à mensagem do usuário: ${shouldRespondResponse.reason}`);
                const ignoredEmbed = new EmbedBuilder()
                    .setTitle('Ignorado!')
                    .setDescription(`Decidi não responder à mensagem do usuário: ${shouldRespondResponse.reason}`)
                    .setColor(0xFFA500);

                await message.channel.send({ embeds: [ignoredEmbed] });
                return;
            }

            await message.channel.sendTyping();

            const reply = await generateResponse(message, message.client.user, truncatedHistory);
            if (reply.content) {
                await message.channel.send(reply.content);
            }

            success = true;
        } catch (retryErr) {
            if (retryErr instanceof APIError && retryErr.status === 400) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`Erro ${retryErr.status}`)
                        .setDescription(`${retryErr.message}`)
                        .setColor(0xFFA500);

                    await message.channel.send(retryErr.message);
                    await message.channel.send({ embeds: [errorEmbed] });
                }
            } else {
                throw retryErr;
            }
        }
    }
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const bot = message.client.user;
        if (message.author.id === bot.id || (!message.mentions.has(bot) && message.author.bot)) return;

        try {
            const messageHistory = await fetchMessageHistory(message);
            const truncatedHistory = truncateMessageHistory(messageHistory);

            const shouldRespondResponse = await shouldRespondToMessage(message, bot);
            if (!shouldRespondResponse.shouldRespond) {
                console.log(`Dev Assistant decidiu não responder à mensagem do usuário: ${shouldRespondResponse.reason}`);
                return;
            }

            await message.channel.sendTyping();

            const reply = await generateResponse(message, bot, truncatedHistory);
            if (reply) {
                const maxLength = 2000;
                const parts = reply.split('\n');

                for (const part of parts) {
                    if (part.length > maxLength) {
                        const subParts = part.match(new RegExp(`.{1,${maxLength}}`, 'g'));
                        for (const subPart of subParts) {
                            await message.channel.send(subPart);
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Adiciona um cooldown de 1 segundo entre os envios
                        }
                    } else {
                        await message.channel.send(part);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Adiciona um cooldown de 1 segundo entre os envios
                    }
                }
            }

        } catch (err) {
            if (err instanceof APIError && err.status === 400) {
                await handleAPIError(message, err);
            } else {
                throw err;
            }
        }
    }
};
