import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ModelDetailView from '../views/ModelDetailView.vue'
import TableCreateView from '../views/TableCreateView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/model/:id',
      name: 'model-detail',
      component: ModelDetailView,
      props: true
    },
    {
      path: '/table-create',
      name: 'table-create',
      component: TableCreateView
    }
  ]
})

export default router
