import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, RefreshCw, Zap, Sparkles, X, MessageSquareText } from 'lucide-react';
import { analyzeFoodImage, analyzeFoodText } from '../services/gemini';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { CameraCapture } from './CameraCapture';

export function FoodAnalyzer({ userProfile, onAnalysisComplete }: { userProfile: any, onAnalysisComplete: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [textDescription, setTextDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPermissionPopup, setShowPermissionPopup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File | string) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImage(dataUrl);
        setResult(null);
        setError(null);
        setTextDescription('');
        
        // Reset inputs
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
    };
    
    if (typeof file === 'string') {
      // It's already a data URL from camera
      setImage(file);
      setResult(null);
      setError(null);
      setTextDescription('');
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if ((!image && !textDescription.trim()) || !auth.currentUser) return;
    setAnalyzing(true);
    setError(null);

    try {
      let analysis;
      if (image) {
        analysis = await analyzeFoodImage(image, userProfile);
      } else {
        analysis = await analyzeFoodText(textDescription, userProfile);
      }
      
      setResult(analysis);
      
      await addDoc(collection(db, 'meals'), {
        uid: auth.currentUser.uid,
        imageUrl: image || null,
        textDescription: textDescription || null,
        ...analysis,
        timestamp: new Date().toISOString(),
      });
      
      onAnalysisComplete();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'meals');
      setError(err.message || 'Falha ao analisar. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-10 bg-white rounded-[3rem] shadow-2xl border border-slate-50 space-y-8 relative">
      <AnimatePresence>
        {showPermissionPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm p-10 rounded-[3rem] shadow-2xl text-center space-y-8"
            >
              <div className="w-24 h-24 bg-orange-100 rounded-[2rem] flex items-center justify-center mx-auto">
                <Camera className="w-12 h-12 text-orange-600" />
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-black text-slate-900">Acesso à Câmera</h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Para analisar seu prato em tempo real, precisamos de permissão para usar sua câmera.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowPermissionPopup(false);
                    setShowCamera(true);
                  }}
                  className="w-full py-5 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-100"
                >
                  Permitir Acesso
                </button>
                <button
                  onClick={() => setShowPermissionPopup(false)}
                  className="w-full py-4 text-slate-400 font-black hover:text-slate-600 transition-colors uppercase tracking-widest text-xs"
                >
                  Agora não
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showCamera && (
          <CameraCapture
            onCapture={(dataUrl) => setImage(dataUrl)}
            onClose={() => setShowCamera(false)}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-2xl font-black text-slate-900">Analisar Refeição</h3>
          <p className="text-slate-400 text-sm font-medium">IA de visão computacional avançada</p>
        </div>
        <button
          onClick={() => {
            setImage(null);
            setTextDescription('');
            setResult(null);
            setError(null);
          }}
          className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {!image && !result ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setShowPermissionPopup(true)}
              className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all group"
            >
              <div className="w-16 h-16 bg-orange-100 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-orange-100">
                <Camera className="w-8 h-8 text-orange-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-black text-slate-700">Tirar Foto</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Câmera ao vivo</p>
              </div>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
            >
              <div className="w-16 h-16 bg-blue-100 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500 shadow-lg shadow-blue-100">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-black text-slate-700">Galeria</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Subir imagem</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-4 text-slate-400 font-black tracking-widest">Ou descreva</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute top-5 left-5 text-slate-400 group-focus-within:text-orange-500 transition-colors">
                <MessageSquareText className="w-6 h-6" />
              </div>
              <textarea
                value={textDescription}
                onChange={(e) => setTextDescription(e.target.value)}
                placeholder="Ex: Comi 2 ovos mexidos com 1 fatia de pão integral e café sem açúcar..."
                className="w-full min-h-[120px] p-6 pl-14 bg-slate-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-[2rem] text-slate-700 font-medium placeholder:text-slate-400 transition-all resize-none outline-none"
              />
            </div>
            
            {textDescription.trim() && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-5 bg-slate-900 text-white font-black text-lg rounded-[2rem] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-6 h-6 text-orange-400" />
                    Analisar Texto
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {image && (
            <div className="relative rounded-[2.5rem] overflow-hidden aspect-square bg-slate-100 shadow-inner">
              <img src={image} alt="Comida" className="w-full h-full object-cover" />
              {analyzing && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center text-white gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-orange-500 animate-pulse" />
                  </div>
                  <p className="font-black text-xl tracking-tight">Escaneando macros...</p>
                </div>
              )}
            </div>
          )}

          {!analyzing && !result && image && (
            <button
              onClick={handleAnalyze}
              className="w-full py-5 bg-slate-900 text-white font-black text-lg rounded-[2rem] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 flex items-center justify-center gap-3"
            >
              <Sparkles className="w-6 h-6 text-orange-400" />
              Analisar Agora
            </button>
          )}

          {result && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 space-y-6"
            >
              <div className="flex items-center gap-3 text-emerald-700 font-black text-lg">
                <div className="p-2 bg-emerald-500 rounded-xl text-white">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                Análise Concluída!
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-emerald-100/50">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Calorias</p>
                  <p className="text-4xl font-black text-slate-900">{result.calories} <span className="text-sm font-bold text-slate-400">kcal</span></p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-emerald-100/50">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Alimento</p>
                  <p className="text-xl font-black text-slate-900 truncate">{result.foodName}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <MacroSmall label="Prot" value={`${result.protein}g`} color="text-orange-600" />
                <MacroSmall label="Carb" value={`${result.carbs}g`} color="text-blue-600" />
                <MacroSmall label="Gord" value={`${result.fat}g`} color="text-emerald-600" />
              </div>

              <div className="p-5 bg-white/60 rounded-2xl text-sm text-slate-600 font-medium leading-relaxed border border-white">
                <span className="text-emerald-600 font-black mr-2">Nutri Rigorosa:</span>
                "{result.analysis}"
              </div>
            </motion.div>
          )}

          {error && (
            <div className="p-5 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-4 text-red-600 text-sm font-bold">
              <AlertCircle className="w-6 h-6 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MacroSmall({ label, value, color }: any) {
  return (
    <div className="text-center p-3 bg-white rounded-2xl border border-emerald-100/30">
      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{label}</p>
      <p className={`font-black ${color}`}>{value}</p>
    </div>
  );
}
