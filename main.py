import os
import discord
from discord.ext import commands

bot = commands.Bot(command_prefix='!')


@bot.event
async def on_ready():
    print(f'We have logged in as {bot.user}')


@bot.command()
async def ping(ctx):
    await ctx.send('Pong!')

# Use os.getenv to get environment variable
bot.run(os.getenv('DISCORD_BOT_TOKEN'))