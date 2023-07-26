# Dev Assistant Discord Bot

Este é um bot do Discord desenvolvido para auxiliar desenvolvedores em suas tarefas diárias.

## Versões

Existem duas versões deste bot: a versão de desenvolvimento (dev) e a versão de produção (prod).

### Versão de Desenvolvimento

A versão de desenvolvimento é usada para testar novas funcionalidades e correções de bugs antes de serem implementadas na versão de produção. Para executar a versão de desenvolvimento, siga estas etapas:

1. Clone o repositório.
2. Navegue até o diretório do projeto.
3. Ative o ambiente virtual Python (`env\Scripts\activate`).
4. Execute o bot (`python main.py`).

### Versão de Produção

A versão de produção é a versão do bot que está ativamente em uso. Para executar a versão de produção, siga estas etapas:

1. Clone o repositório.
2. Navegue até o diretório do projeto.
3. Ative o ambiente virtual Python (`env\Scripts\activate`).
4. Execute o bot (`python main.py`).

## Testes

Este projeto usa o módulo unittest do Python para testes. Para executar os testes, siga estas etapas:

1. Navegue até o diretório do projeto.
2. Ative o ambiente virtual Python (`env\Scripts\activate`).
3. Execute os testes (`python -m unittest`).

## Deploy

O deploy deste bot é feito através do GitHub Actions. Quando um commit é feito na branch main, o GitHub Actions executa os testes e, se passarem, faz o deploy do bot no servidor.