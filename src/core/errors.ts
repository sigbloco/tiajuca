// Traduz erros técnicos (Supabase Auth / Postgres / rede) para mensagens amigáveis em pt-BR.
const RULES: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least/i, 'A senha deve ter pelo menos 8 caracteres.'],
  [/weak password|password is too weak/i, 'Escolha uma senha mais forte.'],
  [/rate limit|too many requests|over_email_send_rate_limit/i, 'Muitas tentativas. Aguarde um instante e tente novamente.'],
  [/same password|different from the old/i, 'A nova senha deve ser diferente da atual.'],
  [/token has expired|otp_expired|link.*expired/i, 'O link expirou. Solicite um novo.'],
  [/failed to fetch|networkerror|network request failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
  [/row-level security|permission denied|42501/i, 'Você não tem permissão para realizar esta ação.'],
  [/duplicate key|23505/i, 'Já existe um registro com estes dados.'],
]

export function friendlyError(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  const e = err as { message?: string; code?: string } | null
  // Regras de negócio do banco (RAISE EXCEPTION) já vêm escritas em pt-BR para o usuário final.
  if ((e?.code === 'P0001' || e?.code === 'P0002') && e.message) return e.message
  const text = `${e?.message ?? ''} ${e?.code ?? ''}`.trim()
  if (!text) return fallback
  for (const [re, msg] of RULES) if (re.test(text)) return msg
  // Mensagens já escritas em pt-BR pelas RPCs/triggers do banco são exibidas como estão.
  if (/[áéíóúãõçÁÉÍÓÚÃÕÇ]/.test(e?.message ?? '')) return e!.message!
  return fallback
}
