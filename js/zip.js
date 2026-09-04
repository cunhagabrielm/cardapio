/* =============================================================================
   zip.js — um escritor de arquivos .ZIP em JavaScript puro (sem biblioteca)
   -----------------------------------------------------------------------------
   POR QUE ISSO EXISTE AQUI?
   Dois recursos do projeto precisam gerar um .zip dentro do navegador:

     1) O formato .USDZ (o 3D que o iPhone abre em Realidade Aumentada) NADA MAIS
        É do que um .zip SEM COMPRESSÃO, com os arquivos alinhados de 64 em 64
        bytes. Ou seja: se eu sei escrever um zip, eu sei escrever um usdz.
     2) O botão "Exportar pacote" da área do dono, que baixa um .zip com o
        cardapio.json + a pasta fotos/ + a pasta modelos/ prontos para publicar.

   COMO UM ZIP É FEITO (visão geral, na ordem em que os bytes aparecem):
     [Local File Header + nome + dados]  <- um bloco por arquivo
     [Local File Header + nome + dados]
     ...
     [Central Directory]                 <- um "índice" repetindo os dados
     [End Of Central Directory (EOCD)]   <- diz onde o índice começa
   Todos os números são gravados em little-endian (byte menos significativo
   primeiro), que é o que o DataView faz quando passamos `true` no último
   parâmetro.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   CRC-32: uma "impressão digital" numérica dos bytes do arquivo. O formato ZIP
   exige esse número para conseguir detectar corrupção. A tabela pré-calculada
   é só uma forma rápida de fazer a conta.
   ------------------------------------------------------------------------ */
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------------------------------------------------------------------
   criarZip(arquivos, opcoes)
     arquivos -> [{ nome: "pasta/arquivo.png", dados: Uint8Array }, ...]
     opcoes.alinhar -> 0 (zip normal) ou 64 (obrigatório para .usdz)

   Retorna um Uint8Array com o zip inteiro pronto para virar Blob/download.
   Usamos "método 0" (STORE = sem compressão) porque é o exigido pelo usdz e
   porque mantém o código simples — fotos JPEG/PNG já vêm comprimidas mesmo.
   ------------------------------------------------------------------------ */
function criarZip(arquivos, opcoes = {}) {
  const alinhar = opcoes.alinhar || 0;
  const codificador = new TextEncoder();
  const pedacos = [];        // pedaços de bytes que vão ser colados no final
  const central = [];        // entradas do índice (central directory)
  let posicao = 0;           // deslocamento atual, em bytes, dentro do zip

  const empurrar = (bytes) => { pedacos.push(bytes); posicao += bytes.length; };

  for (const arquivo of arquivos) {
    const nomeBytes = codificador.encode(arquivo.nome);
    const dados = arquivo.dados;
    const crc = crc32(dados);
    const inicioDoHeader = posicao;

    /* Alinhamento: o usdz exige que os DADOS de cada arquivo comecem num
       múltiplo de 64. O truque padrão é inflar o "campo extra" do cabeçalho
       até que a conta feche. */
    let extra = 0;
    if (alinhar) {
      const inicioDosDados = inicioDoHeader + 30 + nomeBytes.length;
      let falta = (alinhar - (inicioDosDados % alinhar)) % alinhar;
      // o campo extra, quando existe, precisa de pelo menos 4 bytes de cabeçalho
      while (falta > 0 && falta < 4) falta += alinhar;
      extra = falta;
    }

    // ---- Local File Header (30 bytes fixos + nome + extra)
    const header = new Uint8Array(30 + nomeBytes.length + extra);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);   // assinatura "PK\3\4"
    v.setUint16(4, 20, true);           // versão mínima para extrair (2.0)
    v.setUint16(6, 0, true);            // flags
    v.setUint16(8, 0, true);            // método 0 = sem compressão (STORE)
    v.setUint16(10, 0, true);           // hora
    v.setUint16(12, 0, true);           // data
    v.setUint32(14, crc, true);
    v.setUint32(18, dados.length, true); // tamanho comprimido
    v.setUint32(22, dados.length, true); // tamanho original
    v.setUint16(26, nomeBytes.length, true);
    v.setUint16(28, extra, true);
    header.set(nomeBytes, 30);
    if (extra >= 4) {                    // campo extra "de enchimento"
      const ve = new DataView(header.buffer, 30 + nomeBytes.length);
      ve.setUint16(0, 0x0000, true);     // id do campo
      ve.setUint16(2, extra - 4, true);  // tamanho do conteúdo
    }
    empurrar(header);
    empurrar(dados);

    central.push({ nomeBytes, crc, tamanho: dados.length, offset: inicioDoHeader });
  }

  // ---- Central Directory: repete as informações e aponta onde cada um está
  const inicioCentral = posicao;
  for (const e of central) {
    const reg = new Uint8Array(46 + e.nomeBytes.length);
    const v = new DataView(reg.buffer);
    v.setUint32(0, 0x02014b50, true);   // assinatura "PK\1\2"
    v.setUint16(4, 20, true);           // versão que criou
    v.setUint16(6, 20, true);           // versão necessária
    v.setUint16(8, 0, true);
    v.setUint16(10, 0, true);           // STORE
    v.setUint16(12, 0, true);
    v.setUint16(14, 0, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.tamanho, true);
    v.setUint32(24, e.tamanho, true);
    v.setUint16(28, e.nomeBytes.length, true);
    v.setUint16(30, 0, true);           // extra
    v.setUint16(32, 0, true);           // comentário
    v.setUint16(34, 0, true);           // disco
    v.setUint16(36, 0, true);           // atributos internos
    v.setUint32(38, 0, true);           // atributos externos
    v.setUint32(42, e.offset, true);    // onde está o Local File Header
    reg.set(e.nomeBytes, 46);
    empurrar(reg);
  }

  // ---- EOCD: o "fim do índice", 22 bytes
  const fim = new Uint8Array(22);
  const vf = new DataView(fim.buffer);
  vf.setUint32(0, 0x06054b50, true);    // assinatura "PK\5\6"
  vf.setUint16(8, central.length, true);
  vf.setUint16(10, central.length, true);
  vf.setUint32(12, posicao - inicioCentral, true); // tamanho do índice
  vf.setUint32(16, inicioCentral, true);           // onde o índice começa
  empurrar(fim);

  // ---- cola tudo num único Uint8Array
  const total = pedacos.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let p = 0;
  for (const pedaco of pedacos) { saida.set(pedaco, p); p += pedaco.length; }
  return saida;
}
