import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { User, Weight, Calendar, Target, Activity, Save, CheckCircle2, Loader2, ChevronRight, Ruler, TrendingUp, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function ProfileForm({ onComplete, initialData }: { onComplete: () => void, initialData?: any }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    age: initialData?.age || '',
    weight: initialData?.weight || '',
    height: initialData?.height || '',
    gender: initialData?.gender || 'male',
    activityLevel: initialData?.activityLevel || 'moderate',
    goal: initialData?.goal || 'maintain',
    restrictions: initialData?.restrictions || [],
  });
  const [saving, setSaving] = useState(false);

  // Sync with initialData if it changes (important for persistence)
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        age: initialData.age || '',
        weight: initialData.weight || '',
        height: initialData.height || '',
        gender: initialData.gender || 'male',
        activityLevel: initialData.activityLevel || 'moderate',
        goal: initialData.goal || 'maintain',
        restrictions: initialData.restrictions || [],
      });
    }
  }, [initialData]);

  const calculateDailyCalories = () => {
    const w = parseFloat(formData.weight);
    const h = parseFloat(formData.height);
    const a = parseInt(formData.age);
    
    if (!w || !h || !a) return 2000;

    // Harris-Benedict Equation
    let bmr = 0;
    if (formData.gender === 'male') {
      bmr = 88.362 + (13.397 * w) + (4.799 * h) - (5.677 * a);
    } else {
      bmr = 447.593 + (9.247 * w) + (3.098 * h) - (4.330 * a);
    }

    const activityMultipliers: any = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    let tdee = bmr * activityMultipliers[formData.activityLevel];

    if (formData.goal === 'lose_weight') tdee -= 500;
    if (formData.goal === 'gain_muscle') tdee += 500;

    return Math.round(tdee);
  };

  const bmi = (() => {
    const w = parseFloat(formData.weight);
    const h = parseFloat(formData.height) / 100;
    if (!w || !h) return null;
    const val = w / (h * h);
    
    let category = '';
    let color = '';
    let waterMultiplier = 35; // Base: 35ml per kg
    
    if (val < 18.5) { 
      category = 'Abaixo do peso'; 
      color = 'text-blue-500'; 
      waterMultiplier = 40; // Needs more hydration to help with nutrient absorption
    }
    else if (val < 25) { 
      category = 'Peso normal'; 
      color = 'text-emerald-500'; 
      waterMultiplier = 35;
    }
    else if (val < 30) { 
      category = 'Sobrepeso'; 
      color = 'text-orange-500'; 
      waterMultiplier = 30; // Slightly less per kg to avoid water intoxication, but still high total volume
    }
    else { 
      category = 'Obesidade'; 
      color = 'text-red-500'; 
      waterMultiplier = 25; // Adjusted for higher body mass index to prevent excessive volume
    }

    // Adjust for activity level
    if (formData.activityLevel === 'active' || formData.activityLevel === 'very_active') {
      waterMultiplier += 5;
    }
    
    const waterIntakeLiters = ((w * waterMultiplier) / 1000).toFixed(1);
    
    return { value: val.toFixed(1), category, color, waterIntakeLiters };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSaving(true);

    try {
      const dailyCalorieGoal = calculateDailyCalories();
      const dataToSave = {
        ...formData,
        age: formData.age ? parseInt(formData.age.toString()) : null,
        weight: formData.weight ? parseFloat(formData.weight.toString()) : null,
        height: formData.height ? parseFloat(formData.height.toString()) : null,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        dailyCalorieGoal,
        updatedAt: new Date().toISOString(),
      };

      console.log('ProfileForm: Saving data to Firestore:', JSON.stringify(dataToSave));
      await setDoc(doc(db, 'users', auth.currentUser.uid), dataToSave, { merge: true });
      console.log('ProfileForm: Successfully saved profile');
      onComplete();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[3rem] shadow-2xl border border-slate-50 overflow-hidden"
      >
        <div className="bg-slate-900 p-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 rounded-full -mr-20 -mt-20 blur-3xl" />
          <div className="relative z-10 space-y-2">
            <h3 className="text-3xl font-black tracking-tight">Seu Perfil Fitness</h3>
            <p className="text-slate-400 font-medium">Personalize sua experiência para resultados precisos.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <InputGroup label="Nome Completo" icon={<User className="w-4 h-4" />}>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                  placeholder="Seu nome"
                />
              </InputGroup>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Idade" icon={<Calendar className="w-4 h-4" />}>
                  <input
                    type="number"
                    required
                    value={formData.age}
                    onChange={e => setFormData({ ...formData, age: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                    placeholder="25"
                  />
                </InputGroup>
                <InputGroup label="Gênero" icon={<User className="w-4 h-4" />}>
                  <select
                    value={formData.gender}
                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700 appearance-none"
                  >
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </InputGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Peso (kg)" icon={<Weight className="w-4 h-4" />}>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formData.weight}
                    onChange={e => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                    placeholder="70.5"
                  />
                </InputGroup>
                <InputGroup label="Altura (cm)" icon={<Ruler className="w-4 h-4" />}>
                  <input
                    type="number"
                    required
                    value={formData.height}
                    onChange={e => setFormData({ ...formData, height: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                    placeholder="175"
                  />
                </InputGroup>
              </div>

              {bmi && (
                <div className="grid grid-cols-2 gap-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between"
                  >
                    <div className="space-y-0.5 mb-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><span>Seu IMC</span></p>
                      <p className={`text-sm font-black ${bmi.color}`}><span>{bmi.category}</span></p>
                    </div>
                    <div className="text-left">
                      <p className="text-3xl font-black text-slate-900"><span>{bmi.value}</span></p>
                    </div>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col justify-between"
                  >
                    <div className="space-y-0.5 mb-2">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest"><span>Meta de Água</span></p>
                      <p className="text-sm font-black text-blue-600"><span>Diária</span></p>
                    </div>
                    <div className="text-left flex items-baseline gap-1">
                      <p className="text-3xl font-black text-blue-900"><span>{bmi.waterIntakeLiters}</span></p>
                      <span className="text-sm font-bold text-blue-500 uppercase">Litros</span>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <InputGroup label="Nível de Atividade" icon={<Activity className="w-4 h-4" />}>
                <select
                  value={formData.activityLevel}
                  onChange={e => setFormData({ ...formData, activityLevel: e.target.value })}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700 appearance-none"
                >
                  <option value="sedentary">Sedentário (Pouco exercício)</option>
                  <option value="light">Leve (1-2 dias/sem)</option>
                  <option value="moderate">Moderado (3-5 dias/sem)</option>
                  <option value="active">Ativo (6-7 dias/sem)</option>
                  <option value="very_active">Muito Ativo (Atleta)</option>
                </select>
              </InputGroup>

              <InputGroup label="Seu Objetivo" icon={<Target className="w-4 h-4" />}>
                <div className="grid grid-cols-1 gap-3">
                  <GoalOption 
                    active={formData.goal === 'lose_weight'} 
                    onClick={() => setFormData({ ...formData, goal: 'lose_weight' })}
                    label="Perder Peso"
                    desc="Déficit calórico saudável"
                  />
                  <GoalOption 
                    active={formData.goal === 'maintain'} 
                    onClick={() => setFormData({ ...formData, goal: 'maintain' })}
                    label="Manter Peso"
                    desc="Equilíbrio e saúde"
                  />
                  <GoalOption 
                    active={formData.goal === 'gain_muscle'} 
                    onClick={() => setFormData({ ...formData, goal: 'gain_muscle' })}
                    label="Ganhar Massa"
                    desc="Superávit para hipertrofia"
                  />
                </div>
              </InputGroup>

              <InputGroup label="Restrições Alimentares" icon={<ShieldAlert className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-2">
                  {['Lactose', 'Açúcar', 'Glúten', 'Farinha Branca', 'Soja', 'Amendoim'].map(res => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => {
                        const current = formData.restrictions;
                        if (current.includes(res)) {
                          setFormData({ ...formData, restrictions: current.filter((r: string) => r !== res) });
                        } else {
                          setFormData({ ...formData, restrictions: [...current, res] });
                        }
                      }}
                      className={cn(
                        "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                        formData.restrictions.includes(res) 
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                          : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                      )}
                    >
                      <span>{res}</span>
                    </button>
                  ))}
                </div>
              </InputGroup>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-5 bg-orange-500 text-white font-black text-xl rounded-[2rem] hover:bg-orange-600 transition-all shadow-2xl shadow-orange-100 flex items-center justify-center gap-3 group"
          >
            {saving ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Save className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span>Salvar Perfil</span>
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function InputGroup({ label, icon, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <span className="text-orange-500">{icon}</span>
        <span>{label}</span>
      </label>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

function GoalOption({ active, onClick, label, desc }: any) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group ${
        active ? 'border-orange-500 bg-orange-50' : 'border-slate-100 hover:border-slate-200'
      }`}
    >
      <div>
        <p className={`font-black ${active ? 'text-orange-600' : 'text-slate-700'}`}><span>{label}</span></p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight"><span>{desc}</span></p>
      </div>
      {active ? (
        <CheckCircle2 className="w-5 h-5 text-orange-500" />
      ) : (
        <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-slate-400 transition-colors" />
      )}
    </div>
  );
}

