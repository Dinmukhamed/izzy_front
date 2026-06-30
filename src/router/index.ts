import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import MusicView from '@/views/MusicView.vue'
import MovieView from '@/views/MovieView.vue'
import RanksView from '@/views/RanksView.vue'
import RandomizerView from '@/views/RandomizerView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/music',
      name: 'music',
      component: MusicView,
    },
    {
      path: '/movies',
      name: 'movies',
      component: MovieView,
    },
    {
      path: '/rank',
      name: 'rank',
      component: RanksView
    },
    {
      path: '/randomizer',
      name: 'randomizer',
      component: RandomizerView,
    },
  ],
})

export default router
