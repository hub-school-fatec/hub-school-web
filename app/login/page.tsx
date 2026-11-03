"use client";

import { Button } from "@heroui/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    if (!isSupabaseConfigured()) { setDemo(true); setBusy(false); setMessage("Supabase ainda não está configurado. Você pode abrir a demonstração local."); return; }
    try {
      const supabase = createClient();
      const result = register
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/primeiro-acesso` } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (register && !result.data.session) setMessage("Confira seu e-mail para confirmar a conta e continuar.");
      else router.push(register ? "/primeiro-acesso" : "/home");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autenticar. Tente novamente.");
    } finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-story"><Link className="brand auth-brand" href="/"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></Link><div className="auth-story-copy"><span className="wizard-kicker">SUA VIDA ACADÊMICA, MAIS LEVE</span><h1>Um lugar para<br/>tudo que <em>importa.</em></h1><p>Disciplinas, horários, docentes e seus próximos passos — organizados do seu jeito.</p><div className="auth-preview"><span className="preview-icon">✳</span><div><b>Um semestre com mais clareza</b><small>Seu espaço acadêmico começa aqui.</small></div></div></div><span className="auth-story-footer">HUB SCHOOL · FATEC FRANCA</span></section><section className="auth-form-side"><div className="auth-form-wrap"><div className="auth-mobile-brand"><Link className="brand" href="/"><span className="brand-mark">h<span>·</span></span><span>hub<span className="brand-light">school</span></span></Link></div><span className="eyebrow">BEM-VINDO(A) AO SEU ESPAÇO</span><h2>{register ? "Crie sua conta." : "Que bom ter você."}</h2><p className="auth-intro">{register ? "Vamos preparar seu espaço acadêmico." : "Entre para continuar de onde parou."}</p><form className="auth-form" onSubmit={submit}><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com"/></label><label>Senha<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Pelo menos 6 caracteres"/></label>{!register && <button className="forgot-link" type="button" onClick={() => setMessage("A recuperação de senha será habilitada com a configuração do e-mail no Supabase.")}>Esqueceu a senha?</button>}<Button type="submit" className="auth-submit" isDisabled={busy}>{busy ? "Aguarde…" : register ? "Criar conta" : "Entrar"}<span>→</span></Button>{message && <div className={`auth-message ${demo ? "demo-message" : ""}`} role="status">{message}{demo && <Link href="/home"> Abrir demonstração →</Link>}</div>}</form><div className="auth-switch">{register ? "Já tem uma conta?" : "Ainda não tem uma conta?"}<button onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Entrar" : "Criar conta"}</button></div><div className="auth-secure"><span>⌑</span> Seus dados pessoais são privados e protegidos.</div></div><div className="auth-bottom-note">Feito para acompanhar você. <b>✳</b></div></section></main>;
}
