// NutriTrack — ponte segura para a IA (Groq)
// A chave GROQ_API_KEY fica só aqui, nas variáveis de ambiente do Netlify.
// O navegador manda o pedido + o token de login do Firebase; esta função confere
// o login, monta o prompt, chama a Groq e (nas análises de refeição) recalcula
// as calorias com uma tabela de referência baseada na TACO.

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCplq2t8hGXSU771JIoNBaxwet7AYh_biM"; // chave pública do app web (não é segredo)

const TEXT_MODELS = [process.env.GROQ_TEXT_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"].filter(Boolean);
const VISION_MODELS = [
  process.env.GROQ_VISION_MODEL,
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
].filter(Boolean);
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Limite por usuário (por instância da função) — protege a cota compartilhada da Groq
const USER_LIMIT_PER_HOUR = Number(process.env.AI_USER_LIMIT_PER_HOUR || 60);

// ---------------------------------------------------------------------
// Tabela de referência (valores por 100 g ou 100 ml) — baseada na TACO/UNICAMP,
// complementada com valores médios de rótulos/USDA para itens que a TACO não traz.
// [chave, kcal, proteína, carboidrato, gordura, porção típica (texto opcional)]
// ---------------------------------------------------------------------
const FOODS = [
  // Cereais, pães e tubérculos
  ["arroz branco cozido", 128, 2.5, 28.1, 0.2, "1 colher de servir = 45 g"],
  ["arroz integral cozido", 124, 2.6, 25.8, 1.0, "1 colher de servir = 45 g"],
  ["macarrão cozido", 158, 5.8, 30.9, 0.9, "1 prato raso = 200 g"],
  ["macarrão integral cozido", 149, 6.0, 30.0, 1.7],
  ["pão francês", 300, 8.0, 58.6, 3.1, "1 unidade = 50 g"],
  ["pão de forma branco", 270, 8.0, 50.0, 3.6, "1 fatia = 25 g"],
  ["pão de forma integral", 253, 9.4, 49.9, 3.7, "1 fatia = 25 g"],
  ["pão de queijo", 363, 5.1, 34.2, 24.6, "1 unidade média = 25 g"],
  ["pão sírio", 275, 9.1, 55.7, 1.2, "1 unidade = 60 g"],
  ["torrada", 410, 11.0, 75.0, 7.0, "1 unidade = 8 g"],
  ["tapioca (goma hidratada)", 240, 0.0, 59.0, 0.0, "1 tapioca média = 60 g de goma"],
  ["cuscuz de milho cozido", 113, 2.2, 25.3, 0.7, "1 fatia = 100 g"],
  ["aveia em flocos", 394, 13.9, 66.6, 8.5, "1 colher de sopa = 15 g"],
  ["granola", 420, 10.0, 65.0, 13.0, "1 colher de sopa = 12 g"],
  ["farinha de mandioca", 365, 1.2, 89.2, 0.3, "1 colher de sopa = 16 g"],
  ["farofa pronta", 406, 2.1, 80.3, 9.1, "1 colher de sopa = 15 g"],
  ["biscoito cream cracker", 432, 10.1, 68.7, 14.4, "1 unidade = 6 g"],
  ["biscoito recheado", 472, 6.4, 70.5, 19.6, "1 unidade = 15 g"],
  ["bolacha maria/maisena", 443, 8.1, 75.2, 12.0, "1 unidade = 5 g"],
  ["milho verde cozido", 98, 3.2, 17.1, 2.4, "1 colher de sopa = 20 g"],
  ["pipoca estourada com óleo", 448, 9.9, 70.3, 15.9, "1 xícara = 10 g"],
  ["batata inglesa cozida", 52, 1.2, 11.9, 0.0, "1 unidade média = 140 g"],
  ["purê de batata", 85, 1.9, 13.0, 3.0],
  ["batata frita", 267, 5.0, 35.6, 13.1, "porção pequena = 100 g"],
  ["batata doce cozida", 77, 0.6, 18.4, 0.1, "1 unidade média = 150 g"],
  ["mandioca cozida", 125, 0.6, 30.1, 0.3, "1 pedaço = 100 g"],
  ["mandioca frita", 300, 1.4, 50.3, 11.2],
  ["inhame cozido", 97, 1.5, 23.2, 0.1],
  ["polenta cozida", 70, 1.6, 15.0, 0.3],
  // Leguminosas
  ["feijão carioca cozido", 76, 4.8, 13.6, 0.5, "1 concha média = 140 g"],
  ["feijão preto cozido", 77, 4.5, 14.0, 0.5, "1 concha média = 140 g"],
  ["lentilha cozida", 93, 6.3, 16.3, 0.5],
  ["grão de bico cozido", 164, 8.9, 27.4, 2.6],
  ["feijoada", 117, 8.7, 11.6, 6.5, "1 concha = 150 g"],
  ["ervilha cozida", 74, 4.8, 13.4, 0.4],
  // Carnes, peixes e ovos
  ["peito de frango grelhado", 159, 32.0, 0.0, 2.5, "1 filé médio = 120 g"],
  ["frango desfiado cozido", 163, 31.5, 0.0, 3.2, "1 colher de sopa = 25 g"],
  ["coxa/sobrecoxa de frango assada", 215, 28.5, 0.0, 10.4, "1 unidade = 100 g"],
  ["frango frito empanado", 280, 22.0, 12.0, 16.0],
  ["patinho grelhado", 219, 35.9, 0.0, 7.3, "1 bife = 100 g"],
  ["alcatra grelhada", 241, 31.9, 0.0, 11.6, "1 bife = 100 g"],
  ["contrafilé grelhado", 278, 32.4, 0.0, 15.5, "1 bife = 120 g"],
  ["picanha grelhada", 289, 26.4, 0.0, 19.5, "1 fatia = 80 g"],
  ["carne moída refogada", 212, 26.7, 0.0, 10.9, "1 colher de sopa = 25 g"],
  ["costela bovina assada", 373, 28.8, 0.0, 27.7],
  ["carne de panela", 200, 28.0, 2.0, 9.0],
  ["lombo suíno assado", 210, 35.7, 0.0, 6.4],
  ["bisteca suína grelhada", 280, 28.9, 0.0, 17.4, "1 unidade = 100 g"],
  ["linguiça frita", 296, 20.5, 0.0, 23.0, "1 gomo = 60 g"],
  ["bacon frito", 541, 37.0, 1.4, 41.8, "1 fatia = 8 g"],
  ["presunto", 94, 14.3, 2.1, 2.7, "1 fatia = 15 g"],
  ["peito de peru fatiado", 117, 18.0, 2.0, 4.0, "1 fatia = 15 g"],
  ["salsicha", 257, 12.0, 3.0, 22.0, "1 unidade = 50 g"],
  ["mortadela", 269, 12.0, 5.8, 21.6, "1 fatia = 15 g"],
  ["hambúrguer bovino (carne)", 258, 20.0, 4.0, 18.0, "1 unidade = 90 g"],
  ["tilápia grelhada", 128, 26.2, 0.0, 2.7, "1 filé = 120 g"],
  ["salmão grelhado", 229, 23.9, 0.0, 14.0, "1 posta = 120 g"],
  ["peixe frito", 230, 22.0, 6.0, 13.0],
  ["atum em lata", 166, 26.2, 0.0, 6.0, "1 lata drenada = 120 g"],
  ["sardinha em lata", 285, 15.9, 0.0, 24.0, "1 lata drenada = 85 g"],
  ["camarão cozido", 90, 19.0, 0.0, 1.0],
  ["ovo cozido", 146, 13.3, 0.6, 9.5, "1 ovo = 50 g"],
  ["ovo frito", 240, 15.6, 1.2, 18.6, "1 ovo = 50 g"],
  ["ovo mexido", 190, 12.5, 1.5, 14.8, "1 ovo mexido = 55 g"],
  ["omelete", 190, 12.5, 1.5, 14.8, "omelete de 2 ovos = 120 g"],
  ["clara de ovo cozida", 59, 13.4, 0.0, 0.1, "1 clara = 33 g"],
  // Leite e derivados
  ["leite integral", 61, 2.9, 4.3, 3.2, "1 copo = 200 ml"],
  ["leite desnatado", 35, 3.4, 4.9, 0.1, "1 copo = 200 ml"],
  ["leite sem lactose semidesnatado", 44, 3.1, 4.8, 1.2, "1 copo = 200 ml"],
  ["café com leite (sem açúcar)", 32, 1.5, 2.3, 1.6, "1 xícara = 150 ml"],
  ["iogurte natural integral", 51, 4.1, 1.9, 3.0, "1 pote = 170 g"],
  ["iogurte natural desnatado", 41, 3.8, 5.8, 0.3, "1 pote = 170 g"],
  ["iogurte com sabor/adoçado", 70, 2.7, 9.7, 2.3, "1 pote = 170 g"],
  ["iogurte grego", 120, 5.0, 12.0, 6.0, "1 pote = 100 g"],
  ["queijo muçarela", 330, 22.6, 3.0, 25.2, "1 fatia = 20 g"],
  ["queijo minas frescal", 264, 17.4, 3.2, 20.2, "1 fatia = 30 g"],
  ["queijo prato", 360, 22.7, 1.9, 29.1, "1 fatia = 20 g"],
  ["queijo parmesão", 453, 35.6, 1.7, 33.5, "1 colher de sopa = 10 g"],
  ["queijo cottage", 98, 11.1, 3.4, 4.3],
  ["requeijão cremoso", 257, 9.6, 2.4, 23.4, "1 colher de sopa = 30 g"],
  ["requeijão light", 180, 12.0, 3.0, 13.0, "1 colher de sopa = 30 g"],
  ["manteiga", 726, 0.4, 0.1, 82.4, "1 ponta de faca = 5 g"],
  ["margarina", 596, 0.0, 0.0, 67.4, "1 ponta de faca = 5 g"],
  ["creme de leite", 221, 1.5, 4.5, 22.5],
  ["leite condensado", 313, 7.7, 57.0, 6.7],
  ["whey protein", 400, 80.0, 8.0, 6.0, "1 scoop = 30 g"],
  // Óleos e molhos
  ["azeite de oliva", 884, 0.0, 0.0, 100.0, "1 colher de sopa = 13 ml"],
  ["óleo de soja", 884, 0.0, 0.0, 100.0, "1 colher de sopa = 13 ml"],
  ["maionese", 302, 0.6, 7.9, 30.5, "1 colher de sopa = 12 g"],
  ["ketchup", 112, 1.2, 26.0, 0.2, "1 colher de sopa = 15 g"],
  ["molho de tomate", 38, 1.4, 7.7, 0.9],
  // Frutas
  ["banana prata", 98, 1.3, 26.0, 0.1, "1 unidade = 70 g"],
  ["banana nanica", 92, 1.4, 23.8, 0.1, "1 unidade = 100 g"],
  ["maçã", 56, 0.3, 15.2, 0.0, "1 unidade = 130 g"],
  ["laranja", 37, 1.0, 8.9, 0.1, "1 unidade = 140 g"],
  ["tangerina/mexerica", 38, 0.8, 9.6, 0.1, "1 unidade = 120 g"],
  ["mamão papaia", 40, 0.5, 10.4, 0.1, "1/2 unidade = 150 g"],
  ["melancia", 33, 0.9, 8.1, 0.0, "1 fatia = 200 g"],
  ["melão", 29, 0.7, 7.5, 0.0, "1 fatia = 100 g"],
  ["abacaxi", 48, 0.9, 12.3, 0.1, "1 fatia = 75 g"],
  ["manga", 72, 0.4, 19.4, 0.2, "1 unidade = 200 g"],
  ["uva", 53, 0.7, 13.6, 0.2, "1 cacho pequeno = 100 g"],
  ["morango", 30, 0.9, 6.8, 0.3, "1 unidade = 12 g"],
  ["abacate", 96, 1.2, 6.0, 8.4, "1 colher de sopa = 30 g"],
  ["goiaba", 54, 1.1, 13.0, 0.4, "1 unidade = 170 g"],
  ["pera", 53, 0.6, 14.0, 0.1, "1 unidade = 130 g"],
  ["kiwi", 51, 1.3, 11.5, 0.6, "1 unidade = 75 g"],
  ["açaí puro (polpa)", 58, 0.8, 6.2, 3.9],
  ["açaí na tigela (com xarope)", 110, 0.7, 21.5, 3.7, "1 tigela média = 300 g"],
  ["uva passa", 299, 3.1, 79.2, 0.5],
  // Verduras e legumes
  ["alface", 11, 1.3, 1.7, 0.2],
  ["tomate", 15, 1.1, 3.1, 0.2, "1 unidade = 100 g"],
  ["pepino", 10, 0.9, 2.0, 0.0],
  ["cenoura crua", 34, 1.3, 7.7, 0.2],
  ["cenoura cozida", 30, 0.8, 6.7, 0.2],
  ["beterraba cozida", 32, 1.3, 7.2, 0.1],
  ["brócolis cozido", 25, 2.1, 4.4, 0.5],
  ["couve-flor cozida", 19, 1.2, 3.9, 0.3],
  ["couve refogada", 90, 1.7, 8.7, 6.6],
  ["abobrinha cozida", 15, 1.1, 3.0, 0.2],
  ["abóbora cozida", 48, 1.4, 10.8, 0.7],
  ["chuchu cozido", 19, 0.4, 4.8, 0.0],
  ["vagem cozida", 25, 1.4, 5.3, 0.3],
  ["repolho cru", 17, 0.9, 3.9, 0.1],
  ["cebola", 39, 1.7, 8.9, 0.1],
  ["salada verde mista", 15, 1.0, 3.0, 0.2, "1 prato de sobremesa = 60 g"],
  // Oleaginosas
  ["amendoim torrado", 606, 22.5, 18.7, 54.0, "1 punhado = 30 g"],
  ["pasta de amendoim", 589, 25.0, 20.0, 50.0, "1 colher de sopa = 15 g"],
  ["castanha de caju", 570, 18.5, 29.1, 46.3, "1 punhado = 30 g"],
  ["castanha-do-pará", 643, 14.5, 15.1, 63.5, "1 unidade = 4 g"],
  ["nozes", 620, 14.0, 18.4, 59.4],
  ["chia", 486, 16.5, 42.1, 30.7, "1 colher de sopa = 12 g"],
  // Doces e bebidas
  ["açúcar", 387, 0.3, 99.5, 0.0, "1 colher de chá = 5 g"],
  ["mel", 309, 0.0, 84.0, 0.0, "1 colher de sopa = 20 g"],
  ["chocolate ao leite", 540, 7.2, 59.6, 30.3, "1 quadradinho = 5 g"],
  ["sorvete de massa", 209, 3.6, 25.0, 11.0, "1 bola = 60 g"],
  ["bolo de chocolate", 410, 6.2, 54.7, 18.5, "1 fatia = 60 g"],
  ["bolo simples", 333, 5.0, 55.0, 10.0, "1 fatia = 60 g"],
  ["brigadeiro", 380, 4.0, 60.0, 14.0, "1 unidade = 20 g"],
  ["achocolatado em pó", 401, 4.2, 91.2, 2.2, "1 colher de sopa = 15 g"],
  ["refrigerante comum", 42, 0.0, 10.6, 0.0, "1 lata = 350 ml"],
  ["refrigerante zero", 0, 0.0, 0.0, 0.0, "1 lata = 350 ml"],
  ["suco de laranja natural", 33, 0.7, 7.6, 0.1, "1 copo = 250 ml"],
  ["suco industrializado/néctar", 52, 0.2, 12.6, 0.0, "1 copo = 250 ml"],
  ["café sem açúcar", 2, 0.1, 0.3, 0.0, "1 xícara = 50 ml"],
  ["água de coco", 22, 0.0, 5.3, 0.0, "1 copo = 300 ml"],
  ["cerveja", 41, 0.6, 3.3, 0.0, "1 lata = 350 ml"],
  ["vinho tinto", 85, 0.1, 2.6, 0.0, "1 taça = 150 ml"],
  ["água", 0, 0, 0, 0],
  // Pratos prontos e salgados
  ["pizza de muçarela", 280, 12.0, 30.0, 12.0, "1 fatia = 110 g"],
  ["lasanha à bolonhesa", 160, 9.0, 14.0, 7.5, "1 porção = 300 g"],
  ["strogonoff de frango", 157, 14.5, 3.0, 9.5, "1 concha = 150 g"],
  ["sanduíche tipo hambúrguer", 260, 13.0, 28.0, 11.0, "1 unidade = 200 g"],
  ["misto quente", 265, 13.0, 28.0, 11.0, "1 unidade = 120 g"],
  ["coxinha frita", 283, 9.6, 34.5, 11.8, "1 unidade média = 80 g"],
  ["pastel frito", 388, 10.1, 43.8, 20.1, "1 unidade = 80 g"],
  ["esfiha de carne", 290, 11.0, 40.0, 9.0, "1 unidade = 70 g"],
  ["sushi (niguiri/uramaki)", 150, 6.0, 28.0, 1.5, "1 peça = 30 g"],
  ["sanduíche natural", 200, 11.0, 24.0, 6.5, "1 unidade = 150 g"],
];
// Itens extras (usados na busca manual do app e reconhecidos se a IA citar o nome exato)
const EXTRA_FOODS = [
  ["arroz carreteiro", 180, 9.0, 20.0, 7.0, "1 colher de servir = 60 g"],
  ["baião de dois", 160, 6.0, 22.0, 5.0, "1 colher de servir = 60 g"],
  ["risoto", 150, 4.0, 20.0, 6.0],
  ["quinoa cozida", 120, 4.4, 21.3, 1.9, "1 colher de sopa = 20 g"],
  ["mandioquinha cozida", 80, 0.9, 18.9, 0.2],
  ["pão de hambúrguer", 280, 9.0, 50.0, 4.5, "1 unidade = 60 g"],
  ["pão de cachorro-quente", 280, 9.0, 50.0, 4.5, "1 unidade = 50 g"],
  ["tortilha/wrap", 300, 8.0, 50.0, 7.0, "1 unidade = 40 g"],
  ["crepioca", 180, 11.0, 18.0, 7.0, "1 unidade = 80 g"],
  ["macarrão instantâneo preparado", 140, 3.3, 19.0, 5.5, "1 pacote preparado = 270 g"],
  ["mingau de aveia com leite", 100, 4.0, 14.0, 3.0, "1 tigela = 250 g"],
  ["cereal matinal açucarado", 380, 6.0, 86.0, 0.5, "1 xícara = 30 g"],
  ["barra de cereal", 400, 5.0, 75.0, 8.0, "1 unidade = 25 g"],
  ["barra de proteína", 380, 30.0, 35.0, 12.0, "1 unidade = 45 g"],
  ["biscoito de arroz", 380, 8.0, 80.0, 3.0, "1 unidade = 9 g"],
  ["biscoito de polvilho", 438, 1.3, 75.0, 14.0, "1 punhado = 20 g"],
  ["croissant", 410, 8.0, 46.0, 21.0, "1 unidade = 60 g"],
  ["frango à parmegiana", 220, 18.0, 9.0, 12.0, "1 porção = 200 g"],
  ["bife à milanesa", 280, 22.0, 12.0, 16.0, "1 bife = 120 g"],
  ["almôndega", 210, 15.0, 8.0, 13.0, "1 unidade = 30 g"],
  ["cupim assado", 330, 28.0, 0.0, 24.0],
  ["fígado bovino grelhado", 225, 29.9, 4.2, 9.0, "1 bife = 100 g"],
  ["carne seca cozida", 300, 35.0, 0.0, 17.0],
  ["lagarto/carne assada", 222, 32.9, 0.0, 9.1, "1 fatia = 80 g"],
  ["frango assado com pele", 210, 29.0, 0.0, 10.0],
  ["asa de frango assada", 240, 25.0, 0.0, 15.0, "1 unidade = 40 g"],
  ["coração de frango", 207, 22.4, 0.0, 12.1, "1 espeto = 100 g"],
  ["kafta", 240, 18.0, 4.0, 17.0, "1 espeto = 80 g"],
  ["frango xadrez", 150, 14.0, 8.0, 7.0],
  ["merluza assada", 122, 26.6, 0.0, 0.9, "1 filé = 120 g"],
  ["bacalhau cozido", 140, 30.0, 0.0, 1.5],
  ["ovo de codorna", 177, 13.7, 0.8, 12.7, "1 unidade = 10 g"],
  ["nuggets de frango", 250, 15.0, 15.0, 15.0, "1 unidade = 20 g"],
  ["leite em pó integral", 497, 25.4, 39.2, 26.9, "1 colher de sopa = 16 g"],
  ["queijo coalho", 320, 25.0, 2.0, 24.0, "1 espeto = 50 g"],
  ["ricota", 140, 12.6, 3.8, 8.1, "1 fatia = 30 g"],
  ["cream cheese", 300, 6.0, 4.0, 29.0, "1 colher de sopa = 20 g"],
  ["kefir", 60, 3.3, 4.5, 3.2],
  ["bebida láctea", 75, 2.5, 13.0, 1.5, "1 garrafinha = 200 g"],
  ["leite de amêndoas sem açúcar", 17, 0.5, 0.5, 1.2, "1 copo = 200 ml"],
  ["leite de soja", 45, 3.0, 4.5, 1.8, "1 copo = 200 ml"],
  ["doce de leite", 306, 5.5, 55.4, 6.0, "1 colher de sopa = 20 g"],
  ["caqui", 71, 0.4, 19.3, 0.1, "1 unidade = 110 g"],
  ["maracujá (polpa)", 68, 2.0, 12.3, 2.1],
  ["jabuticaba", 58, 0.6, 15.3, 0.1],
  ["acerola", 33, 0.9, 8.0, 0.2],
  ["pitaya", 50, 1.1, 11.0, 0.4],
  ["coco seco", 406, 3.7, 10.4, 42.0],
  ["frutas vermelhas", 45, 0.9, 10.0, 0.4],
  ["salada de frutas", 60, 0.7, 15.0, 0.2, "1 tigela = 150 g"],
  ["vitamina de banana com leite", 80, 2.8, 13.0, 2.0, "1 copo = 300 ml"],
  ["banana da terra cozida", 128, 1.4, 33.7, 0.2, "1 unidade = 120 g"],
  ["pêssego", 36, 0.8, 9.3, 0.1, "1 unidade = 110 g"],
  ["ameixa", 53, 0.8, 13.9, 0.1, "1 unidade = 60 g"],
  ["espinafre refogado", 67, 2.7, 4.2, 5.4],
  ["rúcula", 13, 1.8, 2.2, 0.1],
  ["agrião", 17, 2.7, 2.3, 0.2],
  ["berinjela cozida", 19, 0.7, 4.5, 0.1],
  ["palmito em conserva", 23, 1.8, 4.3, 0.4],
  ["pimentão", 21, 1.1, 4.9, 0.2],
  ["cogumelo refogado", 35, 2.5, 3.5, 1.5],
  ["salada de maionese", 145, 2.0, 14.0, 9.0, "1 colher de servir = 60 g"],
  ["vinagrete", 30, 0.8, 5.0, 1.0, "1 colher de sopa = 20 g"],
  ["sopa de legumes", 45, 1.5, 7.0, 1.2, "1 prato = 300 g"],
  ["canja de galinha", 60, 4.5, 7.0, 1.5, "1 prato = 300 g"],
  ["pudim de leite", 230, 5.5, 37.0, 7.0, "1 fatia = 80 g"],
  ["mousse de maracujá", 240, 4.0, 32.0, 11.0, "1 taça = 80 g"],
  ["paçoca", 480, 15.0, 52.0, 24.0, "1 unidade = 20 g"],
  ["bombom", 500, 5.0, 60.0, 26.0, "1 unidade = 20 g"],
  ["picolé de fruta", 90, 0.2, 22.0, 0.1, "1 unidade = 60 g"],
  ["gelatina", 60, 1.5, 14.0, 0.0, "1 pote = 100 g"],
  ["empada de frango", 360, 8.0, 35.0, 21.0, "1 unidade = 60 g"],
  ["quibe frito", 254, 15.0, 15.0, 15.0, "1 unidade = 70 g"],
  ["enroladinho de salsicha", 320, 9.0, 35.0, 16.0, "1 unidade = 70 g"],
  ["batata chips", 540, 6.0, 52.0, 35.0, "1 pacote pequeno = 25 g"],
  ["cachorro-quente", 250, 9.0, 25.0, 12.0, "1 unidade = 150 g"],
  ["chá sem açúcar", 1, 0.0, 0.2, 0.0, "1 xícara = 200 ml"],
  ["isotônico", 25, 0.0, 6.0, 0.0, "1 garrafa = 500 ml"],
  ["energético", 45, 0.0, 11.0, 0.0, "1 lata = 250 ml"],
  ["caldo de cana", 70, 0.0, 18.0, 0.0, "1 copo = 300 ml"],
  ["cerveja sem álcool", 22, 0.3, 5.0, 0.0, "1 lata = 350 ml"],
  ["caipirinha", 140, 0.0, 12.0, 0.0, "1 copo = 200 ml"],
  ["destilado (cachaça/vodka)", 230, 0.0, 0.0, 0.0, "1 dose = 50 ml"],
  ["suco de uva integral", 66, 0.2, 16.0, 0.0, "1 copo = 200 ml"],
  ["leite com achocolatado", 85, 3.0, 12.0, 3.0, "1 copo = 250 ml"],
  ["cappuccino", 70, 2.5, 10.0, 2.5, "1 xícara = 200 ml"],
  ["refresco em pó preparado", 30, 0.0, 7.5, 0.0, "1 copo = 250 ml"],
  ["molho shoyu", 60, 6.0, 8.0, 0.0, "1 colher de sopa = 15 ml"],
  ["mostarda", 66, 4.0, 5.0, 3.5, "1 colher de sopa = 15 g"],
  ["geleia de frutas", 250, 0.3, 65.0, 0.0, "1 colher de sopa = 20 g"],
  ["molho branco", 120, 3.0, 8.0, 8.0],
  ["amêndoas", 580, 21.0, 22.0, 50.0, "1 punhado = 30 g"],
  ["linhaça", 495, 14.1, 43.3, 32.3, "1 colher de sopa = 10 g"],
  ["mix de castanhas", 600, 18.0, 20.0, 52.0, "1 punhado = 30 g"],
  ["feijão branco cozido", 102, 6.6, 18.0, 0.5],
  ["soja cozida", 150, 14.0, 9.0, 7.0],
  ["proteína de soja hidratada", 110, 16.0, 10.0, 0.4],
  ["tofu", 76, 8.0, 1.9, 4.8, "1 fatia = 50 g"],
  ["homus", 170, 7.9, 14.3, 9.6, "1 colher de sopa = 20 g"],
];
const ALL_FOODS = [...FOODS, ...EXTRA_FOODS];
const FOOD_MAP = new Map(ALL_FOODS.map((f) => [f[0], { kcal: f[1], protein: f[2], carbs: f[3], fat: f[4] }]));
const FOOD_LIST_PROMPT = FOODS.map((f) => (f[5] ? `${f[0]} (${f[5]})` : f[0])).join("; ");

// ---------- utilidades ----------
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const tokenCache = new Map();
async function verifyUser(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.uid;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  if (!r.ok) return null;
  const uid = (await r.json())?.users?.[0]?.localId;
  if (!uid) return null;
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(token, { uid, exp: Date.now() + 10 * 60 * 1000 });
  return uid;
}

const usage = new Map(); // uid -> [timestamps]
function overLimit(uid) {
  const now = Date.now(), hour = 3600_000;
  const list = (usage.get(uid) || []).filter((t) => now - t < hour);
  list.push(now);
  usage.set(uid, list);
  if (usage.size > 2000) usage.clear();
  return list.length > USER_LIMIT_PER_HOUR;
}

function parseJsonLoose(text) {
  if (!text) throw new Error("Resposta vazia da IA");
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1));
    throw new Error("A IA respondeu num formato inválido");
  }
}

async function callGroq({ models, messages, temperature = 0.3, maxTokens = 2048 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error("GROQ_API_KEY não configurada no Netlify"), { status: 500 });
  let lastErr;
  for (const model of models) {
    const reasoning = model.startsWith("openai/gpt-oss") ? "low" : model.startsWith("qwen/") ? "none" : null;
    const attempts = [{ jsonMode: true, reasoning }, { jsonMode: false, reasoning }, ...(reasoning ? [{ jsonMode: false, reasoning: null }] : [])];
    for (const a of attempts) {
      const body = { model, messages, temperature, max_completion_tokens: maxTokens };
      if (a.jsonMode) body.response_format = { type: "json_object" };
      if (a.reasoning) body.reasoning_effort = a.reasoning;
      let r;
      try {
        r = await fetch(GROQ_URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      } catch (e) { lastErr = e; break; }
      if (r.status === 401) throw Object.assign(new Error("A chave da Groq no Netlify é inválida."), { status: 500 });
      if (r.status === 429) { lastErr = Object.assign(new Error("Limite de uso da IA atingido. Tente de novo em instantes."), { status: 429 }); break; }
      if (!r.ok) {
        lastErr = new Error(`Groq ${r.status} (${model}): ${(await r.text()).slice(0, 300)}`);
        if (r.status === 400) continue;
        break;
      }
      const data = await r.json();
      try { return parseJsonLoose(data?.choices?.[0]?.message?.content); } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error("Nenhum modelo da IA respondeu");
}

// ---------- contexto ----------
const GOALS = { lose_weight: "Perder peso", maintain: "Manter peso", gain_muscle: "Ganhar massa muscular" };
const ACTIVITY = { sedentary: "Sedentário", light: "Leve (1-2 dias/sem)", moderate: "Moderado (3-5 dias/sem)", active: "Ativo (6-7 dias/sem)", very_active: "Muito ativo (atleta)" };
const GENDER = { male: "Masculino", female: "Feminino", other: "Outro" };
const s = (v, max = 200) => String(v ?? "").slice(0, max);
const list = (v, max = 40) => (Array.isArray(v) ? v.slice(0, max).map((x) => s(x, 80)) : []);
const n = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const r1 = (v) => Math.round(v * 10) / 10;

function profileText(p = {}) {
  return [
    `Objetivo: ${GOALS[p.goal] || "Manter peso"}`,
    `Meta diária: ${Number(p.dailyCalorieGoal) || 2000} kcal`,
    p.weight ? `Peso: ${Number(p.weight)} kg` : "",
    p.height ? `Altura: ${Number(p.height)} cm` : "",
    p.age ? `Idade: ${Number(p.age)}` : "",
    p.gender ? `Gênero: ${GENDER[p.gender] || s(p.gender, 20)}` : "",
    `Atividade: ${ACTIVITY[p.activityLevel] || "Moderado"}`,
    `Restrições alimentares (NUNCA sugerir): ${list(p.restrictions).join(", ") || "nenhuma"}`,
  ].filter(Boolean).join("\n");
}

const PERSONA =
  "Você é a 'Nutri Rigorosa', nutricionista brasileira firme, direta e exigente — mas sempre respeitosa: " +
  "nunca humilhe, nunca use palavrões nem comentários sobre o corpo da pessoa; critique a escolha, não a pessoa, e diga o próximo passo concreto. " +
  "Fale em português do Brasil, com frases curtas. Nunca recomende jejum prolongado, dietas abaixo de 1200 kcal, remédios ou suplementos sem orientação profissional. " +
  "Respeite SEMPRE as restrições alimentares do usuário.";

// ---------- análise de refeição (itens + tabela) ----------
const ITEMS_INSTRUCTIONS =
  "Separe a refeição em itens individuais e estime a quantidade de cada um em gramas (ou ml para bebidas), usando porções brasileiras usuais. " +
  "Para cada item, escolha em 'ref' o nome EXATO do alimento mais parecido desta lista de referência, ou null se nada servir: " +
  FOOD_LIST_PROMPT + ". " +
  "Sempre informe também a sua própria estimativa de kcal e macros para a quantidade do item (usada quando ref for null). " +
  'Responda APENAS com JSON: {"foodName": string (nome curto da refeição, até 6 palavras), "items": [{"name": string, "ref": string|null, "grams": number, "kcal": number, "protein": number, "carbs": number, "fat": number}], ' +
  '"analysis": string (feedback da Nutri, no máximo 3 frases)}';

function finalizeMeal(out) {
  const items = (Array.isArray(out?.items) ? out.items : []).slice(0, 15).map((it) => {
    const grams = Math.max(0, Math.round(n(it?.grams)));
    const refKey = typeof it?.ref === "string" ? it.ref.trim().toLowerCase() : null;
    const ref = refKey ? [...FOOD_MAP.keys()].find((k) => k.toLowerCase() === refKey) : null;
    let per100;
    if (ref) per100 = { ...FOOD_MAP.get(ref) };
    else if (grams > 0) per100 = { kcal: n(it.kcal) / grams * 100, protein: n(it.protein) / grams * 100, carbs: n(it.carbs) / grams * 100, fat: n(it.fat) / grams * 100 };
    else per100 = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    per100 = { kcal: r1(per100.kcal), protein: r1(per100.protein), carbs: r1(per100.carbs), fat: r1(per100.fat) };
    const f = grams / 100;
    return {
      name: s(it?.name || ref || "Item", 60), ref: ref || null, source: ref ? "tabela" : "ia", grams, per100,
      kcal: Math.round(per100.kcal * f), protein: Math.round(per100.protein * f), carbs: Math.round(per100.carbs * f), fat: Math.round(per100.fat * f),
    };
  }).filter((i) => i.grams > 0 || i.kcal > 0);
  const sum = (k) => items.reduce((a, i) => a + i[k], 0);
  return {
    foodName: s(out?.foodName || items.map((i) => i.name).join(", ") || "Refeição", 80),
    items, calories: sum("kcal"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat"),
    analysis: s(out?.analysis || "", 800),
  };
}

// ---------- tarefas ----------
const TASKS = {
  async analyzeImage(p) {
    const image = s(p.image, 1_500_000);
    if (!image.startsWith("data:image/")) throw Object.assign(new Error("Imagem inválida"), { status: 400 });
    const note = s(p.note, 400);
    const out = await callGroq({
      models: VISION_MODELS, temperature: 0.1, maxTokens: 1500,
      messages: [
        { role: "system", content: `${PERSONA} ${ITEMS_INSTRUCTIONS}` },
        { role: "user", content: [
          { type: "text", text:
            "Identifique o que há na foto (comida ou bebida) e estime as porções visíveis pelo tamanho do prato/talheres. Água = 0 kcal.\n" +
            (note ? `Observação do usuário (tem prioridade sobre a foto): ${note}\n` : "") +
            `Perfil:\n${profileText(p.profile)}\n` +
            "Se for boa escolha, elogie. Se atrapalhar o objetivo, seja firme e sugira uma troca melhor." },
          { type: "image_url", image_url: { url: image } },
        ] },
      ],
    });
    return finalizeMeal(out);
  },

  async analyzeText(p) {
    const text = s(p.text, 1000);
    if (!text.trim()) throw Object.assign(new Error("Descreva a refeição"), { status: 400 });
    const out = await callGroq({
      models: TEXT_MODELS, temperature: 0.1, maxTokens: 1500,
      messages: [
        { role: "system", content: `${PERSONA} ${ITEMS_INSTRUCTIONS}` },
        { role: "user", content: `Refeição descrita: "${text}"\nSe a pessoa disser quantidades, use exatamente elas.\nPerfil:\n${profileText(p.profile)}\nDê seu feedback sobre a escolha.` },
      ],
    });
    return finalizeMeal(out);
  },

  async dietPlan(p) {
    const t0 = Date.now();
    const target = Number(p.profile?.dailyCalorieGoal) || 2000;
    const SLOTS = [["Café da Manhã", "07:30", 0.22], ["Lanche da Manhã", "10:30", 0.10], ["Almoço", "12:30", 0.32], ["Lanche da Tarde", "16:00", 0.10], ["Jantar", "19:30", 0.26]];
    const slotKcal = SLOTS.map(([nm, t, f]) => [nm, t, Math.round(target * f)]);
    const base = [
      { role: "system", content: `${PERSONA} Você monta planos alimentares práticos, com comida brasileira do dia a dia e quantidades caseiras + gramas.` },
      { role: "user", content:
        `Monte um plano alimentar para a semana.\nPerfil:\n${profileText(p.profile)}\n` +
        `Meta do dia: ${target} kcal. Use EXATAMENTE estas refeições, horários e calorias-alvo (cada opção deve ficar a no máximo 5% do alvo da refeição): ` +
        slotKcal.map(([nm, t, k]) => `${nm} ${t} = ${k} kcal`).join("; ") + ". " +
        "Para cada refeição dê 3 opções DIFERENTES e intercambiáveis, para variar ao longo da semana. " +
        "Cada opção com quantidades (ex: '2 ovos mexidos + 1 pão francês (50 g)') e seus valores. Ajuste as quantidades para bater as calorias.\n" +
        'Responda APENAS com JSON: {"macros": {"protein": number, "carbs": number, "fat": number}, ' +
        '"meals": [{"name": string, "time": "HH:MM", "options": [{"text": string, "kcal": number, "protein": number, "carbs": number, "fat": number}]}], ' +
        '"tips": [string, string, string, string]}  (macros do dia em gramas)' },
    ];
    const shape = (out) => (Array.isArray(out?.meals) ? out.meals : []).slice(0, 7).map((m) => {
      const options = (Array.isArray(m?.options) ? m.options : []).slice(0, 4).map((o) => ({
        text: s(o?.text, 220), kcal: Math.round(n(o?.kcal)), protein: Math.round(n(o?.protein)), carbs: Math.round(n(o?.carbs)), fat: Math.round(n(o?.fat)),
      })).filter((o) => o.text);
      const avg = options.length ? Math.round(options.reduce((a, o) => a + o.kcal, 0) / options.length) : 0;
      return { name: s(m?.name || "Refeição", 40), time: s(m?.time || "", 5), calories: avg, options, suggestions: options.map((o) => o.text) };
    }).filter((m) => m.options.length);
    let out = await callGroq({ models: TEXT_MODELS, temperature: 0.4, maxTokens: 3500, messages: base });
    let meals = shape(out);
    const total = (ms) => ms.reduce((a, m) => a + m.calories, 0);
    let sum = total(meals);
    // Conferência: se a soma fugir mais de 4% da meta e ainda houver tempo, pede um ajuste
    if (meals.length && Math.abs(sum - target) / target > 0.04 && Date.now() - t0 < 4500) {
      try {
        const fix = await callGroq({
          models: TEXT_MODELS, temperature: 0.2, maxTokens: 3500,
          messages: [...base, { role: "assistant", content: JSON.stringify(out) },
            { role: "user", content: `A média das opções soma ${sum} kcal por dia, mas a meta é ${target} kcal. Ajuste as QUANTIDADES (e os valores) das opções para que cada refeição fique no alvo indicado. Responda com o JSON completo no mesmo formato.` }],
        });
        const meals2 = shape(fix);
        if (meals2.length && Math.abs(total(meals2) - target) < Math.abs(sum - target)) { out = fix; meals = meals2; sum = total(meals2); }
      } catch (e) { console.warn("[ai] ajuste do plano falhou", e?.message); }
    }
    return {
      dailyCalories: target, planTotal: sum,
      macros: { protein: Math.round(n(out?.macros?.protein)), carbs: Math.round(n(out?.macros?.carbs)), fat: Math.round(n(out?.macros?.fat)) },
      meals, tips: list(out?.tips, 6),
    };
  },

  async dailyFeedback(p) {
    const meals = Array.isArray(p.meals) ? p.meals.slice(0, 15).map((m) => ({
      alimento: s(m.foodName, 80), kcal: Number(m.calories) || 0, proteina: Number(m.protein) || 0, carbo: Number(m.carbs) || 0, gordura: Number(m.fat) || 0, hora: s(m.time, 5),
    })) : [];
    return callGroq({
      models: TEXT_MODELS, temperature: 0.4, maxTokens: 400,
      messages: [
        { role: "system", content: `${PERSONA} Responda APENAS com JSON: {"feedback": string}.` },
        { role: "user", content:
          `Perfil:\n${profileText(p.profile)}\nÁgua hoje: ${Number(p.waterMl) || 0} ml de ${Number(p.waterGoalMl) || 0} ml.\nHorário atual: ${s(p.now, 5)}.\n` +
          `Refeições de hoje: ${JSON.stringify(meals)}\n` +
          "Avalie o dia em 1 parágrafo curto (máx. 3 frases): o que está bom, o que corrigir e o que fazer nas próximas refeições." },
      ],
    });
  },

  async weeklyReport(p) {
    const st = p.stats || {};
    const days = Array.isArray(st.days) ? st.days.slice(0, 7).map((d) => ({ dia: s(d.label, 12), kcal: Math.round(n(d.kcal)), refeicoes: Math.round(n(d.meals)), agua_ml: Math.round(n(d.water)) })) : [];
    return callGroq({
      models: TEXT_MODELS, temperature: 0.4, maxTokens: 900,
      messages: [
        { role: "system", content: `${PERSONA} Responda APENAS com JSON: {"headline": string (até 8 palavras), "summary": string (2-3 frases), "wins": [string, string], "fixes": [string, string], "focus": string (1 meta concreta para a próxima semana)}.` },
        { role: "user", content:
          `Perfil:\n${profileText(p.profile)}\n` +
          `Semana de ${s(st.from, 10)} a ${s(st.to, 10)}. Dias: ${JSON.stringify(days)}\n` +
          `Média de calorias nos dias com registro: ${Math.round(n(st.avgKcal))} kcal (meta ${Math.round(n(st.goal))}). Dias dentro da meta (±10%): ${Math.round(n(st.daysOnTarget))}/7. ` +
          `Dias sem registro: ${Math.round(n(st.daysEmpty))}. Média de água: ${Math.round(n(st.avgWater))} ml (meta ${Math.round(n(st.waterGoal))} ml). ` +
          `Proteína média: ${Math.round(n(st.avgProtein))} g. Variação de peso na semana: ${st.weightChange == null ? "sem pesagem" : n(st.weightChange).toFixed(1) + " kg"}. ` +
          `Alimentos mais frequentes: ${list(st.topFoods, 8).join(", ") || "—"}.\n` +
          "Faça o relatório semanal: o que foi bem, o que corrigir e um foco para a próxima semana. Seja justa: reconheça o progresso." },
      ],
    });
  },

  async shoppingList(p) {
    const plan = p.plan || {};
    const meals = Array.isArray(plan.meals) ? plan.meals.slice(0, 8).map((m) => ({ nome: s(m.name, 40), opcoes: list(m.options?.map?.((o) => o.text) || m.suggestions, 4) })) : [];
    if (!meals.length) throw Object.assign(new Error("Gere um plano alimentar primeiro"), { status: 400 });
    return callGroq({
      models: TEXT_MODELS, temperature: 0.2, maxTokens: 1500,
      messages: [
        { role: "system", content: `${PERSONA} Responda APENAS com JSON: {"items": [{"name": string, "category": string}]}.` },
        { role: "user", content:
          `Plano alimentar (as opções se revezam ao longo dos 7 dias): ${JSON.stringify(meals)}\nRestrições: ${list(p.profile?.restrictions).join(", ") || "nenhuma"}\n` +
          "Gere a lista de compras para 1 semana para 1 pessoa. Itens sem repetição, nome curto + quantidade aproximada (ex: 'Ovos — 2 dúzias'). " +
          "Categorias: Hortifruti, Proteínas, Laticínios, Grãos e Cereais, Mercearia, Outros." },
      ],
    });
  },

  async recipes(p) {
    const mode = p.mode === "pantry" ? "pantry" : "plan";
    const pantry = list(p.pantry, 60);
    if (mode === "pantry" && !pantry.length) throw Object.assign(new Error("Adicione ingredientes na despensa"), { status: 400 });
    const planMeals = Array.isArray(p.plan?.meals) ? p.plan.meals.slice(0, 6).map((m) => s(m.name, 30) + ": " + list(m.options?.map?.((o) => o.text) || m.suggestions, 3).join(" / ")) : [];
    const avoid = list(p.avoid, 20);
    return callGroq({
      models: TEXT_MODELS, temperature: 0.7, maxTokens: 3500,
      messages: [
        { role: "system", content: `${PERSONA} Você também é chef de cozinha saudável e prática.` },
        { role: "user", content:
          (mode === "pantry"
            ? `Crie 4 receitas usando principalmente estes ingredientes que o usuário TEM em casa: ${pantry.join(", ")}. Pode assumir itens básicos (sal, azeite, temperos, alho, cebola).\n`
            : `Crie 4 receitas que encaixem neste plano alimentar: ${planMeals.join(" | ") || "alimentação equilibrada"}.\n`) +
          `Perfil:\n${profileText(p.profile)}\n` +
          (avoid.length ? `Não repita estas receitas: ${avoid.join(", ")}.\n` : "") +
          "Varie os tipos de refeição. Valores nutricionais POR PORÇÃO, com ingredientes em quantidades (g/ml/colheres).\n" +
          'Responda APENAS com JSON: {"recipes": [{"name": string, "mealType": "Café da Manhã"|"Almoço"|"Lanche"|"Jantar", "prepTime": string, "difficulty": "Fácil"|"Médio"|"Difícil", ' +
          '"servings": number, "calories": number, "protein": number, "carbs": number, "fat": number, "description": string, "ingredients": [string], "instructions": [string], "tip": string}]}' },
      ],
    });
  },
};

// ---------- handler ----------
export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.has("foods")) {
      return new Response(JSON.stringify({ foods: ALL_FOODS }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=86400" } });
    }
    return json(200, { ok: true, foods: ALL_FOODS.length });
  }
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }
  const task = TASKS[body?.task];
  if (!task) return json(400, { error: "Tarefa desconhecida" });
  try {
    const uid = await verifyUser(req);
    if (!uid) return json(401, { error: "Faça login novamente para usar a IA." });
    if (overLimit(uid)) return json(429, { error: "Você usou muito a IA na última hora. Aguarde um pouco e tente de novo." });
    const result = await task(body.payload || {});
    return json(200, { result });
  } catch (e) {
    console.error("[ai]", body?.task, e);
    return json(e.status || 502, { error: e.status ? e.message : "A IA não conseguiu responder agora. Tente novamente." });
  }
};

export const config = {
  path: "/api/ai",
  // Limite por IP (vale no plano gratuito): no máximo 20 pedidos por minuto
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
