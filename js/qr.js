/* =============================================================================
   qr.js — o QR Code que leva o cliente até o cardápio
   -----------------------------------------------------------------------------
   Desenhar um QR Code do zero é bem complicado (correção de erro Reed-Solomon,
   máscaras, versões...). Então usamos a biblioteca QRious, que faz isso em uma
   linha. Ela é carregada da internet só quando alguém abre o QR pela primeira
   vez — se um endereço falhar, tentamos o próximo da lista.
   ========================================================================== */

const QR = {
  _carregando: null,

  FONTES: [
    "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js",
    "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"
  ],

  // Carrega a biblioteca uma única vez (mesmo se chamarem várias vezes).
  carregarBiblioteca() {
    if (window.QRious) return Promise.resolve();
    if (this._carregando) return this._carregando;

    this._carregando = new Promise((ok, erro) => {
      let i = 0;
      const tentar = () => {
        if (i >= this.FONTES.length) return erro(new Error("Sem internet para carregar o gerador de QR."));
        const s = document.createElement("script");
        s.src = this.FONTES[i++];
        s.onload = () => ok();
        s.onerror = tentar;         // deu errado? tenta a próxima fonte
        document.head.appendChild(s);
      };
      tentar();
    });
    return this._carregando;
  },

  // Descobre qual endereço o QR deve apontar.
  urlDoSite() {
    if (CONFIG.urlDoSite) return CONFIG.urlDoSite;
    // Sem configuração: usa o endereço atual, sem a parte depois do "?" nem o
    // nome do arquivo (para o QR sempre abrir a página inicial do cardápio).
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  },

  /* Desenha o QR dentro de um <canvas>.
     nivel: "L" (menor) a "H" (mais resistente a sujeira/borrão).
     "M" é o equilíbrio recomendado para impressão em mesa. */
  async desenhar(canvas, texto, tamanho = 512, nivel = "M") {
    await this.carregarBiblioteca();
    new QRious({
      element: canvas,
      value: texto,
      size: tamanho,
      level: nivel,
      background: "#ffffff",
      foreground: "#000000",   // preto puro: melhor leitura pela câmera
      padding: Math.round(tamanho * 0.06)
    });
    return canvas;
  },

  // Baixa o QR como imagem PNG (para colar na mesa, no cardápio impresso, etc).
  baixarPNG(canvas, nomeArquivo = "qrcode-cardapio.png") {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }
};
