const { Events, EmbedBuilder, Collection } = require('discord.js');
const { Groq, APIError } = require('groq-sdk');
const { APP_URL, GROQ_API_KEY, NODE_ENV } = process.env;
const { v4: uuidv4 } = require('uuid');
const colors = require('colors');

// Inicialização do cliente Groq
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Constantes
const DEBUG = true;
const TOKEN_LIMIT = 8192;
const LLM_MODELS = ['gemma2-9b-it', 'llama3-8b-8192', 'llama3-70b-8192', 'gemma-7b-it'];
const LLM_MODELS_TOOLS = ['llama3-70b-8192', 'mixtral-8x7b-32768', 'llama3-8b-8192'];
const LLM_TEMPERATURE = 0.9;

// Camada de raciocínio -> https://www.promptingguide.ai/techniques
const LLM_REASONING = null; // 'ToT'; // Zero-Shot, Few-Shot, ToT, CoT, Self-Consistency, CoR, APE, Active-Prompt, ... 

// Tempo de espera em milissegundos para novas tentativas após erro 429 (Rate Limit)
const RATE_LIMIT_RETRY_DELAY = 1000;
// Número máximo de tentativas de resposta em caso de erro 400 (Bad Request)
const MAX_RETRY_COUNT = 3;

// Definição das ferramentas disponíveis para o assistente
const tools = [
    {
        type: "function",
        function: {
            name: "calendar_tool",
            description: "Obtém a data e hora atuais em diferentes formatos e localidades.",
            parameters: {
                type: "object",
                properties: {
                    format: {
                        type: "string",
                        description: "O formato da hora a ser retornado. Pode ser '24h' para formato de 24 horas ou '12h' para formato de 12 horas. Padrão é '24h'."
                    },
                    locale: {
                        type: "string",
                        description: "A localidade para formatação da data/hora. Exemplo: 'pt-BR' para português do Brasil. Padrão é 'pt-BR'."
                    },
                    includeDate: {
                        type: "boolean",
                        description: "Se deve incluir a data na resposta. Padrão é 'false'."
                    }
                },
                required: []
            }
        },
        function_call: (parameters = {}) => {
            const { format = '24h', locale = 'pt-BR', includeDate = false } = parameters;
            const options = {
                hour12: format === '12h',
                year: includeDate ? 'numeric' : undefined,
                month: includeDate ? '2-digit' : undefined,
                day: includeDate ? '2-digit' : undefined,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            return new Date().toLocaleString(locale, options);
        }
    },
    {
        type: "function",
        function: {
            name: "weather_tool",
            description: "Obtém o clima atual em uma localização específica.",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "A localização para obter o clima."
                    }
                },
                required: ["location"]
            }
        },
        function_call: (parameters = {}) => {
            const location = parameters.location || 'New York';
            return `30°C, ensolarado em ${location}`;
        }
    },
    {
        type: "function",
        function: {
            name: "dev_assistant_api_get",
            description: "Faz uma requisição GET para a API do DevAssistant.",
            parameters: {
                type: "object",
                properties: {
                    endpoint: {
                        type: "string",
                        description: "O endpoint da API a ser acessado."
                    }
                },
                required: ["endpoint"]
            }
        },
        function_call: async (parameters = {}) => {
            const endpoint = parameters.endpoint;
            const url = `https://devassistant.tonet.dev/api${endpoint}`;

            try {
                const response = await fetch(url);
                const data = await response.json();
                return JSON.stringify(data); // Retorna a resposta como string
            } catch (error) {
                console.error("Erro na requisição à API:", error);
                return "Ocorreu um erro ao processar sua solicitação.";
            }
        }
    }
];

// Função para contar tokens baseado no modelo Tiktoken
const countTokens = (text) => {
    const encoding = new TextEncoder();
    const words = text.split(/\s+/);
    let tokenCount = 0;

    for (const word of words) {
        const encodedWord = encoding.encode(word);
        tokenCount += Math.ceil(encodedWord.length / 4);
    }

    return tokenCount;
};

// Função para aplicar a técnica de raciocínio
const applyReasoningTechniqueLayer = async (messageList) => {
    switch (LLM_REASONING) {
        case 'Zero-Shot':
            // Implementação para Zero-Shot Prompting
            return messageList; // Zero-Shot: Sem exemplos, apenas direto ao ponto
        case 'Few-Shot':
            // Implementação para Few-Shot Prompting
            // messages.unshift({
            //     role: 'system',
            //     content: "Exemplo 1: Entrada e saída. Exemplo 2: Entrada e saída."
            // });
            return messageList; // Few-Shot: Adiciona exemplos
        case 'ToT':
            // Implementação para Tree of Thought Prompting (ToT)
            // -> https://www.promptingguide.ai/pt/techniques/tot
            // -> https://github.com/dave1010/tree-of-thought-prompting
            messageList.push({
                role: 'system',
                content: `Imagine que três especialistas diferentes estão respondendo a esta pergunta.
                            Todos os especialistas escreverão 1 etapa do seu pensamento e compartilharão com o grupo.
                            Então, todos os especialistas passarão para a próxima etapa, etc.
                            Se algum especialista perceber que está errado em algum ponto, ele sairá.`
            });

            const response = await groq.chat.completions.create({
                messages: messageList,
                model: LLM_MODELS[0],
                max_tokens: TOKEN_LIMIT,
                temperature: LLM_TEMPERATURE,
            });

            const reply = response.choices[0].message.content;

            // remove a mensagem de sistema
            messageList.pop();

            // adiciona a resposta gerada            
            messageList.push({
                role: 'system',
                content: reply
            });

            return messageList; // Tree of Thought: Adiciona raciocínio em árvore (neste caso em apenas um tiro)
        case 'CoT':
            // Implementação para Chain of Thought Prompting (CoT)
            messageList.push({
                role: 'system',
                content: "Pense passo a passo para resolver o problema."
            });
            return messageList; // Chain of Thought: Adiciona raciocínio passo a passo
        case 'Self-Consistency':
            // Implementação para Self-Consistency
            // Gerar múltiplas respostas e escolher a mais comum seria uma lógica implementada em nível de geração de respostas, fora deste escopo
            return messageList;
        case 'CoR':
            // Implementação para Chain of Reasoning Prompting (CoR)
            messageList.push({
                role: 'system',
                content: "Raciocine logicamente com base nas premissas fornecidas."
            });
            return messageList; // Chain of Reasoning: Adiciona lógica de raciocínio
        case 'APE':
            // Implementação para Automatic Prompt Engineer (APE)
            // Ajustes automáticos seriam aplicados dinamicamente
            return messageList;
        case 'Active-Prompt':
            // Implementação para Active-Prompt
            // Utilização ativa das ferramentas seria aplicada durante a execução das funções
            return messageList;
        default:
            console.warn(`Modo de raciocínio desconhecido: ${LLM_REASONING}`);
            return messageList;
    }
};

// Função principal para gerar respostas
const generateResponse = async (message, bot) => {
    const messageHistory = await fetchMessageHistory(message);
    const truncatedHistory = truncateMessageHistory(messageHistory);
    const systemPrompt = `
        Esta é uma conversa de trabalho via Discord onde você é ${bot.username} <@!${bot.id}>, e sua responsabilidade é garantir a execução e entrega por parte dos humanos.
        INSTRUÇÕES: Compreenda a conversa e responda coerentemente. Use as ferramentas disponíveis quando apropriado. Não invente informações, responda apenas com dados reais.
        CONTEXTO: Esta conversa pode incluir múltiplos participantes. Se precisar, refira-se a eles pelo ID.
    `;

    const contextLength = countTokens(systemPrompt);
    const maxTokens = Math.max(TOKEN_LIMIT - contextLength, 100);

    let chatResponse;
    let modelIndex = 0;

    let messages = [
        { role: 'system', content: systemPrompt },
        ...truncatedHistory,
        { role: 'user', content: message.content, name: `${message.author.globalName || message.author.username} <@!${message.author.id}>` },
    ];

    // Tenta gerar uma resposta usando diferentes modelos em caso de falha
    while (modelIndex < LLM_MODELS_TOOLS.length) {
        await message.channel.sendTyping();
        try {

            // Aplicar a técnica de raciocínio
            messages = await applyReasoningTechniqueLayer(messages);

            console.log(colors.blue(`Tentando gerar resposta usando o modelo: ${LLM_MODELS_TOOLS[modelIndex]}`)); // Log do modelo sendo usado
            console.log(colors.white(`messages: ${JSON.stringify(messages, null, 2)}`)); // Log para debug

            chatResponse = await groq.chat.completions.create({
                messages: messages,
                model: LLM_MODELS_TOOLS[modelIndex],
                max_tokens: maxTokens,
                temperature: LLM_TEMPERATURE,
                tool_choice: "auto",
                tools: tools.map(tool => ({ ...tool }))
            });

            // Para o loop se a resposta for gerada com sucesso
            break;
        } catch (error) {
            if (error instanceof APIError) {
                if (error.status === 429) {
                    console.log(colors.yellow(`Erro 429: Limite de taxa excedido para o modelo ${LLM_MODELS_TOOLS[modelIndex]}. Tentando novamente após pausa.`));
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
                    modelIndex++;
                } else if (error.status === 400 && error.message.includes('tool_code')) {
                    console.log(colors.red(`Erro 400: Erro na chamada da ferramenta. Pulando para o próximo modelo. Detalhes: ${error.message}`));
                    modelIndex++;
                } else {
                    console.error(colors.red(`Erro na API Groq: ${error.message}`));
                    if (DEBUG) {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle(`Erro na API Groq`)
                            .setDescription(`Detalhes: ${error.message}`)
                            .setColor(0xFF0000);
                        await message.channel.send({ embeds: [errorEmbed] });
                    }
                    throw error;
                }
            } else {
                console.error(colors.red(`Erro inesperado: ${error.message}`));
                if (DEBUG) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`Erro inesperado`)
                        .setDescription(`Detalhes: ${error.message}`)
                        .setColor(0xFF0000);
                    await message.channel.send({ embeds: [errorEmbed] });
                }
                throw error;
            }
        }
    }

    // Lança um erro se nenhum modelo gerar uma resposta
    if (!chatResponse) {
        const errorMessage = 'Falha ao gerar resposta após várias tentativas.';
        console.error(colors.red(errorMessage));
        if (DEBUG) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`Erro`)
                .setDescription(`Detalhes: ${errorMessage}`)
                .setColor(0xFF0000);
            await message.channel.send({ embeds: [errorEmbed] });
        }
        throw new Error(errorMessage);
    }

    // Processa chamadas de ferramentas, se houver
    const toolCalls = chatResponse.choices[0].message.tool_calls;

    messages.push({
        ...chatResponse.choices[0].message
    });

    if (toolCalls) {
        for (const toolCall of toolCalls) {
            await message.channel.sendTyping();
            const tool = tools.find(t => t.function.name === toolCall.function.name);
            if (tool) {
                try {
                    const functionArgs = JSON.parse(toolCall.function.arguments);
                    const functionResponse = await tool.function_call(functionArgs);

                    messages.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: tool.function.name,
                        content: functionResponse
                    });
                } catch (error) {
                    console.error(colors.red(`Erro na chamada da ferramenta ${tool.function.name}: ${error.message}`));
                    messages.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: tool.function.name,
                        content: `Ocorreu um erro ao processar a solicitação. Por favor, tente novamente mais tarde.`
                    });
                    if (DEBUG) {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle(`Erro na ferramenta ${tool.function.name}`)
                            .setDescription(`Detalhes: ${error.message}`)
                            .setColor(0xFF0000);
                        await message.channel.send({ embeds: [errorEmbed] });
                    }
                }
            }
        }

        // Nova inferência para montar a resposta final ao usuário
        const finalPrompt = `
            Esta é uma conversa de trabalho via Discord onde você é ${bot.username} <@!${bot.id}>, e sua responsabilidade é garantir a execução e entrega por parte dos humanos.
            INSTRUÇÕES: Trate as respostas com cuidado. Certifique-se de compreender a conversa e responder de forma humana. Evite inventar informações, responda apenas com dados reais.
            CONTEXTO: Esta conversa pode incluir retorno ao chamado de suas ferramentas internas que podem conter as informações necessárias para a sua resposta final. Não precisa 
        `;

        messages.shift(); // Remove a mensagem de sistema inicial

        messages.unshift({ role: 'system', content: finalPrompt });

        // Aplicar a técnica de raciocínio
        messages = await applyReasoningTechniqueLayer(messages);

        console.log(colors.blue(`Tentando gerar resposta usando o modelo: ${LLM_MODELS[0]}`)); // Log do modelo sendo usado
        console.log(colors.white(`messages: ${JSON.stringify(messages, null, 2)}`)); // Log para debug

        await message.channel.sendTyping();
        const finalResponse = await groq.chat.completions.create({
            messages: messages,
            model: LLM_MODELS[0],
            max_tokens: maxTokens,
            temperature: LLM_TEMPERATURE,
        });

        return finalResponse.choices[0].message.content;
    } else {
        return chatResponse.choices[0].message.content;
    }
};

// Função para buscar o histórico de mensagens
const fetchMessageHistory = async (message) => {
    const messages = await message.channel.messages.fetch({ limit: 100, before: message.id });
    return messages.reverse().map(msg => ({
        role: msg.author.bot ? 'assistant' : 'user',
        name: `${msg.author.globalName || msg.author.username} <@!${msg.author.id}>`,
        content: msg.content,
    }));
};

// Função para truncar o histórico de mensagens para caber no limite de tokens
const truncateMessageHistory = (messageHistory) => {
    let totalTokens = messageHistory.reduce((acc, msg) => acc + countTokens(JSON.stringify(msg)), 0);
    while (totalTokens > TOKEN_LIMIT && messageHistory.length > 1) {
        messageHistory.shift();
        totalTokens = messageHistory.reduce((acc, msg) => acc + countTokens(JSON.stringify(msg)), 0);
    }
    return messageHistory;
};

// Função para lidar com erros de API
const handleAPIError = async (message, err) => {
    let retryCount = 0;

    while (retryCount < MAX_RETRY_COUNT) {
        try {
            await message.channel.sendTyping();

            const reply = await generateResponse(message, message.client.user);
            if (reply) {
                await sendChunkedMessage(message, reply);
                if (DEBUG) {
                    const debugEmbed = new EmbedBuilder()
                        .setDescription(`Modelo LLM: ${LLM_MODELS_TOOLS[0]}\nTemperatura: ${LLM_TEMPERATURE}\nModo de Raciocínio: ${LLM_REASONING}`)
                        .setColor(0x00FF00);
                    await message.channel.send({ embeds: [debugEmbed] });
                }
            }

            // Sai do loop se a resposta for enviada com sucesso
            return;
        } catch (retryErr) {
            if (retryErr instanceof APIError && retryErr.status === 400) {
                retryCount++;
                console.warn(colors.yellow(`Erro 400 na tentativa ${retryCount}. Tentando novamente...`));
                if (retryCount === MAX_RETRY_COUNT) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`Erro ${retryErr.status}`)
                        .setDescription(`Ocorreu um erro ao processar sua solicitação. Detalhes: ${retryErr.message}`)
                        .setColor(0xFFA500);
                    await message.channel.send({ embeds: [errorEmbed] });
                }
            } else {
                // Lança o erro para que seja tratado por outro bloco catch
                throw retryErr;
            }
        }
    }
};

// Função para enviar mensagens longas em partes
const sendChunkedMessage = async (message, content) => {
    const maxLength = 2000;

    const sendChunks = async (text) => {
        const paragraphs = text.split('\n\n');
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            if ((currentChunk + '\n\n' + paragraph).length > maxLength) {
                await message.channel.send(currentChunk.trim());
                currentChunk = paragraph;
            } else {
                currentChunk += '\n\n' + paragraph;
            }
        }

        if (currentChunk.trim().length > 0) {
            await message.channel.send(currentChunk.trim());
        }
    };

    if (content.length > maxLength) {
        await sendChunks(content);
    } else {
        await message.channel.send(content.trim());
    }
};

// Criação do cooldown
const cooldowns = new Collection();

// Exportação do módulo principal
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const bot = message.client.user;

        // Ignora mensagens do próprio bot ou de outros bots que não o mencionaram
        if (message.author.id === bot.id || (!message.mentions.has(bot) && message.author.bot)) return;

        // Implementação do cooldown
        if (!cooldowns.has(message.author.id)) {
            cooldowns.set(message.author.id, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(message.author.id);
        const cooldownAmount = 5 * 1000; // 5 segundos de cooldown

        if (timestamps.has(message.channel.id)) {
            const expirationTime = timestamps.get(message.channel.id) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                // return message.reply(`Aguarde ${timeLeft.toFixed(1)} segundos antes de usar este comando novamente.`);
                return
            }
        }

        timestamps.set(message.channel.id, now);
        setTimeout(() => timestamps.delete(message.channel.id), cooldownAmount);

        try {
            await message.channel.sendTyping();

            const reply = await generateResponse(message, bot);
            if (reply) {
                await sendChunkedMessage(message, reply);
                if (DEBUG) {
                    const debugEmbed = new EmbedBuilder()
                        .setDescription(`Modelo LLM: ${LLM_MODELS_TOOLS[0]}\nTemperatura: ${LLM_TEMPERATURE}\nModo de Raciocínio: ${LLM_REASONING}`)
                        .setColor(0x00FF00);
                    await message.channel.send({ embeds: [debugEmbed] });
                }
            }
        } catch (err) {
            if (err instanceof APIError && err.status === 400) {
                await handleAPIError(message, err);
            } else {
                if (DEBUG) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`Erro inesperado`)
                        .setDescription(`Detalhes: ${err.message}`)
                        .setColor(0xFF0000);
                    await message.channel.send({ embeds: [errorEmbed] });
                }
                throw err;
            }
        }
    }
}
