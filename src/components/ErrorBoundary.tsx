import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-10 text-center space-y-6 border border-red-100">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900">Algo deu errado</h2>
              <p className="text-slate-500 font-medium">
                Ocorreu um erro inesperado. Nossa equipe (IA) já foi notificada.
              </p>
            </div>

            {errorDetails && (
              <div className="bg-slate-50 p-4 rounded-2xl text-left text-xs font-mono overflow-auto max-h-40">
                <p className="font-bold text-red-600 mb-1">Detalhes do Erro:</p>
                <pre>{JSON.stringify(errorDetails, null, 2)}</pre>
              </div>
            )}

            {!errorDetails && this.state.error && (
              <div className="bg-slate-50 p-4 rounded-2xl text-left text-xs font-mono overflow-auto max-h-40">
                <p className="font-bold text-red-600 mb-1">Mensagem:</p>
                <p className="text-slate-600">{this.state.error.message}</p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
