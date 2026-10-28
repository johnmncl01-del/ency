import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './supabase'

const SECTIONS = ['Jason', 'Wilton', 'John', 'Lucas', 'Clément'] as const
type Section = (typeof SECTIONS)[number]
type Phrase = { id: string; section: Section; phrase: string; created_at: string }
const PAGE = 60

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const readHash = (): Section | null => {
  const h = decodeURIComponent(location.hash.slice(1))
  return (SECTIONS as readonly string[]).includes(h) ? (h as Section) : null
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError('E-mail ou mot de passe incorrect.')
    setBusy(false)
  }
  return (
    <main className="min-h-screen grid place-items-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl font-medium">L’Encyclopédie</h1>
        <p className="mt-2 text-ink/70">Accès réservé aux cinq amis.</p>
        <div className="mt-8 space-y-3">
          <input className="w-full rounded-lg border border-line bg-white px-4 py-3" type="email" autoComplete="email"
            placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-line bg-white px-4 py-3" type="password" autoComplete="current-password"
            placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button onClick={submit} disabled={busy || !email || !password}
            className="w-full rounded-lg bg-accent py-3 font-medium text-white disabled:opacity-50">
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </div>
      </div>
    </main>
  )
}

function Encyclopedie({ session }: { session: Session }) {
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<Section | null>(readHash())
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('phrases').select('id, section, phrase, created_at')
      .order('created_at', { ascending: false })
    if (error) setError('Impossible de charger les références. Vérifiez votre accès.')
    else { setPhrases(data as Phrase[]); setError('') }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase.channel('phrases-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phrases' }, p => {
        const row = p.new as Phrase
        setPhrases(prev => prev.some(x => x.id === row.id) ? prev : [row, ...prev])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'phrases' }, p => {
        const id = (p.old as { id: string }).id
        setPhrases(prev => prev.filter(x => x.id !== id))
      })
      .subscribe()
    const onHash = () => { setView(readHash()); setLimit(PAGE) }
    window.addEventListener('hashchange', onHash)
    return () => { supabase.removeChannel(channel); window.removeEventListener('hashchange', onHash) }
  }, [load])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    phrases.forEach(p => { c[p.section] = (c[p.section] ?? 0) + 1 })
    return c
  }, [phrases])

  const searching = query.trim().length > 0
  const shown = useMemo(() => {
    if (searching) { const q = norm(query.trim()); return phrases.filter(p => norm(p.phrase).includes(q)) }
    return view ? phrases.filter(p => p.section === view) : []
  }, [phrases, view, query, searching])

  const add = async () => {
    const text = draft.trim()
    if (!text || !view) return
    const { data, error } = await supabase.from('phrases').insert({ section: view, phrase: text }).select().single()
    if (error) { setError('Ajout impossible. Réessayez.'); return }
    setPhrases(prev => prev.some(x => x.id === data.id) ? prev : [data as Phrase, ...prev])
    setDraft(''); setError('')
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette référence pour tout le monde ?')) return
    setPhrases(prev => prev.filter(x => x.id !== id))
    const { error } = await supabase.from('phrases').delete().eq('id', id)
    if (error) { setError('Suppression impossible.'); load() }
  }

  const go = (s: Section | null) => { setQuery(''); setLimit(PAGE); location.hash = s ? encodeURIComponent(s) : '' ; if (!s) setView(null) }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24">
      <header className="sticky top-0 z-10 -mx-5 bg-paper/95 px-5 pb-3 pt-5 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <button onClick={() => go(null)} className="font-serif text-2xl font-medium">L’Encyclopédie</button>
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-ink/60 hover:text-ink">Se déconnecter</button>
        </div>
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE) }}
          placeholder="Rechercher une phrase dans toutes les sections"
          className="mt-4 w-full rounded-lg border border-line bg-white px-4 py-3" />
      </header>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {!view && !searching && (
        <main className="mt-6 grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(s => (
            <button key={s} onClick={() => go(s)}
              className="rounded-xl border border-line bg-white p-6 text-left transition-colors hover:border-accent">
              <span className="block font-serif text-3xl">{s}</span>
              <span className="mt-1 block text-sm text-ink/60">
                {loading ? '…' : `${counts[s] ?? 0} référence${(counts[s] ?? 0) > 1 ? 's' : ''}`}
              </span>
            </button>
          ))}
        </main>
      )}

      {(view || searching) && (
        <main className="mt-6">
          {!searching && view && (
            <>
              <button onClick={() => go(null)} className="text-sm text-accent">Retour aux sections</button>
              <h2 className="mt-2 font-serif text-4xl">{view}</h2>
              <div className="mt-5 rounded-xl border border-line bg-white p-4">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={1000}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add() }}
                  placeholder="Écrivez la phrase ici" className="w-full resize-none bg-transparent font-serif text-lg outline-none" />
                <div className="flex justify-end">
                  <button onClick={add} disabled={!draft.trim()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Ajouter une référence</button>
                </div>
              </div>
            </>
          )}
          {searching && <p className="text-sm text-ink/60">{shown.length} résultat{shown.length > 1 ? 's' : ''}</p>}

          <ul className="mt-5 divide-y divide-line">
            {shown.slice(0, limit).map(p => (
              <li key={p.id} className="group flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="font-serif text-lg leading-relaxed">{p.phrase}</p>
                  {searching && <button onClick={() => go(p.section)} className="mt-1 text-xs text-accent">{p.section}</button>}
                </div>
                <button onClick={() => remove(p.id)} aria-label="Supprimer cette référence"
                  className="shrink-0 rounded px-2 py-1 text-sm text-ink/40 hover:text-red-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">Supprimer</button>
              </li>
            ))}
          </ul>
          {shown.length === 0 && !loading && (
            <p className="py-10 text-ink/60">{searching ? 'Aucune phrase ne correspond.' : 'Cette section est vide. Ajoutez la première référence.'}</p>
          )}
          {shown.length > limit && (
            <button onClick={() => setLimit(l => l + PAGE)} className="mt-4 w-full rounded-lg border border-line py-3 text-sm">
              Afficher plus ({shown.length - limit} restantes)
            </button>
          )}
        </main>
      )}
      <span className="sr-only">{session.user.email}</span>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configured) return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl">Supabase n’est pas configuré</h1>
        <p className="mt-3 text-ink/70">Aucune donnée n’est enregistrée tant que les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ne sont pas renseignées (voir README).</p>
      </div>
    </main>
  )
  if (!ready) return null
  return session ? <Encyclopedie session={session} /> : <Login />
}
