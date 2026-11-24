// NutriTrack — ponte segura para a IA (Groq)
// A chave GROQ_API_KEY fica só aqui, nas variáveis de ambiente do Netlify.
// O navegador nunca vê a chave: ele manda o pedido + o token de login do Firebase,
// esta função confere o login, monta o prompt e chama a Groq.

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyCplq2t8hGXSU771JIoNBaxwet7AYh_biM"; // chave pública do app web (não é segredo)

const TEXT_MODELS = [
  process.env.GROQ_TEXT_MODEL,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
].filter(Boolean);

const VISION_MODELS = [
  process.env.GROQ_VISION_MODEL,
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
].filter(Boolean);

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ---------- utilidades ----------
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const tokenCache = new Map(); // token -> {uid, exp}

async function verifyUser(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.uid;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token }) }
  );
  if (!r.ok) return null;
  const data = await r.json();
  const uid = data?.users?.[0]?.localId;
  if (!uid) return null;
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(token, { uid, exp: Date.now() + 10 * 60 * 1000 });
  return uid;
}

function parseJsonLoose(text) {
  if (!text) throw new Error("Resposta vazia da IA");
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("A IA respondeu num formato inválido");
  }
}

async function callGroq({ models, messages, temperature = 0.3, maxTokens = 2048 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error("GROQ_API_KEY não configurada no Netlify"), { status: 500 });

  // Para cada modelo: tenta com modo JSON; se der 400, tenta sem; se reclamar do "reasoning", tenta sem ele.
  // 404/outros erros -> passa para o próximo modelo da lista.
  let lastErr;
  for (const model of models) {
    const reasoning = model.startsWith("openai/gpt-oss") ? "low" : model.startsWith("qwen/") ? "none" : null;
    const attempts = [
      { jsonMode: true, reasoning },
      { jsonMode: false, reasoning },
      ...(reasoning ? [{ jsonMode: false, reasoning: null }] : []),
    ];
    for (const a of attempts) {
      const body = { model, messages, temperature, max_completion_tokens: maxTokens };
      if (a.jsonMode) body.response_format = { type: "json_object" };
      if (a.reasoning) body.reasoning_effort = a.reasoning;
      let r;
      try {
        r = await fetch(GROQ_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = e;
        break; // erro de rede: tenta o próximo modelo
      }
      if (r.status === 401) {
        throw Object.assign(new Error("A chave da Groq no Netlify é inválida."), { status: 500 });
      }
      if (r.status === 429) {
        throw Object.assign(new Error("Limite de uso da IA atingido. Tente de novo em instantes."), { status: 429 });
      }
      if (!r.ok) {
        const errText = await r.text();
        lastErr = new Error(`Groq ${r.status} (${model}): ${errText.slice(0, 300)}`);
        if (r.status === 400) continue; // tenta a próxima variação para este modelo
        break; // 404 etc.: próximo modelo
      }
      const data = await r.json();
      try {
        return parseJsonLoose(data?.choices?.[0]?.message?.content);
      } catch (e) {
        lastErr = e; // JSON quebrado: tenta a próxima variação
      }
    }
  }
  throw lastErr || new Error("Nenhum modelo da IA respondeu");
}

// ---------- contexto do usuário ----------
const GOALS = { lose_weight: "Perder peso", maintain: "Manter peso", gain_muscle: "Ganhar massa muscular" };
const ACTIVITY = {
  sedentary: "Sedentário", light: "Leve (1-2 dias/sem)", moderate: "Moderado (3-5 dias/sem)",
  active: "Ativo (6-7 dias/sem)", very_active: "Muito ativo (atleta)",
};
const GENDER = { male: "Masculino", female: "Feminino", other: "Outro" };

function s(v, max = 200) { return String(v ?? "").slice(0, max); }
function list(v, max = 40) { return Array.isArray(v) ? v.slice(0, max).map((x) => s(x, 80)) : []; }

function profileText(p = {}) {
  return [
    `Objetivo: ${GOALS[p.goal] || "Manter peso"}`,
    `Meta diária: ${Number(p.dailyCalorieGoal) || 2000} kcal`,
    p.weight ? `Peso: ${Number(p.weight)} kg` : "",
    p.height ? `Altura: ${Number(p.height)} cm` : "",
    p.age ? `Idade: ${Number(p.age)}` : "",
    p.gender ? `Gênero: ${GENDER[p.gender] || s(p.gender, 20)}` : "",
    `Atividade: ${ACTIVITY[p.activityLevel] || "Moderado"}`,
    `Restrições alimentares (PROIBIDO usar): ${list(p.restrictions).join(", ") || "nenhuma"}`,
  ].filter(Boolean).join("\n");
}

const PERSONA =
  "Você é a 'Nutri Rigorosa', uma nutricionista brasileira firme, direta e disciplinada, mas responsável. " +
  "Fale em português do Brasil, de forma curta. Nunca recomende jejum extremo, dietas abaixo de 1200 kcal, " +
  "remédios ou suplementos sem orientação médica. Respeite SEMPRE as restrições alimentares do usuário.";

const MEAL_SCHEMA =
  'Responda APENAS com JSON: {"foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number, "analysis": string}. ' +
  "foodName curto (até 6 palavras). Números inteiros, gramas para macros. analysis com no máximo 3 frases.";

const RECIPE_SCHEMA =
  '{"name": string, "mealType": "Café da Manhã"|"Almoço"|"Lanche"|"Jantar", "prepTime": string, "difficulty": "Fácil"|"Médio"|"Difícil", ' +
  '"servings": number, "calories": number, "protein": number, "carbs": number, "fat": number, "description": string, ' +
  '"ingredients": [string], "instructions": [string], "tip": string}';

// ---------- tarefas ----------
const TASKS = {
  async analyzeImage(p) {
    const image = s(p.image, 1_500_000);
    if (!image.startsWith("data:image/")) throw Object.assign(new Error("Imagem inválida"), { status: 400 });
    const note = s(p.note, 400);
    return callGroq({
      models: VISION_MODELS,
      temperature: 0.1,
      maxTokens: 800,
      messages: [
        { role: "system", content: `${PERSONA} ${MEAL_SCHEMA}` },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identifique o alimento/bebida da foto e estime as porções visíveis, calorias e macros. " +
                "Água ou bebida sem calorias = 0.\n" +
                (note ? `Observação do usuário: ${note}\n` : "") +
                `Perfil:\n${profileText(p.profile)}\n` +
                "Se for uma boa escolha, elogie. Se atrapalhar o objetivo, dê um puxão de orelha firme e sugira uma troca melhor.",
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });
  },

  async analyzeText(p) {
    const text = s(p.text, 1000);
    if (!text.trim()) throw Object.assign(new Error("Descreva a refeição"), { status: 400 });
    return callGroq({
      models: TEXT_MODELS,
      temperature: 0.2,
      maxTokens: 800,
      messages: [
        { role: "system", content: `${PERSONA} ${MEAL_SCHEMA}` },
        {
          role: "user",
          content:
            `Refeição descrita: "${text}"\nEstime calorias e macros com base em porções brasileiras usuais.\n` +
            `Perfil:\n${profileText(p.profile)}\nDê seu feedback sobre a escolha.`,
        },
      ],
    });
  },

  async dietPlan(p) {
    const target = Number(p.profile?.dailyCalorieGoal) || 2000;
    const out = await callGroq({
      models: TEXT_MODELS,
      temperature: 0.4,
      maxTokens: 2500,
      messages: [
        { role: "system", content: `${PERSONA} Você monta planos alimentares práticos, com comida brasileira do dia a dia.` },
        {
          role: "user",
          content:
            `Monte um plano alimentar de 1 dia.\nPerfil:\n${profileText(p.profile)}\n` +
            `O total do dia DEVE somar ${target} kcal (tolerância de 3%). 5 refeições (Café da Manhã, Lanche da Manhã, Almoço, Lanche da Tarde, Jantar). ` +
            "Cada refeição com 2 opções intercambiáveis e com quantidades (ex: '2 ovos mexidos + 1 fatia de pão integral').\n" +
            'Responda APENAS com JSON: {"macros": {"protein": number, "carbs": number, "fat": number}, ' +
            '"meals": [{"name": string, "time": "HH:MM", "calories": number, "suggestions": [string, string]}], "tips": [string, string, string, string]} ' +
            "Macros em gramas por dia.",
        },
      ],
    });
    return { ...out, dailyCalories: target };
  },

  async dailyFeedback(p) {
    const meals = Array.isArray(p.meals) ? p.meals.slice(0, 15).map((m) => ({
      alimento: s(m.foodName, 80), kcal: Number(m.calories) || 0, proteina: Number(m.protein) || 0,
      carbo: Number(m.carbs) || 0, gordura: Number(m.fat) || 0, hora: s(m.time, 5),
    })) : [];
    return callGroq({
      models: TEXT_MODELS,
      temperature: 0.4,
      maxTokens: 400,
      messages: [
        { role: "system", content: `${PERSONA} Responda APENAS com JSON: {"feedback": string}.` },
        {
          role: "user",
          content:
            `Perfil:\n${profileText(p.profile)}\nÁgua hoje: ${Number(p.waterMl) || 0} ml.\n` +
            `Refeições de hoje: ${JSON.stringify(meals)}\n` +
            "Avalie o dia em 1 parágrafo curto (máx. 3 frases): o que está bom, o que corrigir e o que fazer nas próximas refeições.",
        },
      ],
    });
  },

  async shoppingList(p) {
    const plan = p.plan || {};
    const meals = Array.isArray(plan.meals) ? plan.meals.slice(0, 8).map((m) => ({ nome: s(m.name, 40), opcoes: list(m.suggestions, 4) })) : [];
    if (!meals.length) throw Object.assign(new Error("Gere um plano alimentar primeiro"), { status: 400 });
    return callGroq({
      models: TEXT_MODELS,
      temperature: 0.2,
      maxTokens: 1200,
      messages: [
        { role: "system", content: `${PERSONA} Responda APENAS com JSON: {"items": [{"name": string, "category": string}]}.` },
        {
          role: "user",
          content:
            `Plano alimentar: ${JSON.stringify(meals)}\nRestrições: ${list(p.profile?.restrictions).join(", ") || "nenhuma"}\n` +
            "Gere a lista de compras para 1 semana seguindo esse plano. Itens sem repetição, nomes curtos com quantidade aproximada " +
            "(ex: 'Ovos — 2 dúzias'). Categorias: Hortifruti, Proteínas, Laticínios, Grãos e Cereais, Mercearia, Outros.",
        },
      ],
    });
  },

  async recipes(p) {
    const mode = p.mode === "pantry" ? "pantry" : "plan";
    const pantry = list(p.pantry, 60);
    if (mode === "pantry" && !pantry.length) throw Object.assign(new Error("Adicione ingredientes na despensa"), { status: 400 });
    const planMeals = Array.isArray(p.plan?.meals) ? p.plan.meals.slice(0, 6).map((m) => s(m.name, 30) + ": " + list(m.suggestions, 3).join(" / ")) : [];
    const avoid = list(p.avoid, 20);
    return callGroq({
      models: TEXT_MODELS,
      temperature: 0.7,
      maxTokens: 3500,
      messages: [
        { role: "system", content: `${PERSONA} Você também é chef de cozinha saudável e prática.` },
        {
          role: "user",
          content:
            (mode === "pantry"
              ? `Crie 4 receitas usando principalmente estes ingredientes que o usuário TEM em casa: ${pantry.join(", ")}. ` +
                "Pode assumir itens básicos (sal, azeite, temperos, alho, cebola).\n"
              : `Crie 4 receitas que encaixem neste plano alimentar: ${planMeals.join(" | ") || "alimentação equilibrada"}.\n`) +
            `Perfil:\n${profileText(p.profile)}\n` +
            (avoid.length ? `Não repita estas receitas: ${avoid.join(", ")}.\n` : "") +
            "Varie os tipos de refeição. Valores nutricionais POR PORÇÃO.\n" +
            `Responda APENAS com JSON: {"recipes": [${RECIPE_SCHEMA}]}`,
        },
      ],
    });
  },
};

// ---------- handler ----------
export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "Use POST" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const task = TASKS[body?.task];
  if (!task) return json(400, { error: "Tarefa desconhecida" });

  try {
    const uid = await verifyUser(req);
    if (!uid) return json(401, { error: "Faça login novamente para usar a IA." });
    const result = await task(body.payload || {});
    return json(200, { result });
  } catch (e) {
    console.error("[ai]", body?.task, e);
    return json(e.status || 502, { error: e.status ? e.message : "A IA não conseguiu responder agora. Tente novamente." });
  }
};

export const config = { path: "/api/ai" };
