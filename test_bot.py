import os
import unittest
from dotenv import load_dotenv
from discord.ext import commands
import discord

load_dotenv()

intents = discord.Intents.default()

class TestBot(unittest.TestCase):
    def setUp(self):
        self.bot = commands.Bot(command_prefix='!', intents=intents)

    def test_ping_command(self):
        @self.bot.command()
        async def ping(ctx):
            await ctx.send('Pong!')
        self.assertIn('ping', self.bot.all_commands)

if __name__ == '__main__':
    unittest.main()