import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { ShoppingCart, Refrigerator, ChefHat, Plus, Trash2, Check, Loader2, BookOpen, UtensilsCrossed, Info, ShieldAlert, Sparkles, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { generateShoppingList, generateRecipeIdeas, getRecipeDetails, generateGeneralRecipeSuggestions, RecipeIdea, FullRecipe } from '../services/gemini';

export function RecipesView({ userProfile }: { userProfile: any }) {
  const [shoppingList, setShoppingList] = useState<{ name: string; checked: boolean }[]>([]);
  const [pantry, setPantry] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [recipeIdeas, setRecipeIdeas] = useState<RecipeIdea[]>([]);
  const [generalSuggestions, setGeneralSuggestions] = useState<RecipeIdea[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<FullRecipe | null>(null);
  const [loadingShopping, setLoadingShopping] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [shoppingError, setShoppingError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'shopping' | 'pantry' | 'recipes'>('shopping');

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen to shopping list
    const unsubShopping = onSnapshot(doc(db, 'shoppingLists', auth.currentUser.uid), (docSnap) => {
      console.log('Shopping list snapshot received:', docSnap.exists() ? 'exists' : 'does not exist');
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('Shopping list items:', data.items);
        // Handle both old (string[]) and new ({name, checked}[]) formats for migration
        const items = (data.items || []).map((item: any) => 
          typeof item === 'string' ? { name: item, checked: false } : item
        );
        setShoppingList(items);
      } else {
        setShoppingList([]);
      }
    }, (error) => {
      console.error('Shopping list listener error:', error);
      handleFirestoreError(error, OperationType.GET, `shoppingLists/${auth.currentUser?.uid}`);
    });

    // Listen to pantry
    const unsubPantry = onSnapshot(doc(db, 'pantry', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setPantry(docSnap.data().ingredients || []);
      } else {
        setPantry([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `pantry/${auth.currentUser?.uid}`);
    });

    return () => {
      unsubShopping();
      unsubPantry();
    };
  }, [auth.currentUser?.uid]);

  const handleGenerateShoppingList = async () => {
    if (!auth.currentUser) {
      console.warn('handleGenerateShoppingList: No user logged in');
      return;
    }
    console.log('handleGenerateShoppingList: Starting generation...');
    setLoadingShopping(true);
    setShoppingError(null);
    try {
      // Get latest diet plan
      const q = query(
        collection(db, 'dietPlans'),
        where('uid', '==', auth.currentUser.uid)
      );
      console.log('handleGenerateShoppingList: Fetching latest diet plan...');
      const planSnap = await getDocs(q);
      if (planSnap.empty) {
        console.warn('handleGenerateShoppingList: No diet plan found');
        setShoppingError('Gere um plano de dieta primeiro na aba "Plano"!');
        setLoadingShopping(false);
        return;
      }

      // Sort plans by createdAt, handling potential missing or invalid dates
      const plans = planSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const getTime = (dateStr: any) => {
            if (!dateStr) return 0;
            const t = new Date(dateStr).getTime();
            return isNaN(t) ? 0 : t;
          };
          return getTime(b.createdAt) - getTime(a.createdAt);
        });

      const dietPlan = plans[0] as any;
      
      // Check if plan is valid (has meals)
      if (!dietPlan.meals || !Array.isArray(dietPlan.meals) || dietPlan.meals.length === 0) {
        console.warn('handleGenerateShoppingList: Diet plan is empty or in old format');
        setShoppingError('Seu plano de dieta atual está incompleto ou em formato antigo. Por favor, gere um novo plano na aba "Plano" primeiro.');
        setLoadingShopping(false);
        return;
      }

      console.log('handleGenerateShoppingList: Diet plan found, generating items with Gemini...');
      
      const items = await generateShoppingList(dietPlan, userProfile);
      console.log('handleGenerateShoppingList: Gemini returned items:', items);
      
      if (!items || items.length === 0) {
        throw new Error('A IA não retornou nenhum item para a lista.');
      }

      const formattedItems = items.map(name => ({ name, checked: false }));

      // Save to Firestore using UID as doc ID
      console.log('handleGenerateShoppingList: Saving to Firestore...');
      await setDoc(doc(db, 'shoppingLists', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        items: formattedItems,
        updatedAt: new Date().toISOString()
      });
      console.log('handleGenerateShoppingList: Successfully saved to Firestore');
    } catch (error: any) {
      console.error('handleGenerateShoppingList: Error occurred:', error);
      let errorMessage = 'Erro ao gerar lista. Verifique sua conexão e tente novamente.';
      
      if (error.message?.includes('quota')) {
        errorMessage = 'Limite de uso da IA atingido. Tente novamente mais tarde.';
      } else if (error.message?.includes('segurança')) {
        errorMessage = error.message;
      } else if (error.message?.includes('incompleto') || error.message?.includes('formato antigo')) {
        errorMessage = error.message;
      } else if (error.message?.includes('IA não retornou')) {
        errorMessage = error.message;
      }
      
      setShoppingError(errorMessage);
      // Only call handleFirestoreError if it's actually a Firestore error
      if (error.code || error.message?.includes('permission-denied')) {
        handleFirestoreError(error, OperationType.WRITE, 'shoppingLists');
      }
    } finally {
      setLoadingShopping(false);
    }
  };

  const toggleItem = async (index: number) => {
    if (!auth.currentUser) return;
    const newList = [...shoppingList];
    newList[index].checked = !newList[index].checked;
    setShoppingList(newList);

    try {
      await setDoc(doc(db, 'shoppingLists', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        items: newList,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shoppingLists');
    }
  };

  const handleAddIngredient = async () => {
    if (!newIngredient.trim() || !auth.currentUser) return;
    const updatedPantry = [...pantry, newIngredient.trim()];
    setPantry(updatedPantry);
    setNewIngredient('');

    try {
      await setDoc(doc(db, 'pantry', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        ingredients: updatedPantry,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pantry');
    }
  };

  const handleRemoveIngredient = async (index: number) => {
    if (!auth.currentUser) return;
    const updatedPantry = pantry.filter((_, i) => i !== index);
    setPantry(updatedPantry);

    try {
      await setDoc(doc(db, 'pantry', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        ingredients: updatedPantry,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pantry');
    }
  };

  const handleGenerateIdeas = async () => {
    if (pantry.length === 0) {
      alert('Adicione ingredientes à sua despensa primeiro!');
      return;
    }
    setLoadingIdeas(true);
    try {
      const ideas = await generateRecipeIdeas(pantry, userProfile);
      setRecipeIdeas(ideas);
      setActiveSection('recipes');
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'dietPlans');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!auth.currentUser) return;
    setLoadingSuggestions(true);
    try {
      const q = query(
        collection(db, 'dietPlans'),
        where('uid', '==', auth.currentUser.uid)
      );
      const planSnap = await getDocs(q);
      if (planSnap.empty) {
        alert('Gere um plano de dieta primeiro na aba "Plano"!');
        setLoadingSuggestions(false);
        return;
      }
      const plans = planSnap.docs
        .map(d => d.data())
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const dietPlan = plans[0] as any;
      const ideas = await generateGeneralRecipeSuggestions(dietPlan, userProfile);
      setGeneralSuggestions(ideas);
      setActiveSection('recipes');
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'dietPlans');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSelectRecipe = async (idea: RecipeIdea) => {
    setLoadingRecipe(true);
    try {
      const recipe = await getRecipeDetails(idea.name, pantry, userProfile);
      setSelectedRecipe(recipe);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'recipes');
    } finally {
      setLoadingRecipe(false);
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-2xl text-white shadow-lg shadow-slate-200">
              <ChefHat className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-slate-900">Cozinha IA</span>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Receitas & Compras</span>
            </div>
          </h2>
          <p className="text-slate-500 font-medium">Otimize sua alimentação com o que você tem.</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-[2rem] w-full sm:w-fit">
        <button
          onClick={() => setActiveSection('shopping')}
          className={cn(
            "flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-[1.5rem] text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2",
            activeSection === 'shopping' ? "bg-white text-slate-900 shadow-xl" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <ShoppingCart className="w-4 h-4" />
          Compras
        </button>
        <button
          onClick={() => setActiveSection('pantry')}
          className={cn(
            "flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-[1.5rem] text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2",
            activeSection === 'pantry' ? "bg-white text-slate-900 shadow-xl" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Refrigerator className="w-4 h-4" />
          Despensa
        </button>
        <button
          onClick={() => setActiveSection('recipes')}
          className={cn(
            "flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-[1.5rem] text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2",
            activeSection === 'recipes' ? "bg-white text-slate-900 shadow-xl" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <ChefHat className="w-4 h-4" />
          Receitas
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSection === 'shopping' && (
          <motion.div
            key="shopping"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-8">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900">Lista de Compras</h3>
                  <p className="text-sm text-slate-500 font-medium">Baseada no seu plano alimentar atual.</p>
                </div>
                <button
                  onClick={handleGenerateShoppingList}
                  disabled={loadingShopping}
                  className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  {loadingShopping ? (
                    <Loader2 className="w-4 h-4 animate-spin" key="loader" />
                  ) : (
                    <Sparkles className="w-4 h-4" key="icon" />
                  )}
                  <span key="text">Atualizar Lista</span>
                </button>
              </div>

              {shoppingError && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  {shoppingError}
                </div>
              )}

              <div key="shopping-list-container">
                {shoppingList.length > 0 ? (
                  <div key="list-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shoppingList.map((item, i) => (
                      <button
                        key={`item-${i}-${item.name}`}
                        onClick={() => toggleItem(i)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                          item.checked 
                            ? "bg-emerald-50 border-emerald-100 opacity-60" 
                            : "bg-slate-50 border-slate-100 hover:border-orange-200"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                          item.checked 
                            ? "bg-emerald-500 border-emerald-500" 
                            : "border-slate-200 group-hover:border-orange-500"
                        )}>
                          <Check className={cn(
                            "w-3 h-3 transition-all",
                            item.checked ? "text-white" : "text-transparent"
                          )} />
                        </div>
                        <span className={cn(
                          "font-bold transition-all",
                          item.checked ? "text-emerald-700 line-through" : "text-slate-700"
                        )}>
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div key="empty-list" className="py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto">
                      <ShoppingCart className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-medium">Sua lista está vazia. Clique em atualizar para gerar uma.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeSection === 'pantry' && (
          <motion.div
            key="pantry"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-8">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900">Minha Despensa</h3>
                <p className="text-sm text-slate-500 font-medium">Liste o que você comprou ou já tem em casa.</p>
              </div>

              <div className="flex gap-4">
                <input
                  type="text"
                  value={newIngredient}
                  onChange={(e) => setNewIngredient(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddIngredient()}
                  placeholder="Ex: Frango, Batata Doce, Ovos..."
                  className="flex-1 bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900 transition-all"
                />
                <button
                  onClick={handleAddIngredient}
                  className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-slate-800 transition-all"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                {pantry.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-bold text-sm group">
                    {item}
                    <button onClick={() => handleRemoveIngredient(i)} className="text-slate-400 hover:text-white transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {pantry.length === 0 && (
                  <p className="text-slate-400 font-medium py-10 w-full text-center">Sua despensa está vazia.</p>
                )}
              </div>

              {pantry.length > 0 && (
                <button
                  onClick={handleGenerateIdeas}
                  disabled={loadingIdeas}
                  className="w-full bg-orange-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-orange-200 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  {loadingIdeas ? (
                    <Loader2 className="w-6 h-6 animate-spin" key="loader" />
                  ) : (
                    <Sparkles className="w-6 h-6" key="icon" />
                  )}
                  <span key="text">O que posso cozinhar?</span>
                </button>
              )}
            </div>
          </motion.div>
        )}

        {activeSection === 'recipes' && (
          <motion.div
            key="recipes"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={handleGenerateIdeas}
                disabled={loadingIdeas}
                className="group relative bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl text-left hover:border-orange-500 transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Refrigerator className="w-24 h-24 text-slate-900" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
                    <UtensilsCrossed className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Usar minha Despensa</h3>
                    <p className="text-sm text-slate-500 font-medium">Gere receitas com o que você já tem em casa.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-black text-orange-500 uppercase tracking-widest">
                    {loadingIdeas ? (
                      <Loader2 className="w-4 h-4 animate-spin" key="loader" />
                    ) : (
                      <span key="text">Gerar Agora</span>
                    )}
                  </div>
                </div>
              </button>

              <button
                onClick={handleGenerateSuggestions}
                disabled={loadingSuggestions}
                className="group relative bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl text-left hover:border-emerald-500 transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Sparkles className="w-24 h-24 text-slate-900" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Sugestões do Plano</h3>
                    <p className="text-sm text-slate-500 font-medium">Receitas ideais para seguir sua dieta rigorosa.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase tracking-widest">
                    {loadingSuggestions ? (
                      <Loader2 className="w-4 h-4 animate-spin" key="loader" />
                    ) : (
                      <span key="text">Ver Sugestões</span>
                    )}
                  </div>
                </div>
              </button>
            </div>

            {/* Results Section */}
            {(recipeIdeas.length > 0 || generalSuggestions.length > 0) && (
              <div className="space-y-12">
                <div className="flex items-center justify-between px-4">
                  <h3 className="text-2xl font-black text-slate-900">
                    {recipeIdeas.length > 0 ? "Ideias da Despensa" : "Sugestões da Nutri"}
                  </h3>
                  <button 
                    onClick={() => { setRecipeIdeas([]); setGeneralSuggestions([]); }}
                    className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
                  >
                    Limpar Resultados
                  </button>
                </div>

                <div className="space-y-12">
                  {[
                    { title: 'Café da Manhã', type: 'Café da Manhã' },
                    { title: 'Almoço', type: 'Almoço' },
                    { title: 'Sobremesa', type: 'Sobremesa' },
                    { title: 'Café da Tarde', type: 'Café da Tarde' },
                    { title: 'Jantar', type: 'Jantar' }
                  ].map((section) => {
                    const allResults = [...recipeIdeas, ...generalSuggestions];
                    const filtered = allResults.filter(s => s.mealType === section.type);
                    if (filtered.length === 0) return null;
                    
                    return (
                      <div key={section.type} className="space-y-4">
                        <h4 className="px-4 text-lg font-black text-slate-900 flex items-center gap-2">
                          <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                          {section.title}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-4 pb-6">
                          {filtered.map((idea, i) => (
                            <div key={i}>
                              <RecipeCard idea={idea} index={i} onClick={() => handleSelectRecipe(idea)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recipe Detail Modal */}
      <AnimatePresence>
        {selectedRecipe && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRecipe(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
                    <ChefHat className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">{selectedRecipe.name}</h3>
                    <p className="text-sm text-slate-500 font-medium">Receita personalizada pela Nutri Rigorosa</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-10">
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Calorias</span>
                    <span className="text-lg font-black text-slate-900">{selectedRecipe.calories}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prot</span>
                    <span className="text-lg font-black text-emerald-600">{selectedRecipe.macros.protein}g</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Carb</span>
                    <span className="text-lg font-black text-blue-600">{selectedRecipe.macros.carbs}g</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gord</span>
                    <span className="text-lg font-black text-orange-600">{selectedRecipe.macros.fat}g</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-orange-500" />
                    Ingredientes
                  </h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedRecipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-slate-600 font-medium p-3 bg-slate-50 rounded-xl">
                        <div className="w-2 h-2 bg-orange-500 rounded-full" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-orange-500" />
                    Modo de Preparo
                  </h4>
                  <div className="space-y-6">
                    {selectedRecipe.instructions.map((step, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0 font-black text-sm">
                          {i + 1}
                        </div>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed pt-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[2rem] p-6 text-white space-y-3">
                  <div className="flex items-center gap-2 text-orange-500">
                    <ShieldAlert className="w-5 h-5" />
                    <span className="font-black text-sm uppercase tracking-widest">Aviso da Nutri</span>
                  </div>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">
                    Esta receita foi ajustada para suas restrições e objetivos. Não adicione ingredientes extras sem necessidade. A disciplina na cozinha é o que separa quem tem resultados de quem apenas tenta.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Recipe Overlay */}
      <AnimatePresence>
        {loadingRecipe && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-orange-500 rounded-full border-t-transparent animate-spin" />
                <ChefHat className="absolute inset-0 m-auto w-8 h-8 text-slate-900" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-black text-slate-900">Montando sua Receita...</p>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest">Nutri Rigorosa em Ação</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecipeCard({ idea, index, onClick }: { idea: RecipeIdea; index: number; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={onClick}
      className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 border border-slate-100 shadow-xl space-y-4 sm:space-y-6 cursor-pointer hover:border-orange-500 transition-all group h-full flex flex-col"
    >
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900 group-hover:bg-orange-500 group-hover:text-white transition-all">
          <BookOpen className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        {idea.mealType && (
          <span className="px-2 sm:px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
            {idea.mealType}
          </span>
        )}
      </div>
      <div className="space-y-1 sm:space-y-2 flex-1">
        <h4 className="text-base sm:text-lg font-black text-slate-900 line-clamp-1">{idea.name}</h4>
        <p className="text-xs sm:text-sm text-slate-500 font-medium line-clamp-2">{idea.description}</p>
      </div>
      <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-slate-50">
        <div className="flex items-center gap-2 text-[9px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
          <Loader2 className="w-3 h-3" />
          {idea.difficulty}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
          <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
          {idea.time}
        </div>
      </div>
    </motion.div>
  );
}
