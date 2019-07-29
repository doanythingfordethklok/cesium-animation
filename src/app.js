/**
 * Created by richard.becker on 11/6/18.
 * Entry point for the application
 */

import Vue from 'vue'
import App from './App.vue'

Object.defineProperty(Vue.prototype, '$eventBus', { value: new Vue() });

new Vue({
      el: '#app',
      render: h => h(App)
})