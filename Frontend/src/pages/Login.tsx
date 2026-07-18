import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { motion } from "framer-motion";
import { Shield, Lock, Cpu, GitBranch, Globe, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Animated floating feature pill
const FeaturePill = ({
  icon,
  label,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-300"
  >
    {icon}
    {label}
  </motion.div>
);

const LoginPage = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/elk/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSuccess = (response: CredentialResponse) => {
    if (response.credential) {
      login(response.credential);
      toast.success("Welcome to Quantum Shield");
      navigate("/elk/dashboard", { replace: true });
    }
  };

  const handleError = () => {
    toast.error("Google sign-in failed. Please try again.");
  };

  return (
    <div className="min-h-screen flex bg-[#080c14] overflow-hidden">

      {/* ── Left panel — branding ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-14 relative"
      >
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-blue-600/15 blur-[80px] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/40">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Quantum Shield</span>
        </div>

        {/* Main copy */}
        <div className="relative z-10 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              Post-Quantum
              <br />
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Crypto Auditing
              </span>
            </h1>
            <p className="mt-4 text-slate-400 text-base leading-relaxed max-w-sm">
              Scan TLS endpoints, GitHub repositories, and system agents for
              cryptographic vulnerabilities and quantum readiness.
            </p>
          </motion.div>

          <div className="flex flex-wrap gap-2">
            <FeaturePill icon={<Globe className="h-3.5 w-3.5 text-blue-400" />}   label="TLS / SSL scanning"    delay={0.35} />
            <FeaturePill icon={<GitBranch className="h-3.5 w-3.5 text-emerald-400" />} label="Repo code analysis" delay={0.45} />
            <FeaturePill icon={<Cpu className="h-3.5 w-3.5 text-violet-400" />}   label="System endpoint audit"  delay={0.55} />
            <FeaturePill icon={<CheckCircle className="h-3.5 w-3.5 text-amber-400" />} label="PQC scoring"       delay={0.65} />
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-slate-600">
          © 2026 Quantum Shield · Post-Quantum Cryptography Platform
        </p>
      </motion.div>

      {/* ── Right panel — login form ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Subtle right-side glow */}
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-purple-800/10 blur-[80px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative z-10 w-full max-w-md"
        >
          {/* Mobile logo (hidden on lg) */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-semibold text-lg">Quantum Shield</span>
          </div>

          {/* Card */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white">Sign in</h2>
              <p className="text-sm text-slate-400 mt-1.5">
                Use your Google account to access the platform
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-white/8" />
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Lock className="h-3 w-3" /> Secure sign-in
              </span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Google button */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                theme="filled_blue"
                shape="rectangular"
                size="large"
                text="signin_with"
                logo_alignment="center"
                width="340"
              />
            </div>

            {/* Trust note */}
            <div className="mt-6 flex items-start gap-2.5 p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.06]">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Your Google account is only used for authentication. No data is
                shared outside this platform.
              </p>
            </div>
          </div>

          {/* Below-card note */}
          <p className="text-center text-xs text-slate-600 mt-5">
            By signing in you agree to our security audit terms.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
