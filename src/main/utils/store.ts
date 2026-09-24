import ElectronStore from 'electron-store'

type Schema = {
  settings: Settings
  session: Session | null
  openRouterApiKey?: string
}

export const store: ElectronStore<Schema> = new ElectronStore()
