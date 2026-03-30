import { useState, useEffect, useMemo } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { format, isToday, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Flame, Utensils, TrendingUp, Calendar, ArrowRight, Target, Zap, Loader2 as LoaderIcon, MessageSquareQuote, ShieldAlert, CheckCircle2, Trash2, Edit2, Save, X, Droplets, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getDailyFeedback } from '../services/gemini';
import { cn } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function Dashboard({ userProfile }: { userProfile: any }) {
  const [meals, setMeals] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [dailyFeedback, setDailyFeedback] = useState<string | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [isEditingMeal, setIsEditingMeal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qMeals = query(
      collection(db, 'meals'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribeMeals = onSnapshot(qMeals, (snapshot) => {
      const mealData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setMeals(mealData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
    });

    const qWater = query(
      collection(db, 'waterLogs'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribeWater = onSnapshot(qWater, (snapshot) => {
      const waterData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));
      setWaterLogs(waterData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'waterLogs');
    });

    return () => {
      unsubscribeMeals();
      unsubscribeWater();
    };
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

  // Water calculations
  const todayWaterLogs = waterLogs.filter(w => isToday(new Date(w.timestamp)));
  const consumedWaterMl = todayWaterLogs.reduce((acc, w) => acc + (w.amount || 0), 0);
  
  const waterGoalLiters = useMemo(() => {
    if (!userProfile?.weight || !userProfile?.height) return 2.5;
    const w = parseFloat(userProfile.weight);
    const h = parseFloat(userProfile.height) / 100;
    const val = w / (h * h);
    let waterMultiplier = 35;
    if (val < 18.5) waterMultiplier = 40;
    else if (val < 25) waterMultiplier = 35;
    else if (val < 30) waterMultiplier = 30;
    else waterMultiplier = 25;
    if (userProfile.activityLevel === 'active' || userProfile.activityLevel === 'very_active') waterMultiplier += 5;
    return ((w * waterMultiplier) / 1000).toFixed(1);
  }, [userProfile]);
  
  const waterGoalMl = parseFloat(waterGoalLiters as string) * 1000;
  const waterProgress = Math.min(100, (consumedWaterMl / waterGoalMl) * 100);

  const handleAddWater = async (amount: number) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'waterLogs'), {
        uid: auth.currentUser.uid,
        amount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'waterLogs');
    }
  };

  const handleRemoveWater = async (amount: number) => {
    if (!auth.currentUser) return;
    if (consumedWaterMl < amount) return;
    try {
      await addDoc(collection(db, 'waterLogs'), {
        uid: auth.currentUser.uid,
        amount: -amount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'waterLogs');
    }
  };

  // Evolution Chart Data
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayMeals = meals.filter(m => {
        const mDate = new Date(m.timestamp);
        return mDate.getDate() === date.getDate() && mDate.getMonth() === date.getMonth();
      });
      const cals = dayMeals.reduce((acc, m) => acc + (m.calories || 0), 0);
      data.push({
        name: format(date, 'EEE', { locale: ptBR }),
        calorias: cals,
        meta: calorieGoal
      });
    }
    return data;
  }, [meals, calorieGoal]);

  const handleDeleteMeal = async (id: string) => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'meals', id));
      setSelectedMeal(null);
      setConfirmDelete(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'meals');
    }
  };

  const handleSaveMeal = async () => {
    if (!editFormData || !selectedMeal) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'meals', selectedMeal.id), {
        foodName: editFormData.foodName,
        calories: editFormData.calories,
        protein: editFormData.protein,
        carbs: editFormData.carbs,
        fat: editFormData.fat,
      });
      setSelectedMeal({ ...selectedMeal, ...editFormData });
      setIsEditingMeal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'meals');
    } finally {
      setIsSaving(false);
    }
  };

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
          {/* Water Tracker Card */}
          <div className="col-span-2 lg:col-span-1 bg-blue-50 rounded-[2rem] p-6 border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Droplets className="w-32 h-32 text-blue-500" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-600 font-black uppercase tracking-widest text-xs">
                  <Droplets className="w-4 h-4" />
                  Hidratação
                </div>
                <span className="text-xs font-bold text-blue-400">{waterGoalLiters}L / dia</span>
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-blue-900">{consumedWaterMl}</span>
                <span className="text-sm font-bold text-blue-500">ml</span>
              </div>

              <div className="h-3 bg-blue-200/50 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${waterProgress}%` }}
                  className="h-full bg-blue-500 rounded-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleRemoveWater(250)}
                    disabled={consumedWaterMl < 250}
                    className="py-2 px-3 bg-white text-blue-600 font-black text-sm rounded-xl hover:bg-blue-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleAddWater(250)}
                    className="flex-1 py-2 bg-white text-blue-600 font-black text-sm rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3 h-3" /> 250ml
                  </button>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleRemoveWater(500)}
                    disabled={consumedWaterMl < 500}
                    className="py-2 px-3 bg-blue-600 text-white font-black text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleAddWater(500)}
                    className="flex-1 py-2 bg-blue-600 text-white font-black text-sm rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3 h-3" /> 500ml
                  </button>
                </div>
              </div>
            </div>
          </div>

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
        </div>
      </div>

      {/* Evolution Chart Section */}
      <section className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              Evolução Semanal
            </h3>
            <p className="text-slate-400 font-medium text-sm">Calorias consumidas nos últimos 7 dias</p>
          </div>
        </div>
        
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                labelStyle={{ fontWeight: 'black', color: '#0f172a', marginBottom: '4px' }}
              />
              <Bar dataKey="calorias" radius={[8, 8, 8, 8]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.calorias > entry.meta ? '#ef4444' : '#f97316'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Recent Activity Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
              <Utensils className="w-5 h-5" />
            </div>
            Refeições de Hoje
          </h3>
          <button className="text-sm font-bold text-orange-600 flex items-center gap-1 hover:gap-2 transition-all">
            Ver tudo <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        
        {loading ? (
          <div className="flex justify-center p-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          </div>
        ) : todayMeals.length === 0 ? (
          <div className="text-center p-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Utensils className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold">Nenhuma refeição registrada hoje.</p>
            <p className="text-slate-300 text-sm">Comece analisando seu primeiro prato do dia!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {todayMeals.map((meal, i) => (
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
                  onClick={() => {
                    setSelectedMeal(null);
                    setIsEditingMeal(false);
                    setConfirmDelete(false);
                  }}
                  className="absolute top-6 right-6 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-colors"
                >
                  <ArrowRight className="w-6 h-6 rotate-180" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-900 to-transparent text-white">
                  <h3 className="text-3xl font-black"><span>{isEditingMeal ? 'Editar Refeição' : selectedMeal.foodName}</span></h3>
                  <p className="text-sm font-bold text-white/60 uppercase tracking-widest">
                    {format(new Date(selectedMeal.timestamp), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>

              <div className="p-8 space-y-8">
                {isEditingMeal ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Nome do Alimento</label>
                      <input 
                        type="text" 
                        value={editFormData.foodName} 
                        onChange={e => setEditFormData({...editFormData, foodName: e.target.value})}
                        className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Calorias (kcal)</label>
                        <input 
                          type="number" 
                          value={editFormData.calories} 
                          onChange={e => setEditFormData({...editFormData, calories: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Proteínas (g)</label>
                        <input 
                          type="number" 
                          value={editFormData.protein} 
                          onChange={e => setEditFormData({...editFormData, protein: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Carboidratos (g)</label>
                        <input 
                          type="number" 
                          value={editFormData.carbs} 
                          onChange={e => setEditFormData({...editFormData, carbs: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Gorduras (g)</label>
                        <input 
                          type="number" 
                          value={editFormData.fat} 
                          onChange={e => setEditFormData({...editFormData, fat: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all"
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setIsEditingMeal(false)}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-[2rem] hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        <span>Cancelar</span>
                      </button>
                      <button
                        onClick={handleSaveMeal}
                        disabled={isSaving}
                        className="flex-1 py-4 bg-emerald-500 text-white font-black rounded-[2rem] hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <LoaderIcon className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span>Salvar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => handleDeleteMeal(selectedMeal.id)}
                        className={`flex-1 py-4 font-black rounded-[2rem] transition-all flex items-center justify-center gap-2 ${
                          confirmDelete 
                            ? 'bg-red-600 text-white hover:bg-red-700' 
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        <Trash2 className="w-5 h-5" />
                        <span>{confirmDelete ? 'Confirmar?' : 'Excluir'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditFormData(selectedMeal);
                          setIsEditingMeal(true);
                        }}
                        className="flex-1 py-4 bg-orange-50 text-orange-600 font-black rounded-[2rem] hover:bg-orange-100 transition-all flex items-center justify-center gap-2"
                      >
                        <Edit2 className="w-5 h-5" />
                        <span>Editar</span>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedMeal(null);
                        setConfirmDelete(false);
                      }}
                      className="w-full py-5 bg-slate-900 text-white font-black rounded-[2rem] hover:bg-slate-800 transition-all"
                    >
                      <span>Fechar Detalhes</span>
                    </button>
                  </>
                )}
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
