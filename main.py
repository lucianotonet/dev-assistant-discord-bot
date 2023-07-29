import os
import discord
from discord.ext import commands
import asyncio
from keep_alive import keep_alive

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='/', intents=intents)
bot_1 = commands.Bot(command_prefix='/', intents=intents)
bot_2 = commands.Bot(command_prefix='/', intents=intents)

@bot.event
async def on_ready():
    print(f'We have logged in as {bot.user}')

@bot_1.event
async def on_ready():
    print(f'We have logged in as {bot_1.user}')

@bot_2.event
async def on_ready():
    print(f'We have logged in as {bot_2.user}')

@bot.command()
async def ping(ctx):
    await ctx.send('Pong!')

@bot_1.command()
async def ping(ctx):
    await ctx.send('Pong!')

@bot_2.command()
async def ping(ctx):
    await ctx.send('Pong!')

async def main():
    await asyncio.gather(
        bot.start(os.getenv('DISCORD_BOT_TOKEN')),
        bot_1.start(os.getenv('DISCORD_BOT1_TOKEN')),
        bot_2.start(os.getenv('DISCORD_BOT2_TOKEN'))
    )

keep_alive()
asyncio.run(main())
