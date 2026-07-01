import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import MusicView from '@/views/MusicView.vue'
import MovieView from '@/views/MovieView.vue'
import RanksView from '@/views/RanksView.vue'
import RandomizerView from '@/views/RandomizerView.vue'
import QuizAdminView from '@/views/QuizAdminView.vue'
import QuizHostView from '@/views/QuizHostView.vue'
import QuizJoinView from '@/views/QuizJoinView.vue'
import QuizPlayerView from '@/views/QuizPlayerView.vue'

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
    {
      path: '/quiz/admin',
      name: 'quiz-admin',
      component: QuizAdminView,
    },
    {
      path: '/quiz/join/:code?',
      name: 'quiz-join',
      component: QuizJoinView,
    },
    {
      path: '/quiz/:code/host',
      name: 'quiz-host',
      component: QuizHostView,
    },
    {
      path: '/quiz/:code/player',
      name: 'quiz-player',
      component: QuizPlayerView,
    },
  ],
})

export default router
