import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { generateDietPlan, DietPlan } from '../services/gemini';
import { 
  ClipboardList, 
  Sparkles, 
  Loader2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  ChevronRight,
  Flame,
  Zap,
  Info,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function DietPlanView({ userProfile }: { userProfile: any }) {
  console.log('DietPlanView: Rendering with profile:', !!userProfile);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'dietPlans'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const planData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPlans(planData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dietPlans');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const handleGeneratePlan = async () => {
    console.log('DietPlanView: handleGeneratePlan called');
    if (!auth.currentUser) {
      console.warn('DietPlanView: No current user');
      return;
    }
    if (!userProfile) {
      console.warn('DietPlanView: No user profile');
      return;
    }
    
    setGenerating(true);
    setError(null);
    console.log('DietPlanView: Generating plan for profile:', JSON.stringify(userProfile));

    try {
      const planData = await generateDietPlan(userProfile);
      console.log('DietPlanView: Plan generated successfully:', JSON.stringify(planData));
      
      await addDoc(collection(db, 'dietPlans'), {
        uid: auth.currentUser.uid,
        ...planData,
        createdAt: new Date().toISOString(),
      });
      console.log('DietPlanView: Plan saved to Firestore');
    } catch (err: any) {
      console.error('DietPlanView: Error generating or saving plan:', err);
      // If it's a Gemini error, it might not be a Firestore error
      if (err.message && (err.message.includes('quota') || err.message.includes('SAFETY') || err.message.includes('IA'))) {
        setError(`Erro da IA: ${err.message}`);
      } else {
        setError(`Erro ao salvar plano: ${err.message}`);
        handleFirestoreError(err, OperationType.WRITE, 'dietPlans');
      }
    } finally {
      setGenerating(false);
    }
  };

  const latestPlan = plans[0] as (DietPlan & { createdAt: string, plan?: string }) | undefined;

  // Check if the plan is in the old format (just a string)
  const isOldFormat = latestPlan && latestPlan.plan && !latestPlan.meals;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-2xl text-white shadow-lg shadow-slate-200">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-slate-900">Plano Alimentar</span>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Estratégia Nutri Rigorosa</span>
            </div>
          </h2>
          <p className="text-slate-500 font-medium">Estratégia nutricional personalizada para seu objetivo.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <button
            id="generate-plan-header-btn"
            onClick={handleGeneratePlan}
            disabled={generating}
            className="relative group overflow-hidden px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
          >
            {generating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 text-orange-400 group-hover:scale-125 transition-transform" />
            )}
            <span>{latestPlan ? 'Novo Plano' : 'Criar Meu Plano'}</span>
          </button>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 text-red-500 text-xs font-bold bg-red-50 p-4 rounded-2xl border border-red-100 max-w-xs shadow-lg"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Erro na Estratégia</span>
              </div>
              <p className="font-medium text-[10px] leading-tight opacity-80">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="mt-1 text-[9px] uppercase tracking-widest bg-red-100 px-2 py-1 rounded-lg hover:bg-red-200 transition-colors w-fit"
              >
                Limpar
              </button>
            </motion.div>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
          <p className="text-slate-400 font-bold animate-pulse">Carregando seus planos...</p>
        </div>
      ) : !latestPlan || isOldFormat ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-16 bg-white rounded-[3rem] shadow-2xl border border-slate-100 space-y-8"
        >
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping" />
            <div className="relative w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-orange-500" />
            </div>
          </div>
          <div className="space-y-3 max-w-sm mx-auto">
            <h3 className="text-2xl font-black text-slate-900">
              {isOldFormat ? 'Formato de plano antigo detectado' : 'Sua jornada começa aqui'}
            </h3>
            <p className="text-slate-500 leading-relaxed">
              {isOldFormat 
                ? 'Atualizamos nosso sistema para planos mais detalhados. Por favor, gere um novo plano para ver os detalhes.' 
                : 'Nossa IA analisará seu perfil físico e metas para criar um plano alimentar otimizado e realista.'}
            </p>
            <button
              id="generate-plan-empty-btn"
              onClick={handleGeneratePlan}
              disabled={generating}
              className="mt-4 px-8 py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 flex items-center gap-3 mx-auto"
            >
              {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              <span>{isOldFormat ? 'Gerar Novo Plano' : 'Criar Meu Plano Agora'}</span>
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar Stats */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl space-y-8 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl" />
              
              <div className="space-y-2">
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Meta Diária</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black">{latestPlan.dailyCalories}</span>
                  <span className="text-orange-400 font-bold">kcal</span>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Distribuição de Macros</p>
                <div className="space-y-3">
                  <MacroItem label="Proteína" value={latestPlan.macros.protein} color="bg-orange-500" />
                  <MacroItem label="Carbos" value={latestPlan.macros.carbs} color="bg-blue-500" />
                  <MacroItem label="Gorduras" value={latestPlan.macros.fat} color="bg-emerald-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl space-y-6">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-slate-900" />
                Regras da Nutri
              </h4>
              <ul className="space-y-4">
                {latestPlan.tips.map((tip, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-600 leading-relaxed">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Main Plan Content */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between px-4">
              <h3 className="text-2xl font-black text-slate-900">Estrutura de Refeições</h3>
              <div className="flex items-center gap-2 text-slate-400 text-sm font-bold">
                <Calendar className="w-4 h-4" />
                {new Date(latestPlan.createdAt).toLocaleDateString('pt-BR')}
              </div>
            </div>

            <div className="space-y-4">
              {latestPlan.meals.map((meal, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className="group bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-orange-100 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-5">
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-orange-500 uppercase tracking-tighter">{meal.time}</span>
                          <h4 className="text-xl font-black text-slate-900">{meal.name}</h4>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {meal.suggestions.map((sug, j) => (
                            <span key={j} className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-bold rounded-full border border-slate-100">
                              {sug}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Footer with debug info */}
      <footer className="pt-12 pb-6 text-center">
        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] opacity-50">
          NutriTrack AI v1.0 • {process.env.GROQ_API_KEY ? 'IA Ativa' : 'IA Offline'}
        </p>
      </footer>
    </div>
  );
}

function MacroItem({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span>{label}</span>
        <span className="text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          className={`h-full ${color}`} 
        />
      </div>
    </div>
  );
}
