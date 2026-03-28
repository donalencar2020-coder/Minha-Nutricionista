import { useState, useEffect } from 'react';
import { auth, db, OperationType, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Auth } from './components/Auth';
import { ProfileForm } from './components/ProfileForm';
import { Dashboard } from './components/Dashboard';
import { FoodAnalyzer } from './components/FoodAnalyzer';
import { DietPlanView } from './components/DietPlanView';
import { RecipesView } from './components/RecipesView';
import { Layout, User, PieChart, Apple, ClipboardList, Loader2, Flame, ChefHat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    console.log('App: Setting up auth listener');
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log('App: Auth state changed:', u ? `User logged in: ${u.uid}` : 'No user');
      setUser(u);
      if (!u) {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    console.log('App: Setting up profile listener for UID:', user.uid);
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      console.log('App: Profile snapshot received. Exists:', docSnap.exists());
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('App: Profile data:', JSON.stringify(data));
        setUserProfile(data);
      } else {
        console.log('App: No profile document found for this user.');
        setUserProfile(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('App: Profile listener error:', error);
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50">
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
        </div>
      ) : !user ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-orange-100">
                <Flame className="w-10 h-10 text-orange-600" />
              </div>
              <h1 className="text-5xl font-black text-gray-900 tracking-tight">NutriTrack AI</h1>
              <p className="text-xl text-gray-500 max-w-md mx-auto">
                Seu assistente inteligente de nutrição. Analise pratos com IA e alcance seus objetivos.
              </p>
            </div>
            <Auth user={user} />
            <div className="grid grid-cols-3 gap-8 pt-12">
              <Feature icon={<Apple />} label="Análise IA" />
              <Feature icon={<PieChart />} label="Macros" />
              <Feature icon={<ClipboardList />} label="Planos" />
            </div>
          </motion.div>
        </div>
      ) : !userProfile ? (
        <div className="min-h-screen p-6 flex flex-col items-center justify-center space-y-8">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8 w-full max-w-md"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-slate-900">Quase lá!</h2>
              <p className="text-slate-500 font-medium">Precisamos de algumas informações para personalizar seu plano.</p>
            </div>
            <ProfileForm 
              key={user?.uid}
              onComplete={() => {
                console.log('App: Profile form completed, waiting for snapshot...');
              }} 
              initialData={userProfile} 
            />
            <div className="pt-4 flex justify-center">
              <Auth user={user} />
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="min-h-screen bg-[#F8F9FA] pb-32">
          <header className="bg-white/70 backdrop-blur-2xl sticky top-0 z-50 border-b border-slate-100/50">
            <div className="max-w-5xl mx-auto px-6 h-24 flex items-center justify-between">
              <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-slate-200 group-hover:scale-110 transition-transform duration-500">
                  <Flame className="w-7 h-7 text-orange-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-slate-900 tracking-tighter leading-none">NutriTrack</span>
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Inteligência Artificial</span>
                </div>
              </div>
              <Auth user={user} />
            </div>
          </header>

          <main className="max-w-5xl mx-auto p-6 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeTab === 'dashboard' && <Dashboard userProfile={userProfile} />}
                {activeTab === 'analyze' && <FoodAnalyzer userProfile={userProfile} onAnalysisComplete={() => setActiveTab('dashboard')} />}
                {activeTab === 'plan' && <DietPlanView userProfile={userProfile} />}
                {activeTab === 'recipes' && <RecipesView userProfile={userProfile} />}
                {activeTab === 'profile' && <ProfileForm onComplete={() => setActiveTab('dashboard')} initialData={userProfile} />}
              </motion.div>
            </AnimatePresence>
          </main>

          <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-sm bg-slate-900/90 backdrop-blur-2xl border border-white/10 px-6 py-3 z-50 rounded-[2rem] shadow-2xl shadow-slate-900/20">
            <div className="flex justify-between items-center">
              <NavButton 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')} 
                icon={<PieChart className="w-5 h-5" />} 
                label="Início" 
              />
              <NavButton 
                active={activeTab === 'analyze'} 
                onClick={() => setActiveTab('analyze')} 
                icon={<Apple className="w-5 h-5" />} 
                label="Analisar" 
              />
              <NavButton 
                active={activeTab === 'plan'} 
                onClick={() => setActiveTab('plan')} 
                icon={<ClipboardList className="w-5 h-5" />} 
                label="Plano" 
              />
              <NavButton 
                active={activeTab === 'recipes'} 
                onClick={() => setActiveTab('recipes')} 
                icon={<ChefHat className="w-5 h-5" />} 
                label="Receitas" 
              />
              <NavButton 
                active={activeTab === 'profile'} 
                onClick={() => setActiveTab('profile')} 
                icon={<User className="w-5 h-5" />} 
                label="Perfil" 
              />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

function Feature({ icon, label }: any) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-slate-200/50 text-orange-500 hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all relative",
        active ? "text-orange-500 scale-105" : "text-slate-400 hover:text-slate-200"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl transition-all duration-300",
        active ? "bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.1)]" : "bg-transparent"
      )}>
        {icon}
      </div>
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-dot"
          className="absolute -bottom-1 w-1 h-1 bg-orange-500 rounded-full"
        />
      )}
    </button>
  );
}
