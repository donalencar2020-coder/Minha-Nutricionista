import Groq from "groq-sdk";

const getApiKey = () => {
  const key = process.env.GROQ_API_KEY;
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
    throw new Error("Chave da API Groq não configurada. Por favor, configure GROQ_API_KEY no menu Settings.");
  }
  // dangerouslyAllowBrowser: true é necessário para usar o SDK da Groq diretamente no frontend (React)
  return new Groq({ apiKey, dangerouslyAllowBrowser: true });
};

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
  // Usando o modelo de visão da Groq (Llama 4 Scout)
  const model = "meta-llama/llama-4-scout-17b-16e-instruct";
  
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
          content: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Você não tolera desculpas e foca 100% na saúde e nos objetivos do seu paciente. Retorne APENAS um JSON válido com as chaves: foodName (string), calories (number), protein (number), carbs (number), fat (number), analysis (string)."
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Analise esta imagem de comida. Forneça o nome do alimento, calorias estimadas, proteína (g), carboidratos (g) e gordura (g). \n${contextPrompt}\nSeja direta e firme. Se for saudável, elogie. Se for prejudicial, dê um puxão de orelha severo.` },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("A IA não retornou uma resposta válida.");
    return JSON.parse(content) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Erro na análise do Groq:", error);
    throw new Error(error.message || "Erro desconhecido na análise da imagem.");
  }
}

export async function analyzeFoodText(foodDescription: string, userContext?: any): Promise<FoodAnalysisResult> {
  const groq = getAi();
  // Usando o modelo mais inteligente de texto da Groq
  const model = "llama-3.3-70b-versatile";
  
  const contextPrompt = userContext ? `
    Contexto do Usuário:
    - Objetivo: ${userContext.goal === 'lose_weight' ? 'Perder peso' : userContext.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    - Meta de Calorias: ${userContext.dailyCalorieGoal} kcal
    - Nível de Atividade: ${userContext.activityLevel}
    - Restrições Alimentares: ${userContext.restrictions?.join(', ') || 'Nenhuma'}
  ` : "";

  try {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Você não tolera desculpas e foca 100% na saúde e nos objetivos do seu paciente. Retorne APENAS um JSON válido com as chaves: foodName (string), calories (number), protein (number), carbs (number), fat (number), analysis (string)."
        },
        {
          role: "user",
          content: `O usuário descreveu o que comeu: "${foodDescription}". Forneça o nome do alimento, calorias estimadas, proteína (g), carboidratos (g) e gordura (g). \n${contextPrompt}\nSeja direta e firme. Se for saudável, elogie. Se for prejudicial, dê um puxão de orelha severo.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("A IA não retornou uma resposta válida.");
    return JSON.parse(content) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Erro na análise de texto do Groq:", error);
    throw new Error(error.message || "Erro desconhecido na análise do texto.");
  }
}

export interface DietPlan {
  dailyCalories: number;
  macros: {
    protein: string;
    carbs: string;
    fat: string;
  };
  meals: {
    name: string;
    suggestions: string[];
    time: string;
  }[];
  tips: string[];
}

export async function generateDietPlan(userData: any): Promise<DietPlan> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  
  const prompt = `Com base nos seguintes dados do usuário, gere um plano de dieta saudável estruturado.
  Altura: ${userData.height}cm
  Peso: ${userData.weight}kg
  Idade: ${userData.age}
  Gênero: ${userData.gender === 'male' ? 'Masculino' : userData.gender === 'female' ? 'Feminino' : 'Outro'}
  Nível de Atividade: ${userData.activityLevel}
  Objetivo: ${userData.goal === 'lose_weight' ? 'Perder peso' : userData.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
  Meta de Calorias Diárias: ${userData.dailyCalorieGoal}
  Restrições Alimentares: ${userData.restrictions?.join(', ') || 'Nenhuma'}
  
  Sua voz deve ser a de uma Nutricionista Rigorosa. O plano deve ser eficiente e sem concessões para alimentos vazios.
  
  Retorne APENAS um JSON válido em português com a seguinte estrutura exata:
  {
    "dailyCalories": number,
    "macros": { "protein": "string", "carbs": "string", "fat": "string" },
    "meals": [
      { "name": "Café da Manhã", "suggestions": ["opção 1", "opção 2"], "time": "08:00" }
    ],
    "tips": ["dica 1", "dica 2"]
  }`;

  try {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Você é uma Nutricionista Rigorosa. Você cria planos de dieta focados em resultados reais e disciplina absoluta. Retorne APENAS JSON válido."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("A IA não retornou uma resposta válida para o plano de dieta.");
    return JSON.parse(content) as DietPlan;
  } catch (error: any) {
    console.error("Erro na geração do plano de dieta do Groq:", error);
    throw new Error(error.message || "Erro ao gerar o plano de dieta.");
  }
}

export async function getDailyFeedback(meals: any[], userProfile: any): Promise<string> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  
  const mealsSummary = meals.map(m => `- ${m.foodName}: ${m.calories}kcal, P:${m.protein}g, C:${m.carbs}g, G:${m.fat}g`).join('\n');
  const totalCalories = meals.reduce((acc, m) => acc + m.calories, 0);
  
  const prompt = `
    Como uma Nutricionista Rigorosa, avalie o dia do usuário abaixo.
    
    Objetivo: ${userProfile.goal === 'lose_weight' ? 'Perder peso' : userProfile.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    Meta de Calorias: ${userProfile.dailyCalorieGoal} kcal
    
    Refeições de Hoje:
    ${mealsSummary}
    
    Total Consumido: ${totalCalories} kcal
    
    Dê um feedback curto (máximo 3 frases), direto e firme. 
    Se ele seguiu a meta e comeu bem, elogie a disciplina. 
    Se ele ultrapassou a meta ou comeu porcaria, dê um puxão de orelha severo.
    Foque nos resultados e na saúde.
  `;

  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Você é uma Nutricionista Rigorosa. Você não aceita desculpas e quer ver resultados." },
      { role: "user", content: prompt }
    ],
    temperature: 0.4,
  });

  return response.choices[0]?.message?.content || "Sem feedback por enquanto. Continue registrando.";
}

export async function generateShoppingList(dietPlan: DietPlan, userProfile: any): Promise<string[]> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  
  const sanitizedPlan = {
    meals: (dietPlan.meals || []).map(m => ({ 
      name: m.name || 'Refeição', 
      suggestions: Array.isArray(m.suggestions) ? m.suggestions : [] 
    })),
    tips: Array.isArray(dietPlan.tips) ? dietPlan.tips : []
  };

  const restrictions = Array.isArray(userProfile.restrictions) 
    ? userProfile.restrictions.join(', ') 
    : 'Nenhuma';

  const prompt = `Com base neste plano de dieta e nas restrições do usuário, gere uma lista de compras otimizada e completa.
  
  Plano: ${JSON.stringify(sanitizedPlan)}
  Restrições: ${restrictions}
  
  Retorne APENAS um JSON válido com um array de strings chamado "items". Exemplo: {"items": ["Ovo", "Frango"]}`;

  try {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Você é um assistente que gera listas de compras. Retorne APENAS JSON válido." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    const data = JSON.parse(content);
    return Array.isArray(data.items) ? data.items : [];
  } catch (error: any) {
    console.error("generateShoppingList: Error calling Groq:", error);
    throw error;
  }
}

export interface RecipeIdea {
  name: string;
  description: string;
  difficulty: 'fácil' | 'médio' | 'difícil';
  time: string;
  mealType?: string;
}

export async function generateRecipeIdeas(ingredients: string[], userProfile: any): Promise<RecipeIdea[]> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  const prompt = `O usuário tem os seguintes ingredientes em casa: ${ingredients.join(', ')}.
  Objetivo: ${userProfile.goal}
  Restrições: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Sugira 15 ideias de receitas saudáveis e variadas que ele pode fazer com esses ingredientes. 
  Tente cobrir diferentes categorias (Café da Manhã, Almoço, Sobremesa, Café da Tarde ou Jantar).
  Forneça pelo menos 3 opções para cada categoria de refeição.
  Considere a condição financeira implícita nos ingredientes.
  Retorne APENAS um JSON válido com um array de objetos chamado "ideas".
  Cada objeto deve ter: name (string), description (string), difficulty ("fácil", "médio" ou "difícil"), time (string), mealType (string).`;

  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Você é um chef nutricionista. Retorne APENAS JSON válido." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  const data = JSON.parse(content || "{}");
  return data.ideas || [];
}

export interface FullRecipe {
  name: string;
  ingredients: string[];
  instructions: string[];
  calories: number;
  macros: { protein: number; carbs: number; fat: number };
}

export async function getRecipeDetails(recipeName: string, availableIngredients: string[], userProfile: any): Promise<FullRecipe> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  const prompt = `Forneça a receita completa para "${recipeName}".
  Ingredientes disponíveis: ${availableIngredients.join(', ')}.
  Restrições do usuário: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Retorne APENAS um JSON válido com a estrutura:
  {
    "name": "string",
    "ingredients": ["string"],
    "instructions": ["string"],
    "calories": number,
    "macros": { "protein": number, "carbs": number, "fat": number }
  }`;

  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Você é um chef nutricionista. Retorne APENAS JSON válido." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  return JSON.parse(content || "{}") as FullRecipe;
}

export async function generateGeneralRecipeSuggestions(dietPlan: DietPlan, userProfile: any): Promise<RecipeIdea[]> {
  const groq = getAi();
  const model = "llama-3.3-70b-versatile";
  const prompt = `Com base neste plano de dieta e nas restrições do usuário, sugira 30 receitas saudáveis e variadas (6 para cada categoria abaixo).
  
  CATEGORIAS OBRIGATÓRIAS (mealType):
  - Café da Manhã
  - Almoço
  - Sobremesa
  - Café da Tarde
  - Jantar
  
  Plano: ${JSON.stringify(dietPlan)}
  Restrições: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Retorne APENAS um JSON válido com um array de objetos chamado "ideas".
  Cada objeto deve ter: name (string), description (string), difficulty ("fácil", "médio" ou "difícil"), time (string), mealType (string).`;

  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Você é um chef nutricionista. Retorne APENAS JSON válido." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  const data = JSON.parse(content || "{}");
  return data.ideas || [];
}
