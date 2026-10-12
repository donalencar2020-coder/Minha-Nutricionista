import Groq from "groq-sdk";

// Modelos ativos e suportados na API da Groq
export const GROQ_VISION_MODEL = "qwen/qwen3.8-27b";
export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
export const GROQ_FALLBACK_TEXT_MODEL = "qwen/qwen3.8-27b";

const getApiKey = () => {
  const key = 
    process.env.GROQ_API_KEY || 
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_API_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.GROQ_API_KEY);

  if (!key) {
    console.error("GROQ_API_KEY is not defined in the environment. AI features will fail.");
  } else {
    const maskedKey = key.length > 8 
      ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
      : '***';
    console.log(`GROQ_API_KEY is present (length: ${key.length}, format: ${maskedKey})`);
  }
  return key || "";
};

const getAi = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Chave da API Groq não configurada. Por favor, configure GROQ_API_KEY ou VITE_GROQ_API_KEY no painel de variáveis de ambiente do Netlify.");
  }
  return new Groq({ apiKey, dangerouslyAllowBrowser: true });
};

async function executeTextCompletion(messages: any[], temperature = 0.2): Promise<string> {
  const groq = getAi();
  try {
    const response = await groq.chat.completions.create({
      model: GROQ_TEXT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature,
    });
    return response.choices[0]?.message?.content || "";
  } catch (err: any) {
    console.warn(`Erro com modelo ${GROQ_TEXT_MODEL}, tentando fallback com ${GROQ_FALLBACK_TEXT_MODEL}:`, err);
    const fallbackResponse = await groq.chat.completions.create({
      model: GROQ_FALLBACK_TEXT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature,
    });
    return fallbackResponse.choices[0]?.message?.content || "";
  }
}

export interface FoodAnalysisResult {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  analysis: string;
}

export async function analyzeFoodImage(base64Image: string, userContext?: any): Promise<FoodAnalysisResult> {
  const groq = getAi();
  const model = GROQ_VISION_MODEL;
  
  const contextPrompt = userContext ? `
    Contexto do Usuário:
    - Objetivo: ${userContext.goal === 'lose_weight' ? 'Perder peso' : userContext.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    - Meta de Calorias: ${userContext.dailyCalorieGoal} kcal
    - Nível de Atividade: ${userContext.activityLevel}
    - Restrições Alimentares: ${userContext.restrictions?.join(', ') || 'Nenhuma'}
  ` : "";

  const imageUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;

  try {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Você não tolera desculpas e foca 100% na saúde e nos objetivos do seu paciente. Retorne APENAS um objeto JSON válido com exatamente estas chaves: foodName (string), calories (number), protein (number), carbs (number), fat (number), analysis (string)."
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Analise esta foto de alimento ou bebida. Identifique o item e estime calorias, proteína (g), carboidratos (g) e gordura (g). Se for água ou item sem calorias, aponte calorias como 0.\n${contextPrompt}\nSeja direta e firme. Se for saudável, elogie. Se for prejudicial, dê um puxão de orelha severo.` },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("A IA não retornou nenhuma análise.");

    return JSON.parse(content) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Groq Vision API Error:", error);
    throw error;
  }
}

export async function analyzeFoodText(description: string, userContext?: any): Promise<FoodAnalysisResult> {
  const contextPrompt = userContext ? `
    Contexto do Usuário:
    - Objetivo: ${userContext.goal === 'lose_weight' ? 'Perder peso' : userContext.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    - Meta de Calorias: ${userContext.dailyCalorieGoal} kcal
    - Nível de Atividade: ${userContext.activityLevel}
    - Restrições Alimentares: ${userContext.restrictions?.join(', ') || 'Nenhuma'}
  ` : "";

  try {
    const content = await executeTextCompletion([
      {
        role: "system",
        content: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Retorne APENAS um objeto JSON válido com exatamente estas chaves: foodName (string), calories (number), protein (number), carbs (number), fat (number), analysis (string)."
      },
      {
        role: "user",
        content: `Analise a seguinte descrição de refeição ou alimento: "${description}". Estime as calorias, proteína (g), carboidratos (g) e gordura (g).\n${contextPrompt}\nSeja direta e rigorosa. Dê seu feedback sobre essa escolha alimentar.`
      }
    ], 0.2);

    if (!content) throw new Error("A IA não retornou resposta para a descrição fornecida.");
    return JSON.parse(content) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Groq Text API Error:", error);
    throw error;
  }
}

export interface DietPlan {
  dailyCalorieTarget: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  meals: {
    name: string;
    time: string;
    suggestions: string[];
    calories: number;
  }[];
  tips: string[];
}

export async function generateDietPlan(userData: any): Promise<DietPlan> {
  const prompt = `Com base nos seguintes dados do usuário, gere um plano de dieta saudável estruturado.
  Altura: ${userData.height}cm
  Peso: ${userData.weight}kg
  Idade: ${userData.age}
  Gênero: ${userData.gender}
  Nível de Atividade: ${userData.activityLevel}
  Objetivo: ${userData.goal}
  Meta de Calorias Diárias: ${userData.dailyCalorieGoal}
  Restrições Alimentares: ${userData.restrictions?.join(', ') || 'Nenhuma'}

  Retorne APENAS um JSON válido no seguinte formato:
  {
    "dailyCalorieTarget": number,
    "macros": { "protein": number, "carbs": number, "fat": number },
    "meals": [
      {
        "name": string,
        "time": string,
        "suggestions": [string],
        "calories": number
      }
    ],
    "tips": [string]
  }`;

  try {
    const content = await executeTextCompletion([
      {
        role: "system",
        content: "Você é um nutricionista profissional. Retorne APENAS um JSON válido com o plano alimentar solicitado, sem textos introdutórios ou conclusivos."
      },
      {
        role: "user",
        content: prompt
      }
    ], 0.3);

    if (!content) throw new Error("A IA não retornou um plano de dieta.");
    return JSON.parse(content) as DietPlan;
  } catch (error) {
    console.error("Groq Diet Plan Error:", error);
    throw error;
  }
}

export async function getDailyFeedback(meals: any[], userGoal: string): Promise<string> {
  const prompt = `O usuário tem o objetivo: ${userGoal}.
  Aqui estão as refeições consumidas hoje:
  ${JSON.stringify(meals)}

  Dê um feedback curto (1 parágrafo), direto, motivador mas rígido, estilo Nutricionista Rigorosa, avaliando o dia alimentar dele. Retorne em formato JSON: { "feedback": string }`;

  try {
    const content = await executeTextCompletion([
      {
        role: "system",
        content: "Você é uma Nutricionista Rigorosa. Retorne apenas JSON no formato: { \"feedback\": string }."
      },
      {
        role: "user",
        content: prompt
      }
    ], 0.3);

    if (!content) return "Mantenha o foco e a disciplina.";
    const parsed = JSON.parse(content);
    return parsed.feedback || "Mantenha o foco!";
  } catch (error) {
    console.error("Groq Daily Feedback Error:", error);
    return "Mantenha o foco nos seus objetivos e hidrate-se bem!";
  }
}

export interface Recipe {
  id?: string;
  name: string;
  prepTime: string;
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ingredients: string[];
  instructions: string[];
  nutritionHighlights: string;
  isAiGenerated?: boolean;
}

export async function generateRecipes(userContext: any, category?: string): Promise<Recipe[]> {
  const categoryText = category ? `para a categoria ${category}` : 'variadas (café da manhã, almoço, jantar e lanche)';
  const prompt = `Gere 4 receitas saudáveis e práticas ${categoryText} adequadas para o perfil:
  Objetivo: ${userContext?.goal || 'manter peso'}
  Restrições: ${userContext?.restrictions?.join(', ') || 'nenhuma'}

  Retorne APENAS um JSON válido com a chave "recipes" contendo um array de 4 receitas. Formato de cada receita:
  {
    "name": string,
    "prepTime": string (ex: "20 min"),
    "difficulty": "Fácil" | "Médio" | "Difícil",
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "category": "breakfast" | "lunch" | "dinner" | "snack",
    "ingredients": [string],
    "instructions": [string],
    "nutritionHighlights": string
  }`;

  try {
    const content = await executeTextCompletion([
      {
        role: "system",
        content: "Você é uma nutricionista e chef especializada em alimentação saudável. Retorne APENAS JSON válido com { \"recipes\": [...] }."
      },
      {
        role: "user",
        content: prompt
      }
    ], 0.4);

    if (!content) return [];
    const parsed = JSON.parse(content);
    return (parsed.recipes || []).map((r: any, idx: number) => ({
      ...r,
      id: `ai-recipe-${Date.now()}-${idx}`,
      isAiGenerated: true,
    }));
  } catch (error) {
    console.error("Groq Generate Recipes Error:", error);
    return [];
  }
}

export async function generateRecipeFromIngredients(ingredients: string[], userContext: any): Promise<Recipe> {
  const prompt = `Crie uma receita saudável aproveitando os seguintes ingredientes: ${ingredients.join(', ')}.
  Perfil do usuário:
  Objetivo: ${userContext?.goal || 'saúde geral'}
  Restrições: ${userContext?.restrictions?.join(', ') || 'nenhuma'}

  Retorne APENAS um JSON válido com exatamente esta estrutura:
  {
    "name": string,
    "prepTime": string (ex: "25 min"),
    "difficulty": "Fácil" | "Médio" | "Difícil",
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "category": "breakfast" | "lunch" | "dinner" | "snack",
    "ingredients": [string],
    "instructions": [string],
    "nutritionHighlights": string
  }`;

  try {
    const content = await executeTextCompletion([
      {
        role: "system",
        content: "Você é uma nutricionista criativa. Retorne APENAS JSON válido com a receita solicitada."
      },
      {
        role: "user",
        content: prompt
      }
    ], 0.3);

    if (!content) throw new Error("Não foi possível gerar a receita com os ingredientes informados.");
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      id: `custom-recipe-${Date.now()}`,
      isAiGenerated: true,
    };
  } catch (error) {
    console.error("Groq Recipe From Ingredients Error:", error);
    throw error;
  }
}
