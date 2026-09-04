/* =============================================================================
   modelo3d.js — transforma UMA FOTO + AS MEDIDAS REAIS em um modelo 3D
   -----------------------------------------------------------------------------
   A IDEIA CENTRAL DO PROJETO (leia isto com calma, é o pulo do gato):

   Modelar cada prato em 3D dá um trabalho enorme. Mas para o cliente "ver o
   tamanho real na mesa" a gente não precisa de um prato modelado — basta um
   RETÂNGULO PLANO com a foto colada nele, do tamanho exato do prato de verdade.
   Em RA, um plano com foto recortada (PNG com fundo transparente) parece um
   adesivo flutuando sobre a mesa e transmite muito bem a NOÇÃO DE TAMANHO,
   que é exatamente o que o cliente quer saber antes de pedir.

   Então, para cada prato, a gente monta na hora um arquivo 3D contendo:
       • 4 vértices (os cantos do retângulo)
       • 2 triângulos (todo mundo em 3D é feito de triângulos)
       • as coordenadas de textura (que canto da foto vai em que canto)
       • a própria foto embutida como textura

   UNIDADE DE MEDIDA: em glTF/USD, 1 unidade = 1 METRO. É por isso que o
   "tamanho real" funciona: se o prato tem 35 cm, o retângulo tem 0,35 unidade,
   e o celular desenha isso do tamanho de 35 cm reais no chão da sua casa.

   DOIS FORMATOS, PORQUE OS CELULARES SÃO DIFERENTES:
       • .GLB  -> Android (Google Scene Viewer / WebXR) e navegadores no PC
       • .USDZ -> iPhone e iPad (Apple Quick Look)
   ========================================================================== */

/* ---------------------------------------------------------------------------
   PARTE 1 — utilidades para lidar com bytes
   ------------------------------------------------------------------------ */

// Lê uma imagem (caminho "fotos/x.png" OU data:image/...;base64,...) e devolve
// os bytes crus + o tipo (image/png ou image/jpeg).
async function lerBytesDaImagem(origem) {
  const resposta = await fetch(origem);
  if (!resposta.ok) throw new Error("Não consegui ler a imagem: " + origem);
  const buffer = await resposta.arrayBuffer();
  let mime = (resposta.headers.get("content-type") || "").split(";")[0];
  if (!mime) mime = origem.match(/\.jpe?g($|\?)/i) ? "image/jpeg" : "image/png";
  return { bytes: new Uint8Array(buffer), mime };
}

// Descobre largura x altura em pixels de uma imagem (para manter a proporção).
function medirImagem(origem) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => erro(new Error("Não consegui abrir a imagem: " + origem));
    img.src = origem;
  });
}

function alinhar4(n) { return (n + 3) & ~3; }   // arredonda para cima até múltiplo de 4

/* ---------------------------------------------------------------------------
   PARTE 2 — os 4 cantos do retângulo, conforme a orientação escolhida

   "mesa"  = o retângulo fica DEITADO (como um prato em cima da mesa).
             Use para fotos tiradas de cima (pizza, prato de comida).
   "empe"  = o retângulo fica EM PÉ (como uma plaquinha/adesivo vertical).
             Use para fotos tiradas de lado (hambúrguer, copo, garrafa).

   Eixos: X = para a direita, Y = para cima, Z = na direção do observador.
   O modelo sempre nasce apoiado em Y = 0, para "sentar" no chão/mesa em RA.
   ------------------------------------------------------------------------ */
function cantosDoPlano(larguraM, alturaM, orientacao) {
  const x = larguraM / 2;
  if (orientacao === "empe") {
    const h = alturaM;
    return {
      // ordem: canto superior-esq, superior-dir, inferior-esq, inferior-dir
      posicoes: [-x, h, 0, x, h, 0, -x, 0, 0, x, 0, 0],
      normais:  [0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1],
      min: [-x, 0, 0], max: [x, h, 0]
    };
  }
  const z = alturaM / 2;   // "altura" da foto vira PROFUNDIDADE na mesa
  return {
    posicoes: [-x, 0, -z, x, 0, -z, -x, 0, z, x, 0, z],
    normais:  [0, 1, 0,   0, 1, 0,  0, 1, 0,  0, 1, 0],
    min: [-x, 0, -z], max: [x, 0, z]
  };
}

// Coordenadas de textura no padrão glTF (origem no canto SUPERIOR esquerdo).
const UV_GLTF = [0, 0, 1, 0, 0, 1, 1, 1];
// Os dois triângulos que formam o retângulo (sentido anti-horário = frente).
const TRIANGULOS = [0, 2, 1, 1, 2, 3];

/* ---------------------------------------------------------------------------
   PARTE 3 — gerar o .GLB (Android / WebXR / navegador)

   Um .glb é: [cabeçalho de 12 bytes][pedaço JSON][pedaço BINÁRIO]
   O JSON descreve a cena ("existe uma malha com 4 vértices, o material dela usa
   a textura tal"); o binário guarda os números dos vértices e a foto inteira.
   ------------------------------------------------------------------------ */
function montarGLB({ bytesImagem, mime, larguraM, alturaM, orientacao }) {
  const g = cantosDoPlano(larguraM, alturaM, orientacao);

  // --- monta o pedaço binário: posições | normais | uv | índices | imagem
  const bytesPos = 4 * g.posicoes.length;      // 12 floats = 48 bytes
  const bytesNor = 4 * g.normais.length;       // 48 bytes
  const bytesUV  = 4 * UV_GLTF.length;         // 32 bytes
  const bytesIdx = 2 * TRIANGULOS.length;      // 12 bytes
  const offPos = 0;
  const offNor = offPos + bytesPos;
  const offUV  = offNor + bytesNor;
  const offIdx = offUV + bytesUV;
  const offImg = alinhar4(offIdx + bytesIdx);
  const tamanhoBin = alinhar4(offImg + bytesImagem.length);

  const bin = new Uint8Array(tamanhoBin);
  const vista = new DataView(bin.buffer);
  g.posicoes.forEach((n, i) => vista.setFloat32(offPos + i * 4, n, true));
  g.normais.forEach((n, i) => vista.setFloat32(offNor + i * 4, n, true));
  UV_GLTF.forEach((n, i) => vista.setFloat32(offUV + i * 4, n, true));
  TRIANGULOS.forEach((n, i) => vista.setUint16(offIdx + i * 2, n, true));
  bin.set(bytesImagem, offImg);

  // --- monta o JSON que descreve a cena
  const json = {
    asset: { version: "2.0", generator: "Cardapio RA - modelo3d.js" },
    // KHR_materials_unlit = "não calcule iluminação, mostre a foto como ela é".
    // Sem isso a foto ficaria escurecida pela luz virtual da cena.
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Prato" }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0
      }]
    }],
    materials: [{
      name: "FotoDoPrato",
      doubleSided: true,                                  // visível pelos dois lados
      alphaMode: mime === "image/png" ? "BLEND" : "OPAQUE", // PNG pode ter fundo transparente
      extensions: { KHR_materials_unlit: {} },
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1
      }
    }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 4, mimeType: mime }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: g.min, max: g.max },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offPos, byteLength: bytesPos, target: 34962 },
      { buffer: 0, byteOffset: offNor, byteLength: bytesNor, target: 34962 },
      { buffer: 0, byteOffset: offUV,  byteLength: bytesUV,  target: 34962 },
      { buffer: 0, byteOffset: offIdx, byteLength: bytesIdx, target: 34963 },
      { buffer: 0, byteOffset: offImg, byteLength: bytesImagem.length }
    ],
    buffers: [{ byteLength: tamanhoBin }]
  };

  // --- empacota tudo no formato GLB
  const codificador = new TextEncoder();
  let bytesJson = codificador.encode(JSON.stringify(json));
  const sobraJson = alinhar4(bytesJson.length) - bytesJson.length;
  if (sobraJson) {                                 // o padrão manda completar com ESPAÇOS
    const maior = new Uint8Array(bytesJson.length + sobraJson).fill(0x20);
    maior.set(bytesJson); bytesJson = maior;
  }

  const total = 12 + 8 + bytesJson.length + 8 + bin.length;
  const glb = new Uint8Array(total);
  const v = new DataView(glb.buffer);
  v.setUint32(0, 0x46546c67, true);   // "glTF"
  v.setUint32(4, 2, true);            // versão 2
  v.setUint32(8, total, true);        // tamanho total do arquivo
  v.setUint32(12, bytesJson.length, true);
  v.setUint32(16, 0x4e4f534a, true);  // "JSON"
  glb.set(bytesJson, 20);
  const p = 20 + bytesJson.length;
  v.setUint32(p, bin.length, true);
  v.setUint32(p + 4, 0x004e4942, true); // "BIN"
  glb.set(bin, p + 8);
  return glb;
}

/* ---------------------------------------------------------------------------
   PARTE 4 — gerar o .USDZ (iPhone / iPad)

   USDZ = um .zip SEM COMPRESSÃO, alinhado de 64 em 64 bytes, contendo:
       modelo.usda  (um arquivo de TEXTO descrevendo a cena)
       textura.png  (a foto)
   Atenção a uma diferença sutil: no USD a coordenada de textura tem origem no
   canto INFERIOR esquerdo (no glTF é no superior). Por isso o "st" abaixo está
   com o V invertido em relação ao UV_GLTF.
   ------------------------------------------------------------------------ */
function montarUSDZ({ bytesImagem, mime, larguraM, alturaM, orientacao }) {
  const g = cantosDoPlano(larguraM, alturaM, orientacao);
  const nomeTextura = mime === "image/jpeg" ? "textura.jpg" : "textura.png";
  const n = (x) => Number(x.toFixed(6));
  const pts = [];
  for (let i = 0; i < 12; i += 3) pts.push(`(${n(g.posicoes[i])}, ${n(g.posicoes[i + 1])}, ${n(g.posicoes[i + 2])})`);
  const nor = [];
  for (let i = 0; i < 12; i += 3) nor.push(`(${g.normais[i]}, ${g.normais[i + 1]}, ${g.normais[i + 2]})`);
  const st = "[(0, 1), (1, 1), (0, 0), (1, 0)]";   // V invertido (padrão USD)

  const usda = `#usda 1.0
(
    defaultPrim = "Prato"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Prato" (
    assetInfo = {
        string name = "Prato"
    }
    kind = "component"
)
{
    def Mesh "Malha"
    {
        uniform bool doubleSided = 1
        float3[] extent = [(${n(g.min[0])}, ${n(g.min[1])}, ${n(g.min[2])}), (${n(g.max[0])}, ${n(g.max[1])}, ${n(g.max[2])})]
        int[] faceVertexCounts = [3, 3]
        int[] faceVertexIndices = [${TRIANGULOS.join(", ")}]
        rel material:binding = </Prato/Materiais/Foto>
        normal3f[] normals = [${nor.join(", ")}] (
            interpolation = "vertex"
        )
        point3f[] points = [${pts.join(", ")}]
        texCoord2f[] primvars:st = ${st} (
            interpolation = "vertex"
        )
        uniform token subdivisionScheme = "none"
    }

    def Scope "Materiais"
    {
        def Material "Foto"
        {
            token outputs:surface.connect = </Prato/Materiais/Foto/Superficie.outputs:surface>

            def Shader "Superficie"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = </Prato/Materiais/Foto/Textura.outputs:rgb>
                float inputs:opacity.connect = </Prato/Materiais/Foto/Textura.outputs:a>
                float inputs:metallic = 0
                float inputs:roughness = 1
                int inputs:useSpecularWorkflow = 0
                token outputs:surface
            }

            def Shader "Textura"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${nomeTextura}@
                float2 inputs:st.connect = </Prato/Materiais/Foto/LeitorUV.outputs:result>
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb
                float outputs:a
            }

            def Shader "LeitorUV"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname = "st"
                float2 outputs:result
            }
        }
    }
}
`;

  return criarZip([
    { nome: "modelo.usda", dados: new TextEncoder().encode(usda) },
    { nome: nomeTextura, dados: bytesImagem }
  ], { alinhar: 64 });   // <- o 64 é o que transforma um zip comum em usdz válido
}

/* ---------------------------------------------------------------------------
   PARTE 5 — a função que o resto do site chama

   gerarModelos(item) devolve { glb, usdz, larguraCm, alturaCm } com os bytes
   prontos. Se o item não informou a altura, ela é calculada pela PROPORÇÃO da
   foto — assim a imagem nunca fica esticada.
   ------------------------------------------------------------------------ */
async function gerarModelos(item) {
  const origem = item.foto;
  const { bytes, mime } = await lerBytesDaImagem(origem);

  let larguraCm = Number(item.largura_cm) || 20;
  let alturaCm = Number(item.altura_cm) || 0;
  if (!alturaCm) {
    const dim = await medirImagem(origem);
    alturaCm = larguraCm * (dim.altura / dim.largura);
  }

  const orientacao = item.orientacao === "empe" ? "empe" : "mesa";
  const comum = {
    bytesImagem: bytes, mime,
    larguraM: larguraCm / 100,      // centímetros -> METROS
    alturaM: alturaCm / 100,
    orientacao
  };
  return {
    glb: montarGLB(comum),
    usdz: montarUSDZ(comum),
    larguraCm: Math.round(larguraCm),
    alturaCm: Math.round(alturaCm),
    orientacao
  };
}

// Transforma bytes num endereço temporário (blob:) que o <model-viewer> consegue abrir.
function bytesParaURL(bytes, tipo) {
  return URL.createObjectURL(new Blob([bytes], { type: tipo }));
}
