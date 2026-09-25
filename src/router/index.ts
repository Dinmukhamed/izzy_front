import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import RanksView from '@/views/RanksView.vue'
import RandomizerView from '@/views/RandomizerView.vue'
import QuizGamesView from '@/views/QuizGamesView.vue'
import QuizTemplatesView from '@/views/QuizTemplatesView.vue'
import QuizHostView from '@/views/QuizHostView.vue'
import QuizControlView from '@/views/QuizControlView.vue'
import QuizJoinView from '@/views/QuizJoinView.vue'
import QuizPlayerView from '@/views/QuizPlayerView.vue'

const telegramOnly = () => ('Telegram' in window ? true : { name: 'home' })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/register/:slug',
      name: 'game-registration',
      component: HomeView,
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('@/views/MusicView.vue'),
      beforeEnter: telegramOnly,
    },
    {
      path: '/movies',
      name: 'movies',
      component: () => import('@/views/MovieView.vue'),
      beforeEnter: telegramOnly,
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
      component: QuizGamesView,
    },
    {
      path: '/quiz/games',
      name: 'quiz-games',
      component: QuizGamesView,
    },
    {
      path: '/quiz/templates',
      name: 'quiz-templates',
      component: QuizTemplatesView,
    },
    {
      path: '/quiz/join/:code?',
      name: 'quiz-join',
      component: QuizJoinView,
    },
    {
      path: '/quiz/:code/control',
      name: 'quiz-control',
      component: QuizControlView,
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
