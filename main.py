import os
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

intents = discord.Intents.default()
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'We have logged in as {bot.user}')

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    if isinstance(message.channel, discord.DMChannel) or bot.user.mentioned_in(message):
        await message.channel.send(f'Olá {message.author.mention}, sou o Dev Assistant Discord Bot. Estou em desenvolvimento e em breve terei funcionalidades incríveis!')

    await bot.process_commands(message)

@bot.command(name='help_dev', help='Provides information about the bot')
async def help(ctx):
    help_embed = discord.Embed(title='Dev Assistant Discord Bot', description='Estou aqui para ajudar você com suas tarefas de desenvolvimento. Aqui estão alguns comandos que você pode usar:', color=0x5865F2)
    help_embed.add_field(name='!help_dev', value='Mostra esta mensagem', inline=False)
    await ctx.send(embed=help_embed)

@bot.command(name='ping', help='Responds with pong')
async def ping(ctx):
    await ctx.send('pong')

bot.run(os.getenv('DISCORD_BOT_TOKEN'))