import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY is not defined in the environment.");
  }
  return key || "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export interface FoodAnalysisResult {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  analysis: string;
}

export async function analyzeFoodImage(base64Image: string, userContext?: any): Promise<FoodAnalysisResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Chave da API Gemini não configurada. Por favor, configure GEMINI_API_KEY.");
  
  const model = "gemini-3-flash-preview";
  
  const contextPrompt = userContext ? `
    Contexto do Usuário:
    - Objetivo: ${userContext.goal === 'lose_weight' ? 'Perder peso' : userContext.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    - Meta de Calorias: ${userContext.dailyCalorieGoal} kcal
    - Nível de Atividade: ${userContext.activityLevel}
    - Restrições Alimentares: ${userContext.restrictions?.join(', ') || 'Nenhuma'}
  ` : "";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(',')[1] || base64Image,
              },
            },
            {
              text: `Analise esta imagem de comida. Forneça o nome do alimento, calorias estimadas, proteína (g), carboidratos (g) e gordura (g). 
              ${contextPrompt}
              
              Sua análise deve ser a de uma Nutricionista Rigorosa e Altamente Profissional. 
              Seja direta, firme e disciplinada. 
              Se o alimento for saudável e ajudar no objetivo do usuário, elogie a disciplina. 
              Se for prejudicial (açúcar, fritura, ultraprocessados, excesso de calorias para o objetivo), dê um "puxão de orelha" severo e explique o porquê.
              Não use rodeios. Retorne APENAS JSON em português.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Você não tolera desculpas e foca 100% na saúde e nos objetivos do seu paciente.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodName: { type: Type.STRING, description: "Nome do alimento em português" },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fat: { type: Type.NUMBER },
            analysis: { type: Type.STRING, description: "Análise rigorosa da nutricionista em português" },
          },
          required: ["foodName", "calories", "protein", "carbs", "fat", "analysis"],
        },
      },
    });

    if (!response.text) throw new Error("A IA não retornou uma resposta válida.");
    return JSON.parse(response.text) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Erro na análise do Gemini:", error);
    throw new Error(error.message || "Erro desconhecido na análise da imagem.");
  }
}

export async function analyzeFoodText(foodDescription: string, userContext?: any): Promise<FoodAnalysisResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Chave da API Gemini não configurada. Por favor, configure GEMINI_API_KEY.");

  const model = "gemini-3-flash-preview";
  
  const contextPrompt = userContext ? `
    Contexto do Usuário:
    - Objetivo: ${userContext.goal === 'lose_weight' ? 'Perder peso' : userContext.goal === 'gain_muscle' ? 'Ganhar massa' : 'Manter peso'}
    - Meta de Calorias: ${userContext.dailyCalorieGoal} kcal
    - Nível de Atividade: ${userContext.activityLevel}
    - Restrições Alimentares: ${userContext.restrictions?.join(', ') || 'Nenhuma'}
  ` : "";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `O usuário descreveu o que comeu: "${foodDescription}". Forneça o nome do alimento, calorias estimadas, proteína (g), carboidratos (g) e gordura (g). 
      ${contextPrompt}
      
      Sua análise deve ser a de uma Nutricionista Rigorosa e Altamente Profissional. 
      Seja direta, firme e disciplinada. 
      Se o alimento for saudável e ajudar no objetivo do usuário, elogie a disciplina. 
      Se for prejudicial, dê um "puxão de orelha" severo.
      Retorne APENAS JSON em português.`,
      config: {
        systemInstruction: "Você é uma Nutricionista Rigorosa. Sua voz é firme, disciplinada e sem rodeios. Você não tolera desculpas e foca 100% na saúde e nos objetivos do seu paciente.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodName: { type: Type.STRING, description: "Nome do alimento em português" },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fat: { type: Type.NUMBER },
            analysis: { type: Type.STRING, description: "Análise rigorosa da nutricionista em português" },
          },
          required: ["foodName", "calories", "protein", "carbs", "fat", "analysis"],
        },
      },
    });

    if (!response.text) throw new Error("A IA não retornou uma resposta válida.");
    return JSON.parse(response.text) as FoodAnalysisResult;
  } catch (error: any) {
    console.error("Erro na análise de texto do Gemini:", error);
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
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Chave da API Gemini não configurada. Por favor, configure GEMINI_API_KEY.");

  const model = "gemini-3-flash-preview";
  
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
  
  Retorne APENAS um JSON em português com a seguinte estrutura:
  {
    "dailyCalories": number,
    "macros": { "protein": "string", "carbs": "string", "fat": "string" },
    "meals": [
      { "name": "Café da Manhã", "suggestions": ["opção 1", "opção 2"], "time": "08:00" },
      ... (inclua Almoço, Jantar e Lanches)
    ],
    "tips": ["dica 1", "dica 2"]
  }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: "Você é uma Nutricionista Rigorosa. Você cria planos de dieta focados em resultados reais e disciplina absoluta.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dailyCalories: { type: Type.NUMBER },
            macros: {
              type: Type.OBJECT,
              properties: {
                protein: { type: Type.STRING },
                carbs: { type: Type.STRING },
                fat: { type: Type.STRING },
              },
              required: ["protein", "carbs", "fat"],
            },
            meals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  time: { type: Type.STRING },
                },
                required: ["name", "suggestions", "time"],
              },
            },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["dailyCalories", "macros", "meals", "tips"],
        },
      },
    });

    if (!response.text) throw new Error("A IA não retornou uma resposta válida para o plano de dieta.");
    return JSON.parse(response.text) as DietPlan;
  } catch (error: any) {
    console.error("Erro na geração do plano de dieta do Gemini:", error);
    throw new Error(error.message || "Erro ao gerar o plano de dieta.");
  }
}

export async function getDailyFeedback(meals: any[], userProfile: any): Promise<string> {
  const model = "gemini-3-flash-preview";
  
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

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "Você é uma Nutricionista Rigorosa. Você não aceita desculpas e quer ver resultados.",
    },
  });

  return response.text || "Sem feedback por enquanto. Continue registrando.";
}

export async function generateShoppingList(dietPlan: DietPlan, userProfile: any): Promise<string[]> {
  const model = "gemini-3-flash-preview";
  
  // Sanitize dietPlan to only include necessary info for shopping list
  // Ensure meals and tips are arrays to avoid stringify issues
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
  
  Retorne APENAS um JSON com um array de strings chamado "items".`;

  console.log("generateShoppingList: Calling Gemini with prompt length:", prompt.length);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["items"],
        },
      },
    });

    if (!response.text) {
      console.error("generateShoppingList: Gemini returned empty response");
      return [];
    }

    console.log("generateShoppingList: Gemini response received");
    const data = JSON.parse(response.text);
    return Array.isArray(data.items) ? data.items : [];
  } catch (error: any) {
    console.error("generateShoppingList: Error calling Gemini:", error);
    // Re-throw with a more descriptive message if possible
    if (error.message?.includes('SAFETY')) {
      throw new Error('A IA não pôde gerar a lista devido a filtros de segurança. Tente ajustar seu plano.');
    }
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
  const model = "gemini-3-flash-preview";
  const prompt = `O usuário tem os seguintes ingredientes em casa: ${ingredients.join(', ')}.
  Objetivo: ${userProfile.goal}
  Restrições: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Sugira 15 ideias de receitas saudáveis e variadas que ele pode fazer com esses ingredientes. 
  Tente cobrir diferentes categorias (Café da Manhã, Almoço, Sobremesa, Café da Tarde ou Jantar).
  Forneça pelo menos 3 opções para cada categoria de refeição.
  Considere a condição financeira implícita nos ingredientes (se forem simples, sugira algo prático e barato).
  Retorne APENAS um JSON com um array de objetos chamado "ideas".`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ideas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ['fácil', 'médio', 'difícil'] },
                time: { type: Type.STRING },
                mealType: { type: Type.STRING, description: "Tipo de refeição (DEVE SER EXATAMENTE: Café da Manhã, Almoço, Sobremesa, Café da Tarde ou Jantar)" },
              },
              required: ["name", "description", "difficulty", "time", "mealType"],
            },
          },
        },
        required: ["ideas"],
      },
    },
  });

  const data = JSON.parse(response.text || "{}");
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
  const model = "gemini-3-flash-preview";
  const prompt = `Forneça a receita completa para "${recipeName}".
  Ingredientes disponíveis: ${availableIngredients.join(', ')}.
  Restrições do usuário: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Retorne APENAS um JSON com a estrutura da receita.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          calories: { type: Type.NUMBER },
          macros: {
            type: Type.OBJECT,
            properties: {
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fat: { type: Type.NUMBER },
            },
            required: ["protein", "carbs", "fat"],
          },
        },
        required: ["name", "ingredients", "instructions", "calories", "macros"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as FullRecipe;
}

export async function generateGeneralRecipeSuggestions(dietPlan: DietPlan, userProfile: any): Promise<RecipeIdea[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `Com base neste plano de dieta e nas restrições do usuário, sugira 30 receitas saudáveis e variadas (6 para cada categoria abaixo).
  
  CATEGORIAS OBRIGATÓRIAS (mealType):
  - Café da Manhã
  - Almoço
  - Sobremesa
  - Café da Tarde
  - Jantar
  
  Para cada categoria, forneça múltiplas opções para que o usuário possa escolher a que mais lhe agrada no momento.
  
  Plano: ${JSON.stringify(dietPlan)}
  Restrições: ${userProfile.restrictions?.join(', ') || 'Nenhuma'}
  
  Retorne APENAS um JSON com um array de objetos chamado "ideas".`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ideas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ['fácil', 'médio', 'difícil'] },
                time: { type: Type.STRING },
                mealType: { type: Type.STRING, description: "Tipo de refeição (DEVE SER EXATAMENTE: Café da Manhã, Almoço, Sobremesa, Café da Tarde ou Jantar)" },
              },
              required: ["name", "description", "difficulty", "time", "mealType"],
            },
          },
        },
        required: ["ideas"],
      },
    },
  });

  const data = JSON.parse(response.text || "{}");
  return data.ideas || [];
}
