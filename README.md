# Editor de Vídeo MP4

Site simples para editar arquivos MP4 diretamente no navegador.

## Como usar

1. Instale dependências com `npm install` no diretório do projeto.
2. Inicie o servidor com `npm start`.
3. Abra `http://localhost:3000` em um navegador moderno.
4. Selecione um ou mais vídeos MPEG-4 usando o campo de upload.
5. Se você selecionar vários vídeos, escolha o arquivo ativo na lista para editar individualmente.
6. Ajuste os tempos de início e fim para o arquivo ativo e clique em "Recortar vídeo".
7. Clique em "Juntar vídeos" para mesclar todos os arquivos selecionados em um único filme.
8. Baixe o resultado.

### Instalação em VPS (Debian / Ubuntu)

Há um script de instalação incluído para configurar o servidor em uma VPS Debian/Ubuntu. Ele:

- instala pacotes do sistema (Node.js, ffmpeg, git, build-essential)
- clona o repositório e instala dependências Node
- cria um usuário de sistema `videoeditor`
- cria e habilita um serviço `systemd` (`video-editor.service`)

Exemplo de uso (execute na VPS):

```bash
# clone manualmente ou passe o repositório como primeiro argumento
chmod +x install_vps.sh
sudo ./install_vps.sh https://example.com/your-repo.git /opt/video-editor 18 3000
```

O script criará o serviço e iniciará a aplicação em segundo plano. Verifique status com:

```bash
sudo systemctl status video-editor
sudo journalctl -u video-editor -f
```

Você também pode usar o template de service em `video-editor.service` como referência.

## Observações

- O processamento usa `ffmpeg.wasm` no navegador.
- Pode levar alguns segundos dependendo do tamanho do arquivo.
- Funciona melhor em navegadores Chromium e Firefox modernos.
