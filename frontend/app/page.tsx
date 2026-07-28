"use client";

import { useWallet } from "@/lib/genlayer/wallet";
import { Navbar } from "@/components/Navbar";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ShieldCheck, Zap, Globe } from "lucide-react";

export default function LandingPage() {
  const { isConnected, connectWallet } = useWallet();
  const router = useRouter();

  const handleGetStarted = async () => {
    if (isConnected) {
      router.push("/dashboard");
    } else {
      try {
        await connectWallet();
        router.push("/dashboard");
      } catch (err) {
        console.error("Failed to connect wallet", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] relative selection:bg-white/20 selection:text-white overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none" />
      
      <Navbar />

      <main className="pt-32 pb-24 px-6 md:px-8 max-w-7xl mx-auto relative z-10">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center space-y-8 py-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white/80">The Future of Public Goods</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 leading-tight">
            Fund What <br className="hidden md:block" /> Matters.
          </h1>
          
          <p className="text-lg md:text-xl text-white/60 font-medium max-w-2xl leading-relaxed">
            Verifond autonomously evaluates and retroactively funds the most impactful projects building the decentralized web using GenLayer's intelligent AI consensus.
          </p>

          <div className="pt-8">
            <button
              onClick={handleGetStarted}
              className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-black rounded-full font-bold text-lg transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
            >
              Get Started
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

        {/* Features Section */}
        <section className="grid md:grid-cols-3 gap-6 pt-24">
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">AI Evaluation</h3>
            <p className="text-white/60 leading-relaxed">
              Every submitted project is analyzed by GenLayer's intelligent consensus to determine its contribution to public goods without human bias.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-6">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Trustless Payouts</h3>
            <p className="text-white/60 leading-relaxed">
              Funds are held securely in the Verifond treasury. Approved projects can claim their dynamically calculated allocation instantly.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center mb-6">
              <Globe className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Global Submissions</h3>
            <p className="text-white/60 leading-relaxed">
              Explore and verify submissions from builders all over the world. A completely transparent ledger of retroactive public goods funding.
            </p>
          </div>

        </section>

      </main>
    </div>
  );
}
