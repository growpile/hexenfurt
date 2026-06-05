declare namespace global {
  var uiLayer: LayerSet;
}

@component
export class InputsShowcase extends BaseScriptComponent {
  @input("SceneObject")
  @allowUndefined
  globalUILayer: SceneObject | undefined

  onAwake() {
    global.uiLayer = this.globalUILayer.layer;
    print(global.uiLayer);
  }
}