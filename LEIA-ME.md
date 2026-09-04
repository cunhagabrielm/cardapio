# Cardápio em 3D e Realidade Aumentada

Cardápio digital em que o cliente aponta a câmera do celular e vê o prato
**no tamanho real** em cima da própria mesa — a partir de uma **foto**, sem
precisar modelar nada em 3D. Tem QR Code para colar nas mesas e uma **área
restrita do dono** com módulo de cadastro.

---

## 1. Comece por aqui (3 minutos)

O site é feito só de arquivos (HTML, CSS e JavaScript). Não tem instalação,
não tem `npm install`, não tem servidor. Mas ele **precisa ser servido por um
servidor** — se você abrir o `index.html` com dois cliques, o navegador bloqueia
a leitura do `cardapio.json` por segurança (é a regra de CORS).

**Rodando na sua máquina:**

```bash
# entre na pasta do projeto
cd cardapio

# opção A — se você tem Python (já vem no Windows pela Microsoft Store)
python -m http.server 8000

# opção B — se você tem Node
npx serve .
```

Depois abra no navegador:

| Endereço | O que é |
|---|---|
| http://localhost:8000/ | o cardápio que o cliente vê |
| http://localhost:8000/admin.html | a área do dono (senha inicial: `admin123`) |

> **Dica de VS Code:** instale a extensão *Live Server*, clique com o botão
> direito no `index.html` e escolha *Open with Live Server*. Faz a mesma coisa.

---

## 2. Como o projeto está organizado

```
cardapio/
├── index.html          página do cliente
├── admin.html          área do dono (login + cadastro)
├── css/
│   └── estilo.css      todo o visual
├── js/
│   ├── config.js       ⭐ nome, cores, WhatsApp, senha — edite este primeiro
│   ├── dados.js        de onde vêm os pratos (arquivo publicado x rascunho)
│   ├── zip.js          escritor de .zip (usado pelo .usdz e pela exportação)
│   ├── modelo3d.js     ⭐ o coração: foto + cm  ->  modelo 3D .glb e .usdz
│   ├── qr.js           geração do QR Code
│   ├── visor.js        a janela de 3D/RA
│   ├── cardapio.js     monta a página do cliente
│   └── admin.js        login, cadastro, exportação
├── dados/
│   └── cardapio.json   ⭐ os pratos publicados
├── fotos/              as fotos dos pratos
└── modelos/            modelos 3D publicados (opcional, mas recomendado)
```

Os três arquivos marcados com ⭐ são os que você vai mexer no dia a dia.

---

## 3. A ideia central (o "pulo do gato")

Modelar cada prato em 3D custa caro e demora. Só que, para o cliente decidir se
pede ou não, ele não precisa de um prato modelado — ele precisa **entender o
tamanho**. Então o sistema faz o seguinte para cada prato:

1. pega a **foto**;
2. pega a **largura e a altura reais em centímetros** que você cadastrou;
3. monta na hora um retângulo 3D **exatamente com essas medidas**, com a foto
   colada nele.

Em Realidade Aumentada, o resultado parece um adesivo do prato flutuando sobre a
mesa — e o tamanho é o tamanho de verdade.

**Por que funciona:** nos formatos 3D usados (glTF e USD), **1 unidade = 1 metro**.
Uma pizza de 35 cm vira um retângulo de 0,35 unidade, e o celular desenha isso
com 35 cm reais no seu ambiente. O atributo `ar-scale="fixed"` no `<model-viewer>`
impede o cliente de redimensionar — é o que garante a fidelidade da medida.

**Por isso a foto ideal é PNG com fundo transparente** (foto recortada). Com
fundo branco, o cliente vê um retângulo branco flutuando; com fundo recortado,
vê o prato. Para recortar: [remove.bg](https://www.remove.bg), Canva, Photoshop
ou a ferramenta de recorte do próprio Windows/celular.

### Dois formatos, porque os celulares são diferentes

| Formato | Onde é usado | Quem gera |
|---|---|---|
| `.glb` | Android (Scene Viewer / WebXR) e navegadores no PC | `montarGLB()` em `js/modelo3d.js` |
| `.usdz` | iPhone e iPad (Apple Quick Look) | `montarUSDZ()` em `js/modelo3d.js` |

Curiosidade útil: um `.usdz` **é um `.zip` sem compressão** com os arquivos
alinhados de 64 em 64 bytes. É por isso que existe o `js/zip.js` — ele serve
para as duas coisas (gerar o usdz e gerar o pacote de publicação).

---

## 4. Cadastrando pratos (área do dono)

1. Abra `admin.html` e entre com a senha (inicial: `admin123`).
2. Aba **Cadastrar**, preencha:
   - **Nome, descrição, preço, categoria**;
   - **Foto**: envie do computador *ou* informe o caminho de uma foto já
     publicada (ex.: `fotos/pizza.png`) — o caminho é melhor quando você tem
     muitos pratos, porque não pesa no navegador;
   - **Largura real (cm)**: meça o prato de verdade com uma régua ou trena.
     Uma pizza grande tem ~35 cm; um hambúrguer, ~13 cm; um copo de 500 ml,
     ~10,5 cm de largura por ~15 cm de altura;
   - **Altura/profundidade (cm)**: clique em *Calcular pela proporção da foto*
     para não distorcer a imagem;
   - **Orientação**:
     - *Deitado na mesa* → fotos tiradas **de cima** (pizza, prato, tábua);
     - *Em pé* → fotos tiradas **de lado** (lanche, copo, garrafa, taça).
3. Clique em **Testar em 3D** para conferir antes de salvar.
4. **Salvar prato**.

> **Importante:** o que você cadastra fica salvo **apenas neste navegador**
> (é um rascunho). O cliente só passa a ver depois que você publica — próximo item.

---

## 5. Publicando (GitHub Pages, grátis e com HTTPS)

A Realidade Aumentada **exige HTTPS**. Por isso não dá para testar RA no celular
usando `localhost` — precisa publicar.

### 5.1 Primeira publicação

1. Crie uma conta em [github.com](https://github.com) (se ainda não tiver).
2. Clique em **New repository**, nome `cardapio`, marque **Public**, e crie.
3. Na tela do repositório vazio: **uploading an existing file**.
4. Arraste **todo o conteúdo da pasta `cardapio/`** (as pastas `css`, `js`,
   `dados`, `fotos`, `modelos` e os dois `.html`). Clique em **Commit changes**.
5. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**,
   branch **main**, pasta **/ (root)**, e **Save**.
6. Aguarde ~1 minuto. O endereço aparece no topo da mesma página:
   `https://SEU-USUARIO.github.io/cardapio/`
7. Cole esse endereço em `js/config.js`, no campo `urlDoSite`, e envie o arquivo
   de novo. Assim o QR Code aponta para o lugar certo.

### 5.2 Atualizando o cardápio (é o que você vai fazer sempre)

1. Na área do dono, aba **Publicar** → **Baixar pacote completo (.zip)**.
2. Descompacte. Ele vem com três pastas: `dados/`, `fotos/` e `modelos/`.
3. No GitHub: **Add file → Upload files**, arraste as três pastas,
   **Commit changes**.
4. Espere ~1 minuto e recarregue com `Ctrl+F5`.

O pacote já converte as fotos enviadas em arquivos de verdade e **gera os
modelos `.glb` e `.usdz` de todos os pratos** — que é o que deixa a RA
funcionando em qualquer celular (veja o item 6).

---

## 6. Deixando a Realidade Aumentada 100%

O site consegue montar o 3D na hora, dentro do navegador. Isso é ótimo para
visualizar e girar o prato, e a RA funciona no Android via WebXR. Mas dois
modos de RA — o **Scene Viewer** (Android) e o **Quick Look** (iPhone) — exigem
um arquivo 3D com **endereço de verdade**, e não um arquivo temporário criado na
memória.

A solução é simples e já está pronta: **publique os modelos**. Ao baixar o
*pacote completo*, o painel gera `modelos/nome-do-prato.glb` e
`modelos/nome-do-prato.usdz` e grava no `cardapio.json` os campos:

```json
"modelo_glb":  "modelos/pizza-marguerita.glb",
"modelo_usdz": "modelos/pizza-marguerita.usdz"
```

Quando esses campos existem, o site usa os arquivos publicados em vez de gerar
na hora — e a RA passa a abrir em praticamente todos os aparelhos.

**Compatibilidade resumida:**

| Aparelho | 3D girável | Realidade Aumentada |
|---|---|---|
| Android (Chrome) | ✅ | ✅ |
| iPhone/iPad (Safari) | ✅ | ✅ com os `.usdz` publicados |
| PC / notebook | ✅ | ❌ (não tem câmera de profundidade) |

---

## 7. QR Code

- **No cardápio**: botão flutuante *QR do cardápio* — serve para o cliente
  compartilhar com quem está na mesa.
- **Na área do dono**: aba *QR Code* → confira o endereço, clique em **Gerar** e
  em **Baixar PNG**.

Para imprimir: use o PNG em pelo menos **4 × 4 cm**, com margem branca em volta,
preto sobre branco. Coloque uma chamada junto — algo como *"Aponte a câmera e
veja o prato na sua mesa"* aumenta muito a leitura.

---

## 8. Segurança da área do dono (leia com atenção)

Como o site é 100% estático, a conferência da senha acontece **no navegador**.
Guardamos apenas o *hash* SHA-256 da senha (nunca a senha em si), mas quem
entende de programação consegue contornar isso. **Serve para impedir o cliente
curioso, não é uma tranca de verdade.**

Como aqui só existem fotos e preços de pratos, o risco é baixo. Se um dia
precisar de segurança real, o caminho é ter um servidor validando o acesso:

- **Supabase Auth** (grátis para começar, banco Postgres junto);
- **Firebase Auth** (Google);
- **Netlify Identity** (se hospedar na Netlify).

**Para trocar a senha:** área do dono → aba *Configurações* → digite a senha
nova → *Gerar código* → copie a linha e substitua a `senhaHash` em `js/config.js`.

---

## 9. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Não consegui carregar o cardápio" | abriu o arquivo com duplo clique | rode um servidor local (item 1) |
| O prato não aparece em 3D | caminho da foto errado | confira maiúsculas/minúsculas e a extensão |
| Não aparece o botão de RA | está no PC, ou o site não está em HTTPS | teste no celular, com o site publicado |
| RA não abre no iPhone | falta o `.usdz` publicado | baixe e publique o *pacote completo* (item 6) |
| O prato aparece do tamanho errado | medida em cm incorreta | meça de novo; confira largura **e** altura |
| Prato flutua estranho na mesa | foto de cima marcada como "em pé" | troque a orientação |
| Fundo branco em volta do prato | foto sem recorte | use PNG com fundo transparente |
| "ficou sem espaço" ao salvar | fotos grandes no rascunho | publique as fotos e use o caminho `fotos/...` |
| QR não gera | sem internet | a biblioteca do QR vem da internet |
| Mudei o arquivo e não mudou nada | cache do navegador | `Ctrl+F5`; no GitHub Pages espere ~1 min |

---

## 10. Por que HTML puro e não React?

Você tinha começado com `npm create vite@latest -- --template react`. React é
uma ótima escolha para aplicações grandes, mas aqui ele traria:

- uma etapa de **build** antes de cada publicação (`npm run build`);
- configuração de `base` no Vite para funcionar em subpasta no GitHub Pages;
- uma camada a mais entre você e o que está acontecendo de verdade.

Com HTML puro você publica arrastando arquivos e consegue ler cada peça do
sistema. **Quando migrar para React fizer sentido** (mais de ~50 pratos, carrinho
de pedidos, várias telas), o trabalho é quase todo aproveitável: `modelo3d.js`,
`zip.js`, `qr.js` e `dados.js` são JavaScript puro e entram no projeto React sem
mudar nada. Só as telas seriam reescritas como componentes.

---

## 11. Próximos passos possíveis

1. **Banco de dados online** (Supabase): o dono cadastra e aparece na hora em
   todos os celulares, sem exportar nada.
2. **Carrinho e pedido** pelo WhatsApp com o resumo já montado.
3. **Métricas**: quais pratos são mais abertos em 3D.
4. **Modelos 3D de verdade** para os pratos principais: o campo `modelo_glb` já
   aceita qualquer `.glb`, então basta publicar o arquivo e apontar para ele.
5. **Vários idiomas** para cardápio de hotel/turismo.

---

## 12. Referência do `cardapio.json`

```json
{
  "versao": 1,
  "atualizado_em": "2026-09-03",
  "categorias": ["Pizzas", "Lanches"],
  "itens": [
    {
      "id": "pizza-marguerita",      // único; vira o nome dos arquivos 3D
      "nome": "Pizza Marguerita",
      "descricao": "Molho de tomate, mussarela de búfala...",
      "preco": 59.9,                  // número, com ponto
      "categoria": "Pizzas",
      "foto": "fotos/pizza.png",      // caminho OU data:image/...;base64,...
      "largura_cm": 35,               // MEDIDA REAL
      "altura_cm": 35,                // profundidade (mesa) ou altura (em pé)
      "orientacao": "mesa",           // "mesa" ou "empe"
      "destaque": true,
      "ativo": true,                  // false esconde do cardápio
      "modelo_glb": "modelos/pizza.glb",   // opcional (recomendado)
      "modelo_usdz": "modelos/pizza.usdz"  // opcional (recomendado)
    }
  ]
}
```
