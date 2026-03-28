import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Flame, Utensils, TrendingUp, Calendar, ArrowRight, Target, Zap, Loader2 as LoaderIcon, MessageSquareQuote, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getDailyFeedback } from '../services/gemini';
import { cn } from '../lib/utils';

export function Dashboard({ userProfile }: { userProfile: any }) {
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [dailyFeedback, setDailyFeedback] = useState<string | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'meals'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mealData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setMeals(mealData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const todayMeals = meals.filter(m => isToday(new Date(m.timestamp)));
    if (todayMeals.length > 0 && userProfile) {
      const fetchFeedback = async () => {
        setLoadingFeedback(true);
        try {
          const feedback = await getDailyFeedback(todayMeals, userProfile);
          setDailyFeedback(feedback);
        } catch (error) {
          console.error("Erro ao buscar feedback:", error);
        } finally {
          setLoadingFeedback(false);
        }
      };
      fetchFeedback();
    } else {
      setDailyFeedback(null);
    }
  }, [meals, userProfile]);

  const todayMeals = meals.filter(m => isToday(new Date(m.timestamp)));
  const consumedCalories = todayMeals.reduce((acc, m) => acc + (m.calories || 0), 0);
  const calorieGoal = userProfile?.dailyCalorieGoal || 2000;
  const remainingCalories = Math.max(0, calorieGoal - consumedCalories);
  const progress = Math.min(100, (consumedCalories / calorieGoal) * 100);

  return (
    <div className="space-y-10 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            Olá, {userProfile?.name?.split(' ')[0]}! 👋
          </h2>
          <p className="text-slate-500 font-medium">Aqui está o seu resumo nutricional de hoje.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl border border-slate-100 shadow-sm text-sm font-bold text-slate-500">
          <Calendar className="w-4 h-4 text-orange-500" />
          {format(new Date(), "d 'de' MMMM", { locale: ptBR })}
        </div>
      </header>

      {/* Main Stats Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calorie Progress Card */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/20 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-orange-500/30 transition-colors duration-700" />
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Calorias Consumidas</p>
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-7xl font-black tracking-tighter">{consumedCalories}</h3>
                    <span className="text-2xl text-orange-400 font-bold">kcal</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-sm font-black uppercase tracking-tighter">
                    <span className="text-slate-400">Progresso da Meta</span>
                    <span className="text-white">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-4 bg-white/10 rounded-full overflow-hidden p-1">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.4)]"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-orange-400" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Meta: {calorieGoal} kcal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Restam: {remainingCalories} kcal</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden md:flex justify-center">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="transparent"
                      className="text-white/5"
                    />
                    <motion.circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="transparent"
                      strokeDasharray={553}
                      initial={{ strokeDashoffset: 553 }}
                      animate={{ strokeDashoffset: 553 - (553 * progress) / 100 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="text-orange-500"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Flame className="w-10 h-10 text-orange-500 mb-1" />
                    <span className="text-2xl font-black">{Math.round(progress)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rigid Nutritionist Feedback Card */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <MessageSquareQuote className="w-24 h-24 text-slate-900" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Status da Nutri Rigorosa</h4>
              </div>
              
              <div className="min-h-[80px] flex items-center">
                {loadingFeedback ? (
                  <div className="flex items-center gap-3 text-slate-400 font-bold animate-pulse">
                    <LoaderIcon className="w-5 h-5 animate-spin" />
                    Analisando seu comportamento...
                  </div>
                ) : dailyFeedback ? (
                  <p className="text-slate-700 font-medium leading-relaxed italic text-lg">
                    "{dailyFeedback}"
                  </p>
                ) : (
                  <p className="text-slate-400 font-medium italic">
                    Registre sua primeira refeição para receber meu feedback. Não me faça esperar.
                  </p>
                )}
              </div>

              {dailyFeedback && (
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-1 flex-grow bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: progress > 100 ? '100%' : `${progress}%` }}
                      className={cn(
                        "h-full rounded-full",
                        progress > 100 ? "bg-red-500" : progress > 80 ? "bg-emerald-500" : "bg-orange-500"
                      )}
                    />
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    progress > 100 ? "text-red-500" : "text-slate-400"
                  )}>
                    {progress > 100 ? 'Limite Excedido!' : 'Dentro da Meta'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Column */}
        <div className="lg:col-span-1 grid grid-cols-2 lg:grid-cols-1 gap-4">
          <StatCard 
            icon={<Utensils className="text-orange-500" />} 
            label="Refeições" 
            value={todayMeals.length.toString()} 
            color="bg-white"
          />
          <StatCard 
            icon={<TrendingUp className="text-emerald-500" />} 
            label="Proteína Total" 
            value={`${todayMeals.reduce((acc, m) => acc + (m.protein || 0), 0)}g`} 
            color="bg-white"
          />
          <StatCard 
            icon={<Zap className="text-blue-500" />} 
            label="Carbos" 
            value={`${todayMeals.reduce((acc, m) => acc + (m.carbs || 0), 0)}g`} 
            color="bg-white"
          />
          <StatCard 
            icon={<Flame className="text-purple-500" />} 
            label="Gorduras" 
            value={`${todayMeals.reduce((acc, m) => acc + (m.fat || 0), 0)}g`} 
            color="bg-white"
          />
        </div>
      </div>

      {/* Recent Activity Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
              <Utensils className="w-5 h-5" />
            </div>
            Refeições Recentes
          </h3>
          <button className="text-sm font-bold text-orange-600 flex items-center gap-1 hover:gap-2 transition-all">
            Ver tudo <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        
        {loading ? (
          <div className="flex justify-center p-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          </div>
        ) : meals.length === 0 ? (
          <div className="text-center p-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Utensils className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold">Nenhuma refeição registrada ainda.</p>
            <p className="text-slate-300 text-sm">Comece analisando seu primeiro prato!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {meals.slice(0, 4).map((meal, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={meal.id} 
                onClick={() => setSelectedMeal(meal)}
                className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-50 flex items-center gap-6 hover:shadow-xl hover:border-orange-100 transition-all group cursor-pointer"
              >
                <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-slate-100 flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-500">
                  <img src={meal.imageUrl} alt={meal.foodName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-grow min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter bg-orange-50 px-2 py-0.5 rounded-full">
                      {format(new Date(meal.timestamp), "HH:mm", { locale: ptBR })}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {format(new Date(meal.timestamp), "d 'de' MMM", { locale: ptBR })}
                    </span>
                  </div>
                  <h4 className="text-xl font-black text-slate-900 truncate group-hover:text-orange-600 transition-colors">{meal.foodName}</h4>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-900">{meal.calories}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">kcal</span>
                    </div>
                    <div className="w-1 h-1 bg-slate-200 rounded-full" />
                    <div className="flex gap-2">
                      <MacroTag label="P" value={`${meal.protein}g`} />
                      <MacroTag label="C" value={`${meal.carbs}g`} />
                    </div>
                  </div>
                </div>
                <div 
                  className="p-3 bg-slate-50 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-colors"
                >
                  <ArrowRight className="w-5 h-5" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Meal Details Modal */}
      <AnimatePresence>
        {selectedMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="relative h-64">
                <img src={selectedMeal.imageUrl} alt={selectedMeal.foodName} className="w-full h-full object-cover" />
                <button 
                  onClick={() => setSelectedMeal(null)}
                  className="absolute top-6 right-6 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-colors"
                >
                  <ArrowRight className="w-6 h-6 rotate-180" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-900 to-transparent text-white">
                  <h3 className="text-3xl font-black">{selectedMeal.foodName}</h3>
                  <p className="text-sm font-bold text-white/60 uppercase tracking-widest">
                    {format(new Date(selectedMeal.timestamp), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Calorias</p>
                    <p className="text-4xl font-black text-slate-900">{selectedMeal.calories} <span className="text-sm font-bold text-slate-400">kcal</span></p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Proteínas</p>
                    <p className="text-4xl font-black text-slate-900">{selectedMeal.protein} <span className="text-sm font-bold text-slate-400">g</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Carboidratos</p>
                    <p className="text-4xl font-black text-slate-900">{selectedMeal.carbs} <span className="text-sm font-bold text-slate-400">g</span></p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Gorduras</p>
                    <p className="text-4xl font-black text-slate-900">{selectedMeal.fat} <span className="text-sm font-bold text-slate-400">g</span></p>
                  </div>
                </div>

                <div className="p-6 bg-orange-50 rounded-[2rem] border border-orange-100 space-y-2">
                  <div className="flex items-center gap-2 text-orange-600 font-black text-sm uppercase tracking-widest">
                    <Zap className="w-4 h-4" />
                    Análise da IA
                  </div>
                  <p className="text-slate-700 font-medium leading-relaxed italic">
                    "{selectedMeal.analysis}"
                  </p>
                </div>

                <button
                  onClick={() => setSelectedMeal(null)}
                  className="w-full py-5 bg-slate-900 text-white font-black rounded-[2rem] hover:bg-slate-800 transition-all"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div className={`${color} p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all flex items-center gap-5`}>
      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center shadow-inner">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900 tracking-tighter">{value}</p>
      </div>
    </div>
  );
}

function MacroTag({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-black text-slate-300 uppercase">{label}</span>
      <span className="text-xs font-bold text-slate-600">{value}</span>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <Zap className={`${className} animate-pulse`} />;
}
