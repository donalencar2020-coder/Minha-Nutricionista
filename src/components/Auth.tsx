import { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { LogIn, LogOut, Mail, Lock, UserPlus, Chrome, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function Auth({ user }: { user: any }) {
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login error detailed:', error);
      // Show more specific error messages for common issues
      let friendlyError = 'Falha ao entrar com Google. Tente novamente.';
      if (error.code === 'auth/unauthorized-domain') {
        friendlyError = `Este domínio não está autorizado no Firebase. Adicione '${window.location.hostname}' aos domínios autorizados no Console do Firebase.`;
      } else if (error.code === 'auth/popup-closed-by-user') {
        friendlyError = 'O login foi cancelado porque o popup foi fechado.';
      } else if (error.message) {
        friendlyError = `Erro: ${error.message}`;
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos.');
      } else if (error.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (error.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError('Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, digite seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (error: any) {
      console.error('Password reset error:', error);
      if (error.code === 'auth/user-not-found') {
        setError('Nenhuma conta encontrada com este e-mail.');
      } else if (error.code === 'auth/invalid-email') {
        setError('E-mail inválido.');
      } else {
        setError('Erro ao enviar e-mail de recuperação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-6">
      <AnimatePresence mode="wait">
        {user ? (
          <motion.div
            key="logged-in"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-black text-red-500 hover:bg-red-50 rounded-2xl transition-all uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </motion.div>
        ) : !isEmailLogin ? (
          <motion.div
            key="social"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-slate-900 font-black rounded-[1.5rem] hover:bg-slate-50 transition-all shadow-xl shadow-slate-200 border border-slate-100"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Chrome className="w-5 h-5 text-orange-500" />}
              Entrar com Google
            </button>
            <button
              onClick={() => {
                setIsEmailLogin(true);
                setIsResettingPassword(false);
              }}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 text-white font-black rounded-[1.5rem] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
            >
              <Mail className="w-5 h-5" />
              Entrar com E-mail
            </button>
          </motion.div>
        ) : isResettingPassword ? (
          <motion.div
            key="reset"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-50 space-y-6"
          >
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900">Recuperar Conta</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Enviaremos um link de acesso</p>
            </div>

            {resetSent ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-sm font-bold text-center">
                  E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.
                </div>
                <button
                  onClick={() => {
                    setIsResettingPassword(false);
                    setResetSent(false);
                  }}
                  className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Mail className="w-3 h-3 text-orange-500" />
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                    placeholder="seu@email.com"
                  />
                  <p className="text-[10px] text-slate-400 font-bold mt-2">
                    Esqueceu qual e-mail usou? Tente retornar e fazer login com o Google.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-500 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Link de Recuperação'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="w-full py-4 bg-transparent text-slate-400 font-black rounded-2xl hover:text-slate-600 transition-colors uppercase tracking-widest text-xs"
                >
                  Voltar
                </button>
              </form>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="email"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-50 space-y-6"
          >
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900">
                {isSignUp ? 'Criar Conta' : 'Entrar'}
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Acesse sua jornada fitness</p>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3 text-orange-500" />
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                  placeholder="seu@email.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Lock className="w-3 h-3 text-orange-500" />
                    Senha
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResettingPassword(true);
                        setError(null);
                        setResetSent(false);
                      }}
                      className="text-[10px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-orange-500 transition-all font-bold text-slate-700"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-500 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                    <span>{isSignUp ? 'Criar Conta' : 'Entrar'}</span>
                  </div>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-50 flex flex-col gap-3">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs font-black text-slate-400 hover:text-orange-500 transition-colors uppercase tracking-widest"
              >
                <span>
                  {isSignUp ? 'Já tem uma conta? Entre' : 'Não tem conta? Crie uma'}
                </span>
              </button>
              <button
                onClick={() => setIsEmailLogin(false)}
                className="text-xs font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
              >
                Voltar para opções sociais
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
