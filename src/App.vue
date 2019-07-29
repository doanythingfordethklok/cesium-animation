/**
 * Created by richard.becker on 11/6/18.
 * The top level/root component for the application
 */
import '../assets/app.css'


<template>
<div style="background-color:lightblue; height:100vh; width:100vw;">
  <div style = "margin-left:5px;">
    <h3 style="font-family:helvetica;">Cesium Model Animation Player</h3>
  </div>
  <div>
      <CesiumComponent style ="display:inline-block;" :on-mouse-over="cesiumOnMouseOver" :on-entity-selected="cesiumOnEntitySelected"/>
  </div>
</div>
</template>

<script>

import CesiumComponent from './components/CesiumComponent.vue'

export default {
  components: {
    CesiumComponent
  },
  created () {

  },
  methods: {
    rowClicked(event) {
      this.$eventBus.$emit("selectEntity", event.name);
      this.$eventBus.$emit("rowSelected", event);
    },
    cesiumOnMouseOver(event) {

    },
    cesiumOnEntitySelected(event) {

    }
  }
}
</script>
