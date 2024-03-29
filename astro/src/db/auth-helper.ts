import {
  Signal,
  useComputed,
  useSignal,
  useSignalEffect
} from '@preact/signals'
import type { Art, SessionInfo } from './account.ts'
import { isValidEmail } from './email.ts'
import { executeCaptcha } from '../lib/utils/recaptcha.ts'
// import { getStore } from '../lib/state/state.ts'

export type AuthState =
  | 'IDLE'
  | 'EMAIL_ENTRY'
  | 'EMAIL_CHECKING'
  | 'EMAIL_INCORRECT'
  | 'CODE_SENT'
  | 'CODE_CHECKING'
  | 'CODE_INCORRECT'
  | 'LOGGED_IN'

export type AuthStage = 'IDLE' | 'EMAIL' | 'CODE' | 'LOGGED_IN'

export const useAuthHelper = (
  initialState: AuthState = 'IDLE',
  initialEmail: string = ''
) => {
  const state = useSignal(initialState)
  const readonlyState = useComputed(() => state.value)
  const stage = useComputed(() => {
    if (state.value.startsWith('EMAIL_')) return 'EMAIL'
    if (state.value.startsWith('CODE_')) return 'CODE'
    if (state.value === 'LOGGED_IN') return 'LOGGED_IN'
    return 'IDLE'
  })
  const isLoading = useComputed(() => state.value.endsWith('_CHECKING'))

  const email = useSignal(initialEmail)
  const emailValid = useComputed(() => isValidEmail(email.value))

  const code = useSignal('')
  const codeValid = useComputed(() => code.value.length === 6)
  useSignalEffect(() => {
    code.value = code.value.replace(/[^0-9]/g, '')
  })

  const startEmailEntry = () => {
    state.value = 'EMAIL_ENTRY'
  }

  const submitEmail = async () => {
    if (!['EMAIL_ENTRY', 'EMAIL_INCORRECT'].includes(state.value)) return
    state.value = 'EMAIL_CHECKING'

    const res = await fetch('/api/auth/email-login-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    })
    if (res.ok) state.value = 'CODE_SENT'
    else {
      state.value = 'EMAIL_INCORRECT'
      console.error(await res.text())
    }
  }

  const submitCode = async () => {
    if (!['CODE_SENT', 'CODE_INCORRECT'].includes(state.value)) return
    state.value = 'CODE_CHECKING'

    const res = await fetch('/api/auth/submit-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, code: code.value })
    })
    if (res.ok) state.value = 'LOGGED_IN'
    else {
      state.value = 'CODE_INCORRECT'
      console.error(await res.text())
    }
  }

  const wrongEmail = () => {
    if (stage.value !== 'CODE') return
    email.value = ''
    code.value = ''
    state.value = 'EMAIL_ENTRY'
  }

  const sendCodeOverride = async (emailIn: string) => {
    email.value = emailIn
    state.value = 'EMAIL_ENTRY'
    await submitEmail()
  }

  return {
    state: readonlyState,
    stage,
    isLoading,
    email,
    emailValid,
    code,
    codeValid,
    startEmailEntry,
    submitEmail,
    submitCode,
    sendCodeOverride,
    wrongEmail
  }
}

export const altPersist = async (
  persistenceState: Signal<PersistenceState>,
  email?: string
) => {
  const isShared = persistenceState.value.kind === 'SHARED'
  const artName: string | undefined =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.name
      : undefined
  const tutorialName =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.tutorialName
      : undefined
  const tutorial =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.tutorial
      : undefined
  persistenceState.value = {
    kind: 'PERSISTED',
    cloudSaveState: 'SAVING',
    art: 'LOADING',
    stale: persistenceState.value.stale,
    session: persistenceState.value.session,
    tutorial
  }

  try {
    const { view } = getStore()
    const code = v
    const res = await fetch('/api/art/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partialSessionEmail: email,
        code: '',
        name: artName,
        tutorialName
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const { art, sessionInfo } = (await res.json()) as {
      art: Art
      sessionInfo: SessionInfo
    }
    if (!isShared)
      document.cookie = `blotTempArt=${art.id};path=/;max-age=${
        60 * 60 * 24 * 365
      }`

    if (persistenceState.value.kind === 'PERSISTED')
      persistenceState.value = {
        ...persistenceState.value,
        cloudSaveState: 'SAVED',
        art,
        session: sessionInfo
      }

    window.history.replaceState(null, '', `/~/${art.id}`)
  } catch (error) {
    console.error(error)
    if (persistenceState.value.kind === 'PERSISTED')
      persistenceState.value = {
        ...persistenceState.value,
        cloudSaveState: 'ERROR'
      }
  }
}

export const persist = async (
  persistenceState: Signal<PersistenceState>,
  email?: string
) => {
  const isShared = persistenceState.value.kind === 'SHARED'
  const artName: string | undefined =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.name
      : undefined
  const tutorialName =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.tutorialName
      : undefined
  const tutorial =
    persistenceState.value.kind === 'SHARED'
      ? persistenceState.value.tutorial
      : undefined
  persistenceState.value = {
    kind: 'PERSISTED',
    cloudSaveState: 'SAVING',
    art: 'LOADING',
    stale: persistenceState.value.stale,
    session: persistenceState.value.session,
    tutorial: tutorial
  }

  try {
    const recaptchaToken = await executeCaptcha('PERSIST_ART')

    const res = await fetch('/api/art/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partialSessionEmail: email,
        code: codeMirror.value?.state.doc.toString() ?? '',
        name: artName,
        tutorialName,
        recaptchaToken
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const { art, sessionInfo } = (await res.json()) as {
      art: Art
      sessionInfo: SessionInfo
    }
    if (!isShared)
      document.cookie = `blotTempArt=${art.id};path=/;max-age=${
        60 * 60 * 24 * 365
      }`

    if (persistenceState.value.kind === 'PERSISTED')
      persistenceState.value = {
        ...persistenceState.value,
        cloudSaveState: 'SAVED',
        art,
        session: sessionInfo
      }

    window.history.replaceState(null, '', `/~/${art.id}`)
  } catch (error) {
    console.error(error)
    if (persistenceState.value.kind === 'PERSISTED')
      persistenceState.value = {
        ...persistenceState.value,
        cloudSaveState: 'ERROR'
      }
  }
}
