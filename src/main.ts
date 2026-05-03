import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import './styles/base.css'
import './styles/tokens.css'
import './styles/aurora.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
