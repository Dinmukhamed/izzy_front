import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueTelegramPlugin } from 'vue-tg'

import App from './App.vue'
import router from './router'
import axios from 'axios'

const app = createApp(App)

app.use(createPinia())
app.use(router)
if ('Telegram' in window) app.use(VueTelegramPlugin)
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL
app.mount('#app')
