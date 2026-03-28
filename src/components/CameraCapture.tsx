import { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Zap, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setLoading(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      if (err.name === 'NotAllowedError') {
        setError('Permissão de câmera negada. Por favor, habilite o acesso nas configurações do seu navegador.');
      } else {
        setError('Não foi possível acessar a câmera. Verifique se ela está sendo usada por outro aplicativo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas dimensions to match video stream
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw the current frame from the video onto the canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to data URL (JPEG)
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(imageData);
        onClose();
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-xl">
              <Camera className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="font-black text-slate-900">Câmera ao Vivo</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
              <p className="font-bold text-sm uppercase tracking-widest opacity-60">Solicitando permissão...</p>
            </div>
          )}

          {error ? (
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <div className="space-y-2">
                <p className="text-white font-black text-xl">Ops! Algo deu errado</p>
                <p className="text-slate-400 text-sm">{error}</p>
              </div>
              <button
                onClick={startCamera}
                className="px-8 py-3 bg-white text-slate-900 font-black rounded-2xl hover:bg-slate-100 transition-all flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar Novamente
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${loading ? 'opacity-0' : 'opacity-100'}`}
            />
          )}

          {/* Overlay elements */}
          {!loading && !error && (
            <div className="absolute inset-0 border-[20px] border-transparent pointer-events-none">
              <div className="w-full h-full border-2 border-white/20 rounded-3xl relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white/40 rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-8 bg-white flex items-center justify-center gap-8">
          {!loading && !error && (
            <button
              onClick={capturePhoto}
              className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center group relative"
            >
              <div className="absolute inset-0 bg-orange-500 rounded-full scale-0 group-hover:scale-110 transition-transform duration-500 opacity-20" />
              <div className="w-16 h-16 border-4 border-white/20 rounded-full flex items-center justify-center">
                <div className="w-12 h-12 bg-white rounded-full shadow-lg group-active:scale-90 transition-transform" />
              </div>
            </button>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </motion.div>
  );
}
